# Phase 2/3/4 Reverify — Production Database, Kassenabrechnung, Datenintegrität

**Stand:** 14.08.2026 · **Basis:** `docs/ABSCHLUSSBERICHT_FINAL_2026-08-14.md` (9a51d38) +
Commit `7d621bb` · **Datenbank:** Supabase Production `nnwyktkqibdjxgimjyuq`

**Methodik.** Kein Supabase-MCP in dieser Session verfügbar. Alle Prüfungen liefen
über `scripts/verify-phase2-3-4-stabilisierung.mjs` gegen die **laufende
Produktionsdatenbank** via `service_role`-RPC (`_run_sql`), gewrappt in
`DO $$ … RAISE EXCEPTION $$`-Blöcken. **Ausschließlich `SELECT`, kein DDL, kein
DML — vollständiger Rollback bei jeder Prüfung.** 32 Einzelprüfungen, Ergebnis:
**28 PASS / 2 FAIL / 1 SKIP / 1 INFO.**

---

## Phase 2 — Production Database Reverify

### 1) Fix-Migrationen (M-1…M-6, P0, H-1, H-2)

| Befund | Prüfung | Ergebnis |
|---|---|---|
| P0 | `check_billing_gate` ohne `kasse_status` im Body | ✅ PASS |
| H-1 | `create_invoice_draft_atomic` mit `MISSING_SIGNATURE` im Body | ✅ PASS |
| H-2 | Klienten mit PG≥2 ohne `combined_annual_amount` | ✅ PASS — 0 Treffer |
| M-1 | `validate_correction_atomic` + `create_credit_note_atomic` live | ✅ PASS — beide vorhanden |
| M-2 | 4 Immutability-Trigger (`trg_immutable_sr_audit_*`, `trg_immutable_as_audit_*`) | ✅ PASS — alle vorhanden |
| M-3 | `trg_sync_clients_pflegegrad` | ✅ PASS — vorhanden |
| M-4 | `service_type` im Finalisierungsschutz (`prevent_finalized_service_record_mutation`) | ✅ PASS — enthalten |
| M-6 | `sent`-Rechnungen mit 14-Tage-Zahlungsziel + `due_date` | ✅ PASS — 0 Abweichungen |

**Zusatzbefund H-3 (bereits im Vorbericht dokumentiert, hier erneut bestätigt):**
❌ **FAIL** — `supabase/migrations/20260912000000_audit_entity_type_invoice_draft.sql`
ist **weiterhin nicht angewendet**. `billing_audit_trail_entity_type_check` erlaubt
`invoice_draft` noch nicht. Siehe Phase 3, Detail unten.

### 2) Schema-Drift

⏭️ **SKIP** — `supabase_migrations.schema_migrations` ist für `service_role` nicht
lesbar (`42501 permission denied for schema supabase_migrations`). Das ist eine
Berechtigungsgrenze, kein Datenbefund. Kompensiert durch die Objektpräsenz-Prüfungen
in Abschnitt 1, 3 und 4: alle dort geprüften Funktionen/Trigger aus dem lokalen
Migrationsbestand sind live vorhanden, mit der einen bekannten Ausnahme H-3.
**Ein vollständiger Datei-für-Datei-Abgleich bleibt offen** — dafür wird Zugriff auf
`supabase_migrations` oder das Supabase-Dashboard/MCP benötigt.

### 3) Kritische Funktionen

✅ **PASS** — `check_billing_gate`, `create_invoice_draft_atomic`,
`validate_correction_atomic`, `create_credit_note_atomic`, `state_flag`,
`validate_invoice_status_transition` — alle 6 vorhanden.

### 4) Kritische Trigger

✅ **PASS** — `trg_check_billing_gate` und `trg_sr_bundesland` und
`trg_compute_signature_hash` auf `service_records` korrekt verdrahtet;
`prevent_service_record_audit_edit()`, `prevent_assignment_audit_edit()`,
`sync_clients_pflegegrad()` sind aktiv als Trigger-Funktionen gebunden.

### 5) RLS auf kritischen Tabellen

✅ **PASS** — RLS aktiv auf `clients`, `service_records`, `invoices`,
`invoice_items`, `client_budgets`, `assignments`, `billing_tariffs`,
`leistungspreise`, `payments`, `billing_audit_trail` (10/10).
✅ **PASS** — gesamte `public`-Abdeckung: 0 Tabellen ohne RLS.

### 6) CHECK-Constraints

✅ **PASS** — `invoices_status_check` enthält `'abgeschrieben'`.

### 7) Verwaiste/fehlerhafte Objekte

✅ **PASS** — 0 Trigger ohne zugehörige Funktion.
✅ **PASS** — 0 SECURITY-DEFINER-Funktionen ohne `search_path`.
✅ **PASS** — 0 invalide Indizes (`indisvalid = false`).
✅ **PASS** — 0 nicht validierte Constraints (`convalidated = false`).

---

## Phase 3 — Kassenabrechnungs-Reverify

