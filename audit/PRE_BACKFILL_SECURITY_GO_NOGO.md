# Pre-Backfill Security — GO/NO-GO Bericht

**Datum:** 2026-08-06
**Branch:** fix/pre-backfill-security
**Supabase-Projekt:** nnwyktkqibdjxgimjyuq

---

## Ergebnis: ✅ GO (mit Einschränkung)

Alle Arbeitspakete (AP1–AP5) abgeschlossen. Einzige Einschränkung: Supabase-Branch-Staging konnte nicht vollständig durchlaufen (bekannte Limitation, siehe AP5). PGlite-Tests decken die Kernlogik vollständig ab.

---

## AP1: Audit-Trail absichern ✅

**Migration:** `20260806600000_audit_security.sql`
**Rollback:** `20260806600002_rollback_audit_security.sql`

| Maßnahme | Status |
|----------|--------|
| actor_id nullable (Migrationen ohne auth-Kontext) | ✅ |
| FK zu auth.users entfernt (Log-Tabelle) | ✅ |
| migration_id Spalte hinzugefügt | ✅ |
| checksum_before / checksum_after Spalten | ✅ |
| Immutabilitäts-Trigger (UPDATE blockiert) | ✅ PGlite-Test bestanden |
| Immutabilitäts-Trigger (DELETE blockiert) | ✅ PGlite-Test bestanden |
| Status-Audit-Trigger auf invoices | ✅ PGlite-Test bestanden |
| Kein Audit bei gleichem Status | ✅ PGlite-Test bestanden |
| Idempotenz (OR REPLACE, IF NOT EXISTS) | ✅ |
| Rollback-Migration vorhanden | ✅ |

---

## AP2: Finalized-Edit-Schutz korrigieren ✅

**Migration:** `20260806600001_fix_finalized_edit.sql`
**Rollback:** `20260806600003_rollback_fix_finalized_edit.sql`

| Maßnahme | Status |
|----------|--------|
| Geschützte Status: alle ab freigegeben + Legacy-EN | ✅ |
| Content-Änderung blockiert (uebermittelt) | ✅ PGlite-Test bestanden |
| Content-Änderung blockiert (bezahlt) | ✅ PGlite-Test bestanden |
| Content-Änderung blockiert (Legacy sent) | ✅ PGlite-Test bestanden |
| Workflow-Felder erlaubt (paid_amount, notes, status) | ✅ PGlite-Test bestanden |
| Entwurf frei editierbar | ✅ PGlite-Test bestanden |
| Geprüft frei editierbar | ✅ PGlite-Test bestanden |
| Feldliste aus status-machine.ts abgeleitet | ✅ |
| Rollback-Migration vorhanden | ✅ |

---

## AP3: TEST-Rechnungen Klassifikation ✅

**Bericht:** `audit/TEST_INVOICE_CLASSIFICATION.md`

| Rechnung | Klassifikation |
|----------|---------------|
| RG-2026-TEST-001 (c292fd2d-…) | Kategorie A — Testdaten, später löschbar |
| RG-2026-TEST-002 (e16ea245-…) | Kategorie A — Testdaten, später löschbar |

**Begründung:** TEST-Prefix, keine Zahlungsdaten, keine FK-Abhängigkeiten außer items/service_records, explizit als TESTFALL gekennzeichnet. Löschung in separatem Cleanup-PR nach Migration.

---

## AP4: Overhaul Backfill-Migration ✅

**Migration:** `20260806700000_overhauled_backfill.sql`
**Rollback:** `20260806700001_rollback_overhauled_backfill.sql`

### Sicherheitsmerkmale

| Merkmal | Status |
|---------|--------|
| Feste ID-Allowlist (5 UUIDs) | ✅ PGlite-Test bestanden |
| Vollständig transaktional (DO $$ Block) | ✅ |
| Count-Guard (RAISE EXCEPTION bei != 5) | ✅ PGlite-Test bestanden |
| Checksum-Guard (f7216a986e44e738a4ed810296df1f49) | ✅ PGlite-Test bestanden |
| Items-Checksum-Guard (aacb6cb502e1b55f09c5dda4a1c71305) | ✅ PGlite-Test bestanden |
| Idempotent (WHERE status IN EN-Werte) | ✅ PGlite-Test bestanden |
| Atomare Audit-Einträge mit migration_id | ✅ PGlite-Test bestanden |
| trg_invoices_no_finalized_edit temporär DISABLED | ✅ PGlite-Test bestanden |
| trg_validate_invoice_status temporär DISABLED | ✅ |
| trg_audit_invoice_status ENABLED (mitlaufen!) | ✅ PGlite-Test bestanden |
| Post-Verification (5 Prüfungen) | ✅ PGlite-Test bestanden |
| Rollback-Migration vorhanden | ✅ PGlite-Test bestanden |

### Status-Mapping

| invoice_id | Rg.-Nr. | IST → SOLL |
|-----------|---------|------------|
| abbb388d-69e7-4c60-90df-94d19e4c5c45 | RE-2026-0001 | sent → uebermittelt |
| be2de1e2-2558-4a80-93d3-aa4669a996e6 | RE-2026-0002 | disputed → strittig |
| a97f48cc-9c18-4084-8cab-2632ac593ae9 | RE-2026-0003 | paid → bezahlt |
| c292fd2d-bddc-473c-8e99-e573f7ad27d7 | RG-2026-TEST-001 | sent → uebermittelt |
| e16ea245-01b0-46a0-8d2f-5cd1edf7cb58 | RG-2026-TEST-002 | sent → uebermittelt |

