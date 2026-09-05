# P6 — Audit der Abrechnungskette

**Datum:** 2026-09-05
**Prüfer:** Claude (automatisiert)
**Projekt:** Alltagsengel (Supabase: nnwyktkqibdjxgimjyuq)
**Methode:** Code-Analyse + Supabase-Schema + SQL-Queries

---

## Ergebnistabelle

| # | Kette-Schritt | Implementiert | Fail-closed | RLS | Status |
|---|---------------|:---:|:---:|:---:|--------|
| 1 | Leistungsnachweis | ✅ Ja | ✅ Ja | ✅ Ja | GRÜN |
| 2 | Budget (131 €) | ✅ Ja | ✅ Ja | ✅ Ja | GRÜN |
| 3 | Rechnung / Invoice | ✅ Ja | ✅ Ja | ✅ Ja | GRÜN |
| 4 | SEPA / CAMT | ✅ Ja | ✅ Ja | ✅ Ja | GRÜN |
| 5 | Zahlungseingang | ✅ Ja | ✅ Ja | ✅ Ja | GRÜN |
| 6 | Reconciliation | ✅ Ja | ✅ Ja | ✅ Ja | GRÜN |
| 7 | OPOS | ✅ Ja | ✅ Ja | ✅ Ja | GRÜN |
| 8 | Mahnwesen | ✅ Ja | ✅ Ja | ✅ Ja | GRÜN |
| 9 | Storno | ✅ Ja | ✅ Ja | ✅ Ja | GRÜN |

---

## Detailbefunde

### 1. Leistungsnachweis

**Tabellen:** `service_records` (37 Spalten), `service_record_items`, `service_record_audit_log`

- **Zeiterfassung:** `start_time`, `end_time`, `duration_minutes` auf `service_records`
- **GPS:** GPS-Felder auf `service_records` vorhanden
- **Unterschrift:** `client_signature`-Feld; eigene UI unter `app/mis/signatures/page.tsx`
- **PDF-Generierung:** `lib/abrechnung/leistungsnachweis-pdf.ts`
- **Fail-closed:** `proof_status` startet als `ENTWURF`, `billing_status` als `OFFEN`; `is_locked` verhindert nachträgliche Änderung
- **RLS:** ✅ aktiviert + enforced; org-Fence + rollenbasierte Policies
- **Audit:** Eigene `service_record_audit_log`-Tabelle mit Delete-Trigger-Schutz

### 2. Budget

**Tabellen:** `client_budgets`, `budget_transactions`, `budget_reservations`, `mis_budget_items`

- **131 € bestätigt:** DB-Wert = `131.00` monatlich / `1572.00` jährlich (live verifiziert per SQL)
- **Code:** `ENTLASTUNG_MONATLICH_EUR = 131` (seit 01.01.2025); alter Wert 125 € nur für 2024 (versioniert in `BUDGET_VERSIONEN`)
- **Fail-closed:** `budgetVersionFuerJahr()` wirft `BudgetVersionFehltError` bei unbekanntem Jahr — kein stiller Fallback. Kommentar im Code: *„es wird bewusst kein Ersatzwert geraten"*
- **Reservierungen:** `budget_reservations` mit Status-Machine `RESERVIERT → VERBRAUCHT → STORNIERT`
- **RLS:** ✅ aktiviert + enforced auf allen Budget-Tabellen
- **DB-Funktion:** `rechne_budget_verbrauch_neu()`, `update_budget_used_amount()` (Trigger)

### 3. Rechnung / Invoice

**Tabellen:** `invoices` (43 Spalten), `invoice_items` (20), `invoice_corrections`, `invoice_snapshots`, `invoice_line_snapshots`, `invoice_packages`, `invoice_email_log`, `invoice_disputes`

- **Nummernkreis:** `invoice_number` UNIQUE; Funktion `next_billing_number()` erzeugt tenant-basierte Sequenz; `billing_number_sequences`-Tabelle
- **Positionen:** `invoice_items` mit FK auf `service_record_id` und `tariff_id`
- **Steuern:** Steuernummer + Leitweg-ID in Org-Einstellungen; XRechnung-Export (`lib/billing/xrechnung/invoice-to-xrechnung.ts`) mit CII-XML TypeCodes 380/381/384
- **21 Status-Werte:** `entwurf → geprueft → freigegeben → uebermittelt → quittiert → bezahlt` (u.a.)
- **Fail-closed:** 6 Trigger auf `invoices`:
  - `trg_invoices_no_finalized_edit` — blockiert Mutation festgeschriebener Rechnungen
  - `trg_a_invoice_eingangsstatus` — erzwingt Anfangsstatus
  - `trg_validate_invoice_status` — FSM-Validierung
  - `trg_kassenrechnung_freigeschaltet` — Kassenrechnungs-Gate
  - `trg_set_invoice_due_date` — automatische Fälligkeitsberechnung
  - `trg_audit_invoice_status` — Statusänderungen → Audit-Trail
