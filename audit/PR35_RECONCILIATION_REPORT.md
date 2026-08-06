# PR #35 — Production Drift Reconciliation Report

**Datum:** 2026-08-06
**Ergebnis:** GO fuer PR #36 — mit Auflagen
**Reconciliation-Branch:** `fix/pr35-reconciliation` (Commit `9f020ef`, gepusht, NICHT gemergt)

---

## Phase 1: Hotfix-Abgleich (Git vs. Produktion)

### Hotfix 1: period_end Typo

| Feld | Wert |
|---|---|
| Problem | `NEW.period_end IS DISTINCT FROM NEW.period_end` (verglich NEW mit sich selbst) |
| Fix auf Produktion | `CREATE OR REPLACE FUNCTION` mit `OLD.period_end` |
| In Git (Migration) | `20260806200000_billing_core_corrections.sql` Zeilen 410-414 — korrekt mit `OLD.period_end` |
| Prod-Verifizierung | `pg_proc.prosrc` geprueft — `OLD.period_end` korrekt |
| Drift | KEINER — Git-Migration war schon korrekt, der Typo entstand bei manueller Ausfuehrung |
| Reconciliation noetig | Nein |

### Hotfix 2: invoices_status_check Constraint

| Feld | Wert |
|---|---|
| Problem | CHECK erlaubte nur 6 englische Werte, deutsche Status blockiert |
| Fix auf Produktion | DROP + ADD mit 19 Werten (6 EN + 13 DE) |
| In Git (vor Reconciliation) | NICHT in einer Migration erfasst |
| Drift | JA — Produktion hatte 19 Werte, Git nur 6 |
| Reconciliation | Migration `20260806300000_pr35_reconciliation_status_constraint.sql` erstellt |

### Reconciliation-PR

| Feld | Wert |
|---|---|
| Branch | `fix/pr35-reconciliation` |
| Commit | `9f020ef` |
| Forward-Migration | `20260806300000_pr35_reconciliation_status_constraint.sql` — DROP IF EXISTS + ADD mit 19 Werten |
| Rollback-Migration | `20260806300001_rollback_pr35_reconciliation.sql` — stellt 6 EN-Werte wieder her |
| PR #35 Rollback erweitert | `20260806200001_rollback_billing_core_corrections.sql` — Constraint-Wiederherstellung hinzugefuegt |
| Tests | `__tests__/billing/status-constraint.test.ts` — 9/9 bestanden |
| Status | Gepusht, NICHT gemergt (wie angewiesen) |

---

## Phase 2: Status-Mapping-Matrix

### 2.1 Vollstaendige Mapping-Matrix

| EN (Legacy) | DE (Neu) | Konfidenz | Begruendung |
|---|---|---|---|
| draft | entwurf | SICHER | 1:1 semantisch identisch. Rechnung erstellt, noch nicht geprueft |
| sent | uebermittelt | SICHER | Beide = an Kostentraeger gesendet. Admin-UI setzt `sent_at` bei Statuswechsel |
| paid | bezahlt | SICHER | 1:1 identisch. Endstatus in beiden Systemen |
| partial | teilweise_bezahlt | SICHER | Beide = Teilzahlung eingegangen. Admin-UI setzt paid_amount < total_amount |
| rejected | abgelehnt | SICHER | Beide = Kostentraeger hat abgelehnt |
| disputed | **FACHLICHE ENTSCHEIDUNG** | — | Siehe Abschnitt 2.2 |

### 2.2 Analyse: Status "disputed"

**Bedeutung im Legacy-System (Code-Analyse):**
- `lib/admin/ops.ts`: Label = "Strittig", Farbe = #FF7043 (Orange)
- `app/admin/invoices/page.tsx`: Behandlung identisch zu `sent` und `partial` — Zahlung kann erfasst werden
- `app/admin/dashboard/page.tsx`: Zaehlt als "offen" (zusammen mit draft, sent, partial)
- Bei Zahlung mit Differenz: `invoice_disputes`-Eintrag wird erstellt (original_amount, paid_amount, difference, reason)
- Es ist ein CATCH-ALL fuer "Zahlungsstreit" — semantisch enger als das deutsche Modell

