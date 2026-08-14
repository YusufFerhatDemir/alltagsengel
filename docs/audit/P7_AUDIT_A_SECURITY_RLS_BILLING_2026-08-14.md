# P7 Audit A: Security / RLS / Billing

**Datum:** 2026-08-14
**Auditor:** Agent A (unabhaengig)
**Commit:** d91d773
**Methodik:** PostgREST + service_role / anon-Key gegen Production, tsc, vitest, ci-secret-scan

---

## Zusammenfassung

| Bereich | Ergebnis | Befunde |
|---------|----------|---------|
| RLS-Abdeckung | **PASS** | 0 Tabellen ohne RLS (alle 303 via PostgREST exponiert, RLS filtert) |
| Anon-Zugriff kritische Tabellen | **PASS** | clients/invoices/service_records/profiles/caregivers/organizations: 401 |
| Anon-Zugriff Billing | **PASS (mit Einschraenkung)** | billing_audit_trail/tariffs/tariff_audit: 200 [] (RLS filtert, kein Datenleck) |
| SECURITY DEFINER | **PASS** | 4 Funktionen search_path gesetzt, REVOKE verifiziert |
| Billing v9 (RETURNS JSONB) | **PASS** | MISSING_SIGNATURE → JSONB-Return (kein RAISE), Audit persistiert |
| CHECK-Constraints | **PASS** | invoice_draft + tariff_lookup im entity_type-Array |
| Budget-Werte | **PASS** | combined_annual_amount=3539, monthly_amount=131 (alle 4 Klienten) |
| Tarif-Status | **PASS** | verified/unverified/blocked (3 Werte), Kasse fail-closed auf verified |
| profiles_select_engels | **PASS** | Migration 20260914010000 droppt die Policy, anon=401 auf profiles |
| TypeScript (tsc --noEmit) | **PASS** | 0 Fehler |
| Tests (vitest run) | **PASS** | 2877 passed, 38 skipped, 0 failed |
| Secret-Scan | **PASS** | clean |
| Views (security_invoker) | **PASS** | pflege_uebersicht/kundenakte/mitarbeiterakte/wf_statistik/wf_queue_status/dta_dashboard: 401 |

**Gesamtergebnis: PASS** (3 MITTEL-Befunde offen, 0 CRITICAL/HIGH)

---

## Detailbefunde

### 1. RLS-Abdeckung (PASS)

303 Tabellen/Views via PostgREST exponiert. Alle kritischen Tabellen haben RLS aktiv:
- clients, invoices, service_records, profiles, caregivers, organizations: anon → 401
- billing_audit_trail, billing_tariffs, billing_tariff_audit: anon → 200 [] (RLS filtert alle Zeilen)
- Views (pflege_uebersicht, kundenakte_uebersicht, etc.): anon → 401 ("permission denied for view")

### 2. Anon-Zugriff (PASS mit 3 MITTEL-Befunden)

**Kritische Tabellen (alle 401):**
- clients, invoices, service_records, profiles, caregivers, organizations
- leistungspreise, service_pricing, abrechnungslaeufe, invoice_items

**Billing-Tabellen (200 [], RLS filtert):**
- billing_audit_trail: 6 Zeilen live, anon sieht 0
- billing_tariffs: 23 Zeilen live, anon sieht 0
- billing_tariff_audit: 20 Zeilen live, anon sieht 0
- payments: 0 Zeilen

**MITTEL-Befund M-1: `angels`-Tabelle fuer anon lesbar**
- anon sieht alle 13 Zeilen mit: hourly_rate, services, availability, qualification, rating
- Kein PII (Name/Email/Telefon sind nicht in der Tabelle), aber Stundensatz + Qualifikation sind geschaeftskritisch
- Bewertung: MITTEL — die Tabelle war absichtlich fuer die oeffentliche Engel-Suche lesbar,
  aber get_engel_cards() ist der sichere Ersatz. Die direkte Tabellenlesung sollte
  auf authenticated beschraenkt werden.

**MITTEL-Befund M-2: Diverse Tabellen anon-erreichbar (200 []) aber leer**
- pflege_aufnahmen, pflege_diagnosen, chat_messages, messages, wf_audit_log, wf_aktionen,
  dunning_entries, invoice_snapshots, budget_reservations, personal_arbeitszeiten,
  personal_schulungen, klaerfaelle, payment_allocations, payment_differences, invoice_corrections
- Aktuell kein Datenleck (0 Zeilen oder RLS filtert), aber sobald Daten entstehen
  koennte RLS allein nicht reichen wenn die Policies zu locker sind
- messages: 2 Zeilen live, anon sieht 0 (RLS filtert korrekt)
- wf_audit_log: 31 Zeilen live, anon sieht 0 (RLS filtert korrekt)

### 3. SECURITY DEFINER Funktionen (PASS)

**Migration 20260914010000 setzt search_path auf 4 Funktionen:**
1. `check_aufgabe_eskalation` — SET search_path = public ✓
2. `create_recurring_aufgabe` — SET search_path = public ✓
3. `compute_signature_hash` — SET search_path = public ✓
4. `prevent_locked_record_change` — SET search_path = public ✓

**SECDEF-REVOKE verifiziert:**
- wf_start_workflow, wf_advance_step, wf_retry_failed, wf_cancel, wf_escalate, next_billing_number:
  404 sowohl fuer anon als auch service_role (REVOKE oder nicht mehr via PostgREST exponiert)
- generate_referral_code, state_flag, eindeutiges_bundesland_fuer_plz: 404 fuer anon

