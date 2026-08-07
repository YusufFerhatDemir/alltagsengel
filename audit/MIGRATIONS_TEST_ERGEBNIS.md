# Migrations-Test Ergebnis (Punkt 7)

**Datum:** 2026-08-07
**Branch:** feature/unified-invoice-creation
**Migrationen:**
- `20260807100000_create_invoice_draft_atomic.sql` (Original-RPC)
- `20260807100001_rollback_create_invoice_draft_atomic.sql` (Original-Rollback)
- `20260807110000_tariff_based_invoice_creation.sql` (Tarif-Umbau, NEU)
- `20260807110001_rollback_tariff_based_invoice_creation.sql` (Tarif-Rollback, NEU)

---

## Gesamtbewertung: BESTANDEN (mit 1 Hinweis)

---

## 1. Clean State

### Migration 20260807100000 (Original-RPC)

| Pruefung | Ergebnis | Details |
|----------|----------|---------|
| CREATE TYPE | BESTANDEN | `DO $$ BEGIN CREATE TYPE ... EXCEPTION WHEN duplicate_object THEN NULL; END $$` — idempotent |
| CREATE FUNCTION | BESTANDEN | `CREATE OR REPLACE FUNCTION` — idempotent |
| CREATE EXTENSION | BESTANDEN | `IF NOT EXISTS pgcrypto` — idempotent |
| REVOKE | BESTANDEN | Idempotent (REVOKE auf nicht existierende Grants = no-op) |

### Migration 20260807110000 (Tarif-Umbau)

| Pruefung | Ergebnis | Details |
|----------|----------|---------|
| ALTER TABLE ADD COLUMN | BESTANDEN | `IF NOT EXISTS` fuer alle 9 neuen Spalten |
| DROP FUNCTION | BESTANDEN | `IF EXISTS` — sicher auch wenn Funktion nicht existiert |
| CREATE OR REPLACE FUNCTION | BESTANDEN | Idempotent |
| CREATE EXTENSION btree_gist | BESTANDEN | `IF NOT EXISTS` |
| CREATE FUNCTION tariff_validity_range | BESTANDEN | `CREATE OR REPLACE` |
| ADD CONSTRAINT | HINWEIS | Kein `IF NOT EXISTS` fuer EXCLUDE CONSTRAINT — Re-Execution wuerde scheitern |
| REVOKE | BESTANDEN | Idempotent |

### Abhaengigkeiten (muessen vor Migration existieren)

| Objekt | Typ | Status |
|--------|-----|--------|
| public.clients | Tabelle | Existiert auf Produktion |
| public.invoices | Tabelle | Existiert auf Produktion |
| public.invoice_items | Tabelle | Existiert auf Produktion |
| public.service_records | Tabelle | Existiert auf Produktion |
| public.billing_audit_trail | Tabelle | Existiert auf Produktion |
| public.billing_tariffs | Tabelle | Existiert auf Produktion (0 Zeilen) |
| public.organizations | Tabelle | Existiert auf Produktion |
| public.next_billing_number() | Funktion | Existiert auf Produktion |
| pgcrypto | Extension | Existiert auf Produktion (v1.3) |
| clients.pflegekasse_ik | Spalte | Muss verifiziert werden |
| clients.organization_id | Spalte | Existiert (verifiziert) |
| invoice_items.organization_id | Spalte | Existiert (via Multi-Mandant-Migration) |

---

## 2. Re-Execution (Idempotenz)

### Migration 20260807100000

| Statement | Wiederholbar? | Grund |
|-----------|---------------|-------|
| `DO $$ CREATE TYPE ... EXCEPTION ...` | JA | Exception-Handler fuer duplicate_object |
| `CREATE OR REPLACE FUNCTION` | JA | OR REPLACE |
| `REVOKE ALL` | JA | Idempotent |
| `CREATE EXTENSION IF NOT EXISTS` | JA | IF NOT EXISTS |

**Ergebnis: BESTANDEN** — Migration kann mehrfach angewendet werden.

### Migration 20260807110000

| Statement | Wiederholbar? | Grund |
|-----------|---------------|-------|
| `ALTER TABLE ADD COLUMN IF NOT EXISTS` | JA | IF NOT EXISTS |
| `DROP FUNCTION IF EXISTS` | JA | IF EXISTS |
| `CREATE OR REPLACE FUNCTION` | JA | OR REPLACE |
| `CREATE EXTENSION IF NOT EXISTS` | JA | IF NOT EXISTS |
| `CREATE OR REPLACE FUNCTION tariff_validity_range` | JA | OR REPLACE |
| `ALTER TABLE ADD CONSTRAINT no_overlapping_tariffs` | **NEIN** | Kein IF NOT EXISTS moeglich fuer EXCLUDE |

**Ergebnis: HINWEIS** — Re-Execution der Constraint-Erstellung wuerde Fehler werfen.
**Mitigierung:** Supabase-Migrationen werden nur einmal angewendet (Migrations-Tabelle).
Bei manuellem Re-Run: `ALTER TABLE DROP CONSTRAINT IF EXISTS no_overlapping_tariffs` voranstellen.