| Prüfung | Ergebnis |
|---|---|
| `check_billing_gate()` ruft `state_flag()` statt `kasse_status` | ✅ PASS |
| `create_invoice_draft_atomic` v8 — Unterschriftsprüfung (`proof_status`/`signature_hash`) fail-closed im Body | ✅ PASS |
| Billing-Spalte `preis_cent` existiert | ✅ PASS — in `leistungspreise`, `billing_tariffs`, `verordnung_leistungen`, `v_tarife_ohne_beleg` |
| `betrag_cent` als Nebenbefund | ℹ️ INFO — existiert in `coach_bestellungen`, `coach_zahlungen`, `billing_wegepauschalen`, `dta_lauf_rechnungen`, `zahlungseingaenge`, `billing_preisschichten_uebersicht`. Alles eigenständige Domänen (PflegeCoach-Selbstzahler, Wegepauschale, DTA-Rechnungen, Zahlungseingänge) — **kein** aktives Tarif-/Preisfeld, das `preis_cent` konkurriert |
| `tarif_status` (verified/unverified/blocked) auf `billing_tariffs` | ✅ PASS — CHECK live: `ANY (ARRAY['verified','unverified','blocked'])` |
| Budget-Konstante VP/KZP = 3.539 € | ✅ PASS — einziger live gesetzter Wert in `client_budgets.combined_annual_amount` |
| Budget-Konstante Entlastung = 131 €/Monat | ✅ PASS — einziger live gesetzter Wert in `client_budgets.monthly_amount` |
| Negativtest: Kasse ohne Freischaltung → geparkt | ✅ PASS (informativ) — alle Bundesländer `insurance_enabled=false` / `kassenrechnung_enabled=false`; jeder Kassenweg wird am Gate auf `KASSENABRECHNUNG_NOCH_NICHT_FREIGESCHALTET` geparkt, nirgends auf `OFFEN` durchgereicht |
| Unterschriftsprüfung: Rechnung ohne Unterschrift → `MISSING_SIGNATURE`-Audit-Eintrag möglich | ❌ **FAIL — H-3 weiterhin offen** |

**Detail H-3 (kritisch für den Bericht, deckungsgleich mit Vorbericht):**
Der `entity_type`-CHECK auf `billing_audit_trail` lässt `'invoice_draft'` noch
nicht zu. Beim Abbruch wegen fehlender Unterschrift versucht die RPC zuerst den
Audit-`INSERT` mit `entity_type='invoice_draft'` — dieser schlägt mit `23514`
fehl, **bevor** `MISSING_SIGNATURE` geworfen wird. Die Sperre selbst hält (keine
Rechnung ohne Unterschrift entsteht), aber die Abrechnungskraft sieht den
Constraint-Text statt der Sperrbegründung, und der forensische Audit-Eintrag
entsteht nicht.

**Fix bereits geschrieben, nicht angewendet:**
`supabase/migrations/20260912000000_audit_entity_type_invoice_draft.sql`
(+ Rollback-Datei, idempotent, additiv). **Kann nicht autonom angewendet werden** —
`service_role` besitzt `billing_audit_trail` nicht (`42501 must be owner of table`),
DDL erfordert den Supabase-SQL-Editor. Unverändert gegenüber dem Vorbericht vom
selben Tag: **dieser eine Schritt braucht Yusuf persönlich.**

---

## Phase 4 — Datenintegrität

| Prüfung | Ergebnis |
|---|---|
| Kein Klient mit PG≥2 und `combined_annual_amount = 0` | ✅ PASS — 0 Zeilen |
| Gegenprobe: PG-1-Klienten ohne §42a-Anspruch (`combined_annual_amount > 0`) | ✅ PASS — 0 Zeilen |
| Alle `sent`/`paid`-Rechnungen: `payment_terms_days` und `due_date` konsistent gesetzt | ✅ PASS — 0 Abweichungen |
| Keine doppelten Rechnungsnummern | ✅ PASS — 0 Duplikate |

---

## Zusammenfassung

**28 PASS / 2 FAIL / 1 SKIP / 1 INFO** von 32 Einzelprüfungen. Die 2 FAIL sind
**derselbe** Befund (H-3) aus zwei Blickwinkeln geprüft — kein neuer Fund, sondern
die Bestätigung, dass der im Bericht vom selben Nachmittag (`docs/ABSCHLUSSBERICHT_FINAL_2026-08-14.md`)
dokumentierte offene Punkt seither **unverändert offen** ist. Alle übrigen
P0/H-1/H-2/M-1…M-6-Fixes sowie RLS, Constraints, Budget-Konstanten und
Datenintegrität sind live bestätigt.

**Einziger technischer Rest-Schritt (unverändert):** `20260912000000_audit_entity_type_invoice_draft.sql`
im Supabase-SQL-Editor ausführen. Danach ist auch dieser letzte Punkt geschlossen.

**Werkzeug für künftige Reverifies:** `scripts/verify-phase2-3-4-stabilisierung.mjs`
— nebenwirkungsfrei, wiederholbar, `SUPABASE_SERVICE_ROLE_KEY` aus `.env.local`/`.env`.