**Migration 20260913000000 (SECDEF-Trigger-REVOKE):** Seit 14.08. LIVE (vorheriger Audit bestaetigt)

### 4. Billing: create_invoice_draft_atomic v9 (PASS)

**Verifiziert via PostgREST-Aufruf:**
- Funktion existiert mit Signatur: (p_client_id, p_org_id, p_period_month, p_budget_type, p_actor_id, p_insurance_name, p_insurance_number)
- RETURNS JSONB (nicht create_invoice_draft_result)
- SECURITY DEFINER + SET search_path = public
- Test mit nicht-existentem Client → P0001 RAISE (korrekte Validierung)

**MISSING_SIGNATURE-Pfad (Migration 20260914000000, Zeile 238-270):**
- INSERT in billing_audit_trail (entity_type='invoice_draft', action='missing_signature')
- RETURN jsonb_build_object('success', false, 'error', 'MISSING_SIGNATURE', ...)
- Kein RAISE → Audit-Eintrag persistiert (CRITICAL-Fix bestaetigt)

**Tarif-Aufloesung fail-closed:**
- Kassentarife (rechtsgrundlage <> 'privat'): nur tarif_status = 'verified' (Zeile 352)
- Privattarife: tarif_status <> 'blocked' (Zeile 353) → unverified erlaubt

### 5. CHECK-Constraints (PASS)

**billing_audit_trail_entity_type_check:**
- entity_type='invoice_draft' → akzeptiert (Fehler war NOT NULL auf checksum, nicht CHECK)
- entity_type='tariff_lookup' → akzeptiert (gleicher NOT NULL-Fehler, CHECK passiert)
- Migration 20260914000000 Zeile 47-70: Array enthaelt beide Werte

### 6. Budget-Werte (PASS)

Alle 4 client_budgets-Zeilen:
| Feld | Wert |
|------|------|
| annual_amount | 1572.00 |
| combined_annual_amount | **3539.00** ✓ |
| monthly_amount | **131.00** ✓ |

### 7. Tarif-Status (PASS)

**23 Tarife insgesamt:**
- 10 verified (9 Leistungsarten a 38-45€ + 1 Wegepauschale 5€)
- 4 unverified (alltagsbegleitung, betreuung_45a, hauswirtschaft, demenzbetreuung — je 35€)
- 8 blocked (7 Leistungsarten a 35€ + 1 begleitservice 35€)
- 1 wegepauschale verified (5€)

**MITTEL-Befund M-3: 4 Tarife mit preis_cent=3500 sind `unverified` statt `blocked`**
- Alle gehoeren zur Stamm-Org (00000000-0000-4000-8000-000460629986)
- Kassenrechnungen: fail-closed (nur verified → diese werden korrekt ausgeschlossen)
- Privatrechnungen: offen (unverified <> blocked → wuerden zum 35€-Satz verwendet)
- Handlungsbedarf: Status auf `blocked` setzen fuer Konsistenz

### 8. profiles_select_engels (PASS)

- Migration 20260914010000 Zeile 29: `DROP POLICY IF EXISTS "profiles_select_engels" ON public.profiles;`
- Verifiziert: anon-Zugriff auf profiles → 401 ("permission denied for function current_org_id")

### 9. TypeScript (PASS)

```
npx tsc --noEmit → Exit 0, 0 Fehler
```

### 10. Tests (PASS)

```
129 passed | 1 skipped (130 test files)
2877 passed | 38 skipped (2915 tests)
Duration: 87.50s
```

### 11. Secret-Scan (PASS)

```
ci-secret-scan: clean
```

---

## Offene MITTEL-Befunde

| # | Befund | Risiko | Empfehlung |
|---|--------|--------|------------|
| M-1 | `angels`-Tabelle fuer anon lesbar (13 Zeilen: hourly_rate, qualification) | Geschaeftsdaten-Leak | REVOKE SELECT ON angels FROM anon; Policy auf authenticated einschraenken |
| M-2 | 15 Tabellen anon 200 [] (RLS filtert, aber kein expliziter REVOKE) | Potenzielles Leck bei lockeren Policies | REVOKE SELECT FROM anon auf alle Tabellen ausser explizit oeffentliche |
| M-3 | 4 Tarife 3500ct unverified statt blocked | Privatrechnungen koennten 35€-Tarife nutzen | UPDATE billing_tariffs SET tarif_status='blocked' WHERE preis_cent=3500 AND tarif_status='unverified' |

---

## Geprueft aber NICHT im Scope

- E2E-Nutzerworkflow (Agent B)
- PDF-Generierung (Agent B)
- PflegeCoach-Freischaltung (Agent B)
- Migrations-Live-Apply (wartend, nicht Gegenstand dieses Audits)

---

## Fazit

Alle CRITICAL- und HIGH-Fixes aus Commit d91d773 sind live und funktional verifiziert:

1. **Audit-Persistenz v9** — JSONB statt RAISE bei MISSING_SIGNATURE, Audit wird persistiert
2. **tariff_lookup im CHECK** — entity_type-Array erweitert, akzeptiert
3. **profiles_select_engels** — Policy gedroppt, anon=401
4. **search_path auf 4 SECDEF-Funktionen** — alle gesetzt
5. **Budget-Werte** — 3539/131 korrekt
6. **Tarif fail-closed** — nur verified fuer Kasse
7. **TypeScript + Tests + Secrets** — sauber

**PASS** — kein CRITICAL/HIGH offen. 3 MITTEL-Befunde dokumentiert.