---

## AP5: Staging-Abnahme ⚠️ (Einschränkung)

**Supabase Branch:** `pre-backfill-security-staging` (project_ref: dbfsysvwiqsftbiziuda)
**Status:** MIGRATIONS_FAILED → Branch gelöscht

### Befund

Die Supabase-Branch-Erstellung scheitert beim Replay der allerersten Migration (`create_krankenfahrten_table`), weil diese `public.profiles` referenziert — eine Tabelle, die über das Supabase-Dashboard erstellt wurde und nicht in den Migrationen enthalten ist. Dies ist eine **bekannte Limitation** des Projekts (betrifft alle Branches, nicht nur diesen).

### Kompensation

| Testmethode | Abdeckung |
|-------------|-----------|
| PGlite In-Process-Tests (25 Tests) | ✅ AP1 Audit-Trigger + Immutabilität |
| PGlite In-Process-Tests | ✅ AP2 Finalized-Edit-Schutz (7 Szenarien) |
| PGlite In-Process-Tests | ✅ AP4 Count-Guard, Allowlist, Idempotenz |
| SQL-Parsing-Tests | ✅ AP4 Migration-Struktur (Checksums, IDs, Trigger-Management) |

**Empfehlung:** Für zukünftige Staging-Tests: `profiles`-Tabelle als Migration nachrüsten (separater PR).

### Branch-Cleanup

| Branch | Status | Aktion |
|--------|--------|--------|
| pre-backfill-security-staging | MIGRATIONS_FAILED | ✅ Gelöscht |
| pr33-staging-e2e (alt) | MIGRATIONS_FAILED | ✅ Gelöscht |

---

## Tests ✅

**Testdatei:** `__tests__/billing/pre-backfill-security.test.ts`
**Framework:** vitest + PGlite

### Ergebnis

```
Test Files  1 passed (1)
     Tests  25 passed (25)
  Duration  9.03s
```

### Testabdeckung

| Suite | Tests | Status |
|-------|-------|--------|
| AP1: Audit-Trail Sicherheit | 4 | ✅ Alle bestanden |
| AP2: Finalized-Edit-Schutz | 7 | ✅ Alle bestanden |
| AP4: Allowlist und Count-Guard | 9 | ✅ Alle bestanden |
| AP4: Rollback-Migration | 3 | ✅ Alle bestanden |
| AP4: End-to-End PGlite | 2 | ✅ Alle bestanden |

### Bestehende Test-Suite

Keine Regressionen durch neue Migrationen. Die 2 vorbestehenden Failures sind unabhängig:
- `p0-1-admin-auth.test.ts`: Benötigt `NEXT_PUBLIC_SUPABASE_URL` (CI-Env)
- `tenant-isolation.test.ts`: Destruktives-SQL-Pattern-Prüfung (pre-existing)

---

## Dateien in diesem PR

### Neue Migrationen

| Datei | Typ |
|-------|-----|
| `supabase/migrations/20260806600000_audit_security.sql` | AP1 — Audit-Trail absichern |
| `supabase/migrations/20260806600001_fix_finalized_edit.sql` | AP2 — Finalized-Edit-Schutz |
| `supabase/migrations/20260806600002_rollback_audit_security.sql` | Rollback AP1 |
| `supabase/migrations/20260806600003_rollback_fix_finalized_edit.sql` | Rollback AP2 |
| `supabase/migrations/20260806700000_overhauled_backfill.sql` | AP4 — Overhaul Backfill |
| `supabase/migrations/20260806700001_rollback_overhauled_backfill.sql` | Rollback AP4 |

### Berichte

| Datei | Inhalt |
|-------|--------|
| `audit/TEST_INVOICE_CLASSIFICATION.md` | AP3 — Testdaten-Klassifikation |
| `audit/PRE_BACKFILL_SECURITY_GO_NOGO.md` | Dieser Bericht |

### Tests

| Datei | Tests |
|-------|-------|
| `__tests__/billing/pre-backfill-security.test.ts` | 25 Tests (AP1/AP2/AP4) |

---

## Ausführungsreihenfolge (Production)

Die Migrationen müssen in dieser Reihenfolge auf Production angewendet werden:

1. `20260806600000_audit_security.sql` — Audit-Trail absichern
2. `20260806600001_fix_finalized_edit.sql` — Finalized-Edit-Schutz
3. `20260806700000_overhauled_backfill.sql` — EN→DE Backfill

**Rollback-Reihenfolge** (umgekehrt):

1. `20260806700001_rollback_overhauled_backfill.sql`
2. `20260806600003_rollback_fix_finalized_edit.sql`
3. `20260806600002_rollback_audit_security.sql`

---

## Nächste Schritte (nach Merge-Freigabe)

1. PR mergen auf `main`
2. Migrationen auf Production anwenden (Reihenfolge beachten)
3. Post-Verification Queries aus PRODUCTION_PREFLIGHT_FINAL_REPORT.md ausführen
4. TEST-Rechnungen in separatem Cleanup-PR löschen
5. `profiles`-Tabelle als Migration nachrüsten (Staging-Limitation beheben)

---

## Sicherheitsbestätigung

- ✅ Keine echten Patienten- oder Gesundheitsdaten in Berichten oder Code
- ✅ Keine Tokens, Passwörter oder Connection-Strings
- ✅ Keine Produktionsdaten verändert oder exportiert
- ✅ Kein direkter Push auf main
- ✅ Production-Backfill NICHT ausgeführt
- ✅ Staging-Branches aufgeräumt (keine laufenden Kosten)