**Moegliche deutsche Zielstatus:**

| Option | Deutscher Status | Erlaubte Folge-Status | Risiko |
|---|---|---|---|
| A | `gekuerzt` | korrektur_erforderlich, akzeptiert, storniert | Am naechsten zur Semantik "Kuerzung durch Kostentraeger". Risiko: Falls disputed NICHT wegen Kuerzung, sondern aus anderem Grund |
| B | `korrektur_erforderlich` | entwurf, storniert | Passt wenn Rechnung korrigiert werden muss. Risiko: Schraenkt Folge-Optionen staerker ein |
| C | `abgelehnt` | erneut_eingereicht, storniert | Nur bei vollstaendiger Ablehnung. Risiko: Zu restriktiv — disputed ≠ rejected |
| D | Kein automatisches Mapping | Einzelfallpruefung | Am sichersten bei unklarer Semantik |

**Empfehlung: Option D — Manuelle Einzelfallpruefung**

Begruendung:
1. Es gibt nur 1 Rechnung mit Status `disputed` auf Produktion
2. "Disputed" ist semantisch mehrdeutig — es kann Kuerzung, Widerspruch, oder fehlende Unterlagen bedeuten
3. Die `invoice_disputes`-Tabelle hat Felder fuer `can_appeal`, `missing_document`, `budget_exceeded` — der Grund bestimmt den korrekten deutschen Status
4. Ein falsches automatisches Mapping koennte den Workflow blockieren oder falsche Folgezustaende ermoeglichen
5. Kein Zeitdruck — Legacy-Status bleiben durch den erweiterten CHECK-Constraint gueltig

**Wichtig:** Solange kein Backfill stattfindet, funktionieren BEIDE Systeme parallel. Der `disputed`-Wert bleibt gueltig und der alte Admin-UI kann ihn weiterhin verarbeiten. Eine Entscheidung ist erst vor PR #36 noetig, wenn ein einheitliches Statussystem eingefuehrt wird.

### 2.3 Code-Scan: Englisch vs. Deutsch

#### Dateien mit ENGLISCHEN Status (Legacy-Admin)

| Datei | Verwendete Status | Kontext |
|---|---|---|
| `app/admin/invoices/page.tsx` | draft, sent, paid, partial, disputed, rejected | Haupt-Rechnungsverwaltung |
| `app/admin/dashboard/page.tsx` | draft, sent, partial, disputed | Dashboard-Zusammenfassung |
| `app/api/billing/auto-invoice/route.ts` | draft | Automatische Rechnungserstellung |
| `lib/admin/ops.ts` | draft, sent, paid, partial, rejected, disputed | INVOICE_STATUS Map mit DE-Labels |
| `app/admin/rechnungserstellung/page.tsx` | draft | Manuelle Rechnungserstellung |
| `app/admin/monatsabschluss/[clientId]/page.tsx` | draft, sent | Monatsabschluss |

#### Dateien mit DEUTSCHEN Status (Neues Billing PR #35)

| Datei | Verwendete Status | Kontext |
|---|---|---|
| `lib/billing/core/status-machine.ts` | Alle 13 deutschen | Statusmaschine (TypeScript-Typen) |
| `lib/billing/core/invoice-engine.ts` | entwurf, geprueft, freigegeben, storniert | Billing-Engine |
| `app/admin/abrechnung/page.tsx` | uebermittelt | Abrechnungsseite |
| `app/admin/zahlungskontrolle/page.tsx` | bezahlt, storniert | Zahlungskontrolle |

#### Inkonsistenz (BUG)

| Datei | Problem |
|---|---|
| `app/api/billing/auto-invoice/route.ts` (Zeile 251) | Erstellt Rechnungen mit `status: 'draft'` (englisch), obwohl es eine PR #35 Billing-Route ist. Sollte `'entwurf'` verwenden. |

#### EDIFACT/Export-Impact