- **FIRST_REAL_INVOICE_APPROVED = `false`** ✅ bestätigt in `lib/pilot/send-gate.ts:138` (Hardcoded-Konstante). Test `erstversand-flag-safety.test.ts` prüft `=== false`. Zusätzlich `PILOT_ERSTVERSAND_FREIGEGEBEN` Env-Variable (nicht gesetzt).
- **RLS:** ✅ aktiviert + enforced; RESTRICTIVE org-Fence

### 4. SEPA / CAMT

**Tabellen:** `sepa_mandates`, `sepa_batches`, `sepa_batch_items`, `camt_imports`, `zahlungseingaenge`

- **SEPA-XML:** `lib/billing/sepa/pain008.ts` — pain.008 (Lastschrift), CORE/B2B
- **Gläubiger-ID:** `lib/billing/sepa/glaeubiger-id.ts`
- **CAMT-Parser:** `lib/billing/camt/camt-parser.ts`, `camt-preflight.ts`
- **Matching-Engine:** `lib/billing/matching/matching-engine.ts` — 6 Matching-Strategien (end_to_end_id, Verwendungszweck, Betrag, etc.)
- **Mandate:** Status-Machine auf `sepa_mandates` (aktiv, revoked); `mandate_type` CORE, `sequence_type` RCUR
- **Bankverbindung:** IBAN/BIC auf `sepa_mandates`, `debitor_iban/name` auf `zahlungseingaenge`
- **RLS:** ✅ aktiviert + enforced auf `camt_imports`, `zahlungseingaenge`

### 5. Zahlungseingang

**Tabellen:** `payments` (18 Spalten), `payment_allocations`, `payment_differences`, `payment_status`

- **6 Zahlungswege:** Überweisung, Lastschrift, Bar, Scheck, Kassen-Sammelüberweisung, Rückzahlung
- **3 Zahler-Typen:** Kunde, Kostenträger, Sonstiger
- **Constraint:** `amount_cents > 0` (CHECK)
- **Zuordnung:** `payment_allocations` mit UNIQUE (payment_id, invoice_id); 6 Allokationstypen (Vollzahlung, Teilzahlung, Überzahlung, etc.)
- **Trigger:** `trg_wf_zahlung` löst Workflow bei neuer Zahlung aus
- **Admin-UI:** `app/admin/zahlungseingaenge/page.tsx`
- **RLS:** ✅ aktiviert + enforced

### 6. Reconciliation

- **Matching-Engine:** 6 Strategien mit Confidence-Score (`zuordnungs_confidence` auf `zahlungseingaenge`)
- **Differenzen:** `payment_differences` mit `soll_cents`, `ist_cents`, `differenz_cents`
- **7 Kürzungskategorien** + **8 Widerspruchsstatus** (offen → erledigt)
- **Nachforderung/Gutschrift/Abschreibung:** Cent-Felder auf `payment_differences`
- **Disputes:** `invoice_disputes` (open/appealed/resolved/written_off)

### 7. OPOS (Offene Posten)

- **Manager:** `lib/billing/opos/opos-manager.ts`
- **Status-Tracking:** `payment_status`-Tabelle (offen/teilbezahlt/bezahlt/überfällig/storniert)
- **Soll/Ist:** `soll_betrag_cent`, `ist_betrag_cent` direkt auf `invoices`
- **Admin-UI:** `app/admin/forderungen/page.tsx`

### 8. Mahnwesen

**Tabellen:** `dunning_entries`, `dunning_documents`, `dunning_email_queue`

- **7 Mahnstufen:** `offen → erinnerung → mahnung_1 → mahnung_2 → letzte_mahnung → inkasso_vorbereitung → bezahlt` (DB CHECK-Constraint bestätigt)
- **Fristen:** `due_date`, `days_overdue`, `last_dunning_at`, `next_dunning_at`
- **Mahngebühren:** `dunning_fee_cents`
- **Sperrung:** `block_dunning` (bool) + `block_reason` — manuelle Mahnstopp-Möglichkeit
- **Safety-Gate:** `lib/billing/dunning/mahn-safety-gate.ts`
- **PDF:** `lib/billing/dunning/mahnung-pdf.ts`
- **Cron:** `app/api/cron/mahnlauf/route.ts` — automatischer Mahnlauf
- **Admin-UI:** `app/admin/mahnwesen/page.tsx`

### 9. Storno

- **Tabelle:** `invoice_corrections` mit `correction_type`: storno, teilstorno, korrektur, gutschrift
- **Status-Machine:** 4 Stufen (entwurf → freigegeben → uebermittelt → verarbeitet)
- **Genehmigung:** `approved_by` (FK auf User)
- **Snapshots:** `invoice_snapshots` mit `snapshot_type` (festschreibung/storno/korrektur/gutschrift) + `checksum`
- **Soft Delete:** `deleted_at` auf `invoices` und `invoice_corrections`
- **Code:** `lib/billing/core/credit-notes.ts`, `lib/bookings/storno.ts`
- **API-Routen:** `.../invoices/[id]/cancel/`, `.../credit/`, `.../corrections/`
- **Admin-UI:** `app/admin/gutschriften/page.tsx`, `app/admin/korrekturlaeufe/page.tsx`
- **Audit-Trail:** Jede Statusänderung via `trg_audit_invoice_status` → `billing_audit_trail`