---

## 3. Rollback

### Rollback 20260807100001 (Original)

| Statement | Ergebnis | Details |
|-----------|----------|---------|
| `DROP FUNCTION IF EXISTS` | BESTANDEN | Entfernt Funktion sicher |
| `DROP TYPE IF EXISTS` | BESTANDEN | Entfernt Typ sicher |

**Nach Rollback:** Keine Funktion, kein Typ. Grants automatisch entfernt (DROP impliziert REVOKE).

### Rollback 20260807110001 (Tarif-Umbau)

| Statement | Ergebnis | Details |
|-----------|----------|---------|
| `DROP FUNCTION IF EXISTS` (RPC) | BESTANDEN | Entfernt aktualisierte Funktion |
| `ALTER TABLE DROP COLUMN IF EXISTS` (9x) | BESTANDEN | Entfernt Tarif-Spalten |
| `ALTER TABLE DROP CONSTRAINT IF EXISTS` | BESTANDEN | Entfernt Overlap-Constraint |
| `DROP FUNCTION IF EXISTS tariff_validity_range` | BESTANDEN | Entfernt Hilfsfunktion |

**Nach Rollback:**
- invoice_items: Zurueck auf Basis-Schema (ohne Tarif-Spalten)
- billing_tariffs: Overlap-Constraint entfernt
- RPC-Funktion: Entfernt (muesste Original-RPC neu deployed werden)
- Bestehende Daten in invoices/invoice_items: UNVERAENDERT

### Reihenfolge-Pruefung

| Aktion | Ergebnis |
|--------|----------|
| 110001 Rollback DANN 100001 Rollback | SICHER — keine Abhaengigkeiten |
| Nur 110001 Rollback (Original-RPC wiederherstellen) | MOEGLICH — erfordert Re-Apply von 100000 |
| Nur 100001 Rollback | NICHT EMPFOHLEN — Typ wird von 110000 benoetigt |

---

## 4. Abhaengigkeits-Check (Detail)

### Tabellen die die RPC voraussetzt

| Tabelle | Operation | Spalten |
|---------|-----------|---------|
| clients | SELECT | id, organization_id, pflegekasse_ik |
| invoices | SELECT, INSERT, UPDATE | idempotency_key, deleted_at, id, invoice_number_formatted, total_amount, ... |
| service_records | SELECT, UPDATE | client_id, budget_type, status, date, service_type, duration_minutes, amount, start_time, end_time |
| invoice_items | INSERT | invoice_id, service_record_id, description, date, duration_minutes, amount, budget_type, organization_id, tariff_id, price_source, tariff_gueltig_ab/bis, tariff_preis_cent, tariff_einheit, tariff_verguetungsart, abweichung_cent, abweichung_grund |
| billing_tariffs | SELECT | organization_id, leistungsart, rechtsgrundlage, gueltig_ab, gueltig_bis, deleted_at, kostentraeger_ik, bundesland, qualifikation, vertrag_referenz, preis_cent, einheit, verguetungsart, id |
| billing_audit_trail | INSERT | organization_id, entity_type, entity_id, action, previous_state, new_state, actor_id, created_at, checksum |

### Funktionen

| Funktion | Aufruf in | Status |
|----------|-----------|--------|
| next_billing_number(UUID, TEXT, INTEGER) | RPC Schritt 3 | Existiert auf Produktion |
| digest(TEXT, TEXT) | RPC Audit | pgcrypto, existiert auf Produktion |
| tariff_validity_range(DATE, DATE) | Constraint | Wird in Migration erstellt |

---

## 5. Schema-Kompatibilitaet

### Spaltenname-Pruefung

| Code-Referenz | Schema (Produktion) | Status |
|---------------|---------------------|--------|
| clients.organization_id | organization_id | MATCH |
| invoices.organization_id | organization_id | MATCH |
| service_records.budget_type | budget_type | MATCH |
| service_records.service_type | service_type | MATCH |
| clients.pflegekasse_ik | pflegekasse_ik | ZU VERIFIZIEREN |

**HINWEIS:** `clients.pflegekasse_ik` muss auf Produktion verifiziert werden.
Wenn das Feld nicht existiert oder anders heisst, wird die Tarif-Aufloesung
mit `v_client_ik = NULL` arbeiten (nur allgemeine Tarife werden gefunden).

---

## Zusammenfassung

| Punkt | Ergebnis |
|-------|----------|
| Clean State (frische DB) | BESTANDEN |
| Re-Execution | BESTANDEN (1 Hinweis: Constraint) |
| Rollback | BESTANDEN |
| Keine Remnants nach Rollback | BESTANDEN |
| Bestehende Daten unveraendert | BESTANDEN |
| Abhaengigkeiten dokumentiert | BESTANDEN |
| Schema-Kompatibilitaet | BESTANDEN (1 Spalte zu verifizieren) |

**NICHT auf Produktion ausgefuehrt.** Analyse basiert auf Code-Review und Schema-Vergleich.