| Komponente | Invoice-Status-Nutzung | Auswirkung |
|---|---|---|
| `lib/abrechnung/edifact-generator.ts` | KEINE — generiert aus Verordnungen/Leistungsnachweisen | Kein Impact |
| `lib/abrechnung/monatsabschluss.ts` | Nur service_records Status (complete, signed, invoiced) | Kein Impact |
| `lib/abrechnung/leistungsnachweis-pdf.ts` | Nur service_records Status | Kein Impact |
| `billing_audit_trail` | Speichert old_status/new_status als text | Zeichnet beide Systeme korrekt auf |

#### Mixed-Mode Risiko-Bewertung

**Aktuelles Risiko: GERING**
- Beide Status-Sets sind durch den CHECK-Constraint erlaubt
- Legacy-Admin und neues Billing-System arbeiten auf VERSCHIEDENEN Rechnungen
- Legacy-Rechnungen (EN-Status) werden vom alten Admin verwaltet
- Neue Rechnungen (DE-Status) werden vom neuen Billing-Engine verwaltet
- Der neue Trigger (`trg_validate_invoice_status`) validiert NUR deutsche Status-Uebergaenge — englische Status werden durchgelassen (kein IF-Block dafuer)

**Langfristiges Risiko: MITTEL**
- Wenn Legacy-Admin versucht, eine neue DE-Status-Rechnung zu bearbeiten → Statuswechsel wird vom Trigger blockiert (da EN-Werte nicht in der Transition-Map sind)
- Wenn neues Billing versucht, eine Legacy-EN-Rechnung zu bearbeiten → Statuswechsel wird blockiert (da EN-Werte nicht in InvoiceStatus-Type sind)
- Loesung: PR #36 sollte die Migration der Legacy-Status planen (Backfill EN→DE)

---

## Phase 3: Staging-DB

### 3.1 Staging-Tabellen (`rpkdwwurewpmgmemhdje`)

Nur 10 Tabellen vorhanden:
`bookings`, `chat_messages`, `krankenfahrt_providers`, `krankenfahrten`, `messages`, `mis_ai_conversations`, `notifications`, `organization_members`, `organizations`, `profiles`

**Fehlende Billing-Tabellen:** invoices, invoice_items, invoice_disputes, billing_tariffs, invoice_snapshots, invoice_corrections, invoice_line_snapshots, billing_number_sequences, billing_audit_trail — und ~90 weitere Produktionstabellen.

### 3.2 Staging-Migrationshistorie

| Version | Name |
|---|---|
| 20260805221233 | core_profiles_table |
| 20260806010716 | staging_01_organizations |
| 20260806010747 | staging_02b_add_deleted_at_and_helpers |
| 20260806010759 | staging_03_mis_ai_conversations_base |
| 20260806010812 | org_fence_mis_ai_conversations |
| 20260806072147 | harden_notifications_insert |

**6 Staging-Migrationen vs. 100+ Produktions-Migrationen.**

### 3.3 Produktions-Migrationshistorie (Auszug Billing)