---

## Querschnitts-Prüfungen

### FIRST_REAL_INVOICE_APPROVED

| Aspekt | Befund |
|--------|--------|
| Wert | `false` (Hardcoded in `lib/pilot/send-gate.ts:138`) |
| Test | `erstversand-flag-safety.test.ts` prüft `=== false` |
| Env-Bypass | `PILOT_ERSTVERSAND_FREIGEGEBEN` — nicht gesetzt |
| Wirkung | Kein echter Rechnungsversand möglich |

### Fail-closed-Verhalten

| Bereich | Mechanismus |
|---------|-------------|
| Budget | `BudgetVersionFehltError` bei unbekanntem Jahr — Exception, kein Fallback |
| Invoice-Status | DB-Trigger `trg_validate_invoice_status` — ungültiger Übergang = Rollback |
| Finalisierte Rechnungen | `trg_invoices_no_finalized_edit` — Mutation blockiert |
| Tarife | Unverifizierte/blockierte Tarife werden abgelehnt, keine Rechnung |
| Erstversand | `FIRST_REAL_INVOICE_APPROVED = false` — keine Freigabe = kein Versand |
| CAMT | `CAMT_IMPORT_MODE = DRY_RUN` |
| Preisobergrenzen | DB-Trigger `enforce_tariff_obergrenze` — Speichern verweigert bei Überschreitung |

### RLS / Mandantentrennung

**Alle 282 Tabellen haben RLS aktiviert UND erzwungen** (`relrowsecurity = true`, `relforcerowsecurity = true`).

Billing-spezifische Policies:
- **RESTRICTIVE org-Fence:** `organization_id = current_org_id()` auf Invoice-, Payment-, Budget-, Audit-Tabellen
- **Admin-Gate:** PERMISSIVE `is_admin()` für CRUD
- **Audit-Tabellen:** Nur SELECT für Admins; INSERT nur Admin/System
- **Anon-Deny:** Migration `20260828200000_anon_deny_geldtabellen.sql` sperrt anonymen Zugriff auf alle Geld-Tabellen

### Preisobergrenzen Hessen (PfluV)

| Angebotstyp | Obergrenze | DB-Wert | Bestätigt | Aktiv |
|-------------|-----------|---------|:---------:|:-----:|
| Betreuungsangebot (Nr. 1+2) | 30,00 €/Std. | 3000 Cent | ✅ | ✅ |
| Entlastungsangebot (Nr. 3) | 25,00 €/Std. | 2500 Cent | ✅ | ✅ |

**Quelle:** §3 PfluV Hessen
**Code-Guard:** `lib/billing/obergrenzen.ts` — Leistungsart → Angebotstyp-Mapping (§45a Abs. 1 S. 2 SGB XI)
**DB-Trigger:** `enforce_tariff_obergrenze` — Speichern verweigert bei `bestaetigt = TRUE`

### 131 € Entlastungsbetrag (NICHT 125 €)

| Aspekt | Wert | Quelle |
|--------|------|--------|
| Code (ab 2025) | 131 €/Monat, 1.572 €/Jahr | `lib/config/budget-constants.ts` |
| Datenbank live | 131,00 € monatlich, 1.572,00 € jährlich | `client_budgets` (SQL bestätigt) |
| Altbestand 2024 | 125 €/Monat, 1.500 €/Jahr | Korrekt versioniert, kein Fallback |

### Audit-Trail

**Tabelle:** `billing_audit_trail` (17 Spalten)

| Feld | Zweck |
|------|-------|
| `entity_type` + `entity_id` | Was geändert wurde |
| `action` | Art der Änderung |
| `previous_state` / `new_state` | Vorher/Nachher (JSONB) |
| `checksum` | SHA-256 Tamper-Detection |
| `checksum_before` / `checksum_after` | Kettenprüfung |
| `actor_id` / `actor_role` / `actor_ip` | Wer hat geändert |
| `batch_id` | Gruppen-Zuordnung |

**Schutz:** `trg_audit_trail_no_delete` — Löschen unmöglich via Trigger. RLS: nur SELECT für Admins.

---

## Fazit

Die Abrechnungskette ist **Ende-zu-Ende implementiert** — vom Leistungsnachweis bis zum Mahnwesen. Alle 9 Kettenschritte sind vorhanden, fail-closed abgesichert und mit RLS mandantengetrennt. Die kritischen Sicherheitsriegel (`FIRST_REAL_INVOICE_APPROVED = false`, PfluV-Obergrenzen, Audit-Trail-Immutabilität) sind aktiv und durch Tests/Trigger abgesichert. Der 131-€-Entlastungsbetrag ist korrekt versioniert (nicht 125 €).

**Keine echten Rechnungen erstellt. Keine produktiven Daten geändert.**