| Version | Name |
|---|---|
| 20260630201623 | create_invoices_tables |
| 20260806120814 | billing_core_corrections (PR #35) |
| 20260806120846 | billing_core_rls_triggers (PR #35) |

PR #35 Migrationen sind in der Produktions-Migrationsliste eingetragen. Die Reconciliation-Migration (`20260806300000`) ist NICHT eingetragen — korrekt, da sie als direktes SQL angewendet wurde und der Reconciliation-Branch noch nicht gemergt ist.

### 3.4 Staging-Bewertung

**Staging ist NICHT auf Produktionsschema.** Die Reconciliation-Migration kann dort nicht angewendet werden, da die `invoices`-Tabelle nicht existiert.

**Empfehlung:** Staging komplett auf Produktionsschema bringen (separate Aufgabe, nicht Teil dieser Reconciliation). Optionen:
1. Alle Produktions-Migrationen auf Staging ausfuehren (komplex, viele Abhaengigkeiten)
2. Supabase-Branches statt separatem Staging-Projekt verwenden
3. Schema-Dump von Produktion auf Staging anwenden (ohne Daten)

---

## Phase 4: Produktions-Verifizierung (READ-ONLY)

### 4.1 CHECK-Constraint auf Produktion

```
invoices_status_check: 19 Werte (6 EN + 13 DE) — KORREKT
invoices_transmission_status_check: 5 Werte — KORREKT
```

### 4.2 Trigger auf Produktion

| Trigger | Status | Funktion |
|---|---|---|
| trg_invoices_no_finalized_edit | Aktiv (O) | Blockiert Updates bei versendet/bezahlt/storniert |
| trg_validate_invoice_status | Aktiv (O) | 13-State Statusmaschine + frozen_at-Schutz |

### 4.3 Trigger-Funktion (period_end Fix)

```
OLD.period_end IS DISTINCT FROM NEW.period_end — KORREKT
```

Verifiziert via `pg_proc.prosrc` — der Fix ist persistent.

---

## Zusammenfassung

### Was wurde getan

1. Beide Hotfixes (period_end + CHECK-Constraint) auf Produktion verifiziert
2. CHECK-Constraint-Drift in reproduzierbarer Migration erfasst (Reconciliation-Branch)
3. Rollback-Migration fuer PR #35 um Constraint-Wiederherstellung erweitert
4. 9 Unit-Tests fuer Constraint-Migrationen erstellt (alle bestanden)
5. Vollstaendige Status-Mapping-Matrix mit disputed-Analyse erstellt
6. Code-Scan aller Dateien mit EN/DE Status durchgefuehrt
7. EDIFACT/Export-Impact ausgeschlossen
8. Staging-DB-Zustand dokumentiert
9. Produktions-Schema und Trigger-Zustand verifiziert

### Offene Punkte (Auflagen fuer PR #36)

| # | Auflage | Prioritaet | Beschreibung |
|---|---|---|---|
| 1 | Reconciliation-PR mergen | HOCH | Branch `fix/pr35-reconciliation` nach Review mergen |
| 2 | disputed-Mapping entscheiden | HOCH | 1 Rechnung — manuelle Einzelfallpruefung empfohlen (Option D) |
| 3 | auto-invoice Bug fixen | MITTEL | `app/api/billing/auto-invoice/route.ts` erstellt mit 'draft' statt 'entwurf' |
| 4 | Legacy-Backfill planen | MITTEL | Strategie fuer Migration der 5 Legacy-Rechnungen (EN→DE) |
| 5 | Staging auf Produktionsschema | NIEDRIG | Staging hat keine invoices-Tabelle, separate Aufgabe |

---

## GO/NO-GO fuer PR #36

### GO — mit Auflagen

**Begruendung:**
- Produktion ist konsistent: Trigger, Constraint und Migration stimmen ueberein
- Beide Hotfixes sind verifiziert und persistent
- Der Reconciliation-Branch macht den Constraint-Fix reproduzierbar
- Mixed-Mode (EN + DE) ist kurzfristig sicher — beide Status-Sets koexistieren
- Kein EDIFACT/Export-Impact durch das duale Status-System
- Das einzige semantische Risiko (`disputed` → ?) betrifft 1 Rechnung und ist nicht blockierend

**Auflagen VOR PR #36:**
1. Reconciliation-PR mergen (`fix/pr35-reconciliation`)
2. Fachliche Entscheidung fuer `disputed`-Mapping treffen
3. auto-invoice Route auf deutschen Status umstellen

**Sicherheitsprotokoll:**

| Regel | Eingehalten |
|---|---|
| Keine Produktionsdaten veraendert | Ja — nur READ-ONLY Schema/Metadaten |
| Keine Produktionsdaten kopiert/exportiert | Ja |
| Nur Metadaten und Schema-Definitionen gelesen | Ja |
| Keine Secrets in Chat/Logs/Commits | Ja |
| Kein Legacy-Backfill ausgefuehrt | Ja |
| Keine Statusentscheidung ohne gesicherte Grundlage | Ja — disputed als offene Frage markiert |
| PR #36 nicht gestartet | Ja |
