# GO/NO-GO Bericht: Profiles-Basismigration & AP1-AP5 Staging

**Branch:** `fix/profiles-base-migration`
**Datum:** 2026-08-06
**Supabase-Projekt:** nnwyktkqibdjxgimjyuq (Production)
**Staging-Branch:** profiles-staging-test-2 (jwajxeljtsteujjdpsee) — GELÖSCHT

---

## 1. Profiles-Migrationsanalyse

### Ursache: Warum fehlt profiles auf Supabase-Branches?

Die `profiles`-Tabelle (sowie `angels`, `bookings`, `reviews`) wurde historisch über das Supabase-Dashboard erstellt — **vor** Einführung des Migrations-Systems. Die retroaktive Baseline-Migration `20250101000000_core_tables_baseline.sql` existiert im Repository, ist jedoch **NICHT in der Supabase-Migrationstabelle (`schema_migrations`) registriert**.

**Production-Migrationshistorie beginnt bei:** `20260307172236` (create_krankenfahrten_table)

**Betroffene Baseline-Dateien (im Repo, aber NICHT in schema_migrations):**

| Datei | Inhalt |
|-------|--------|
| `20250101000000_core_tables_baseline.sql` | profiles, angels, bookings, reviews + RLS + handle_new_user |
| `20250101000050_missing_production_functions.sql` | set_updated_at, prevent_*_mutation, update_budget |
| `20260101000000_baseline_live_only_tables.sql` | 61+ weitere Tabellen (clients, invoices, etc.) |
| `20260101000100_baseline_live_only_functions.sql` | prevent_role_escalation, generate_referral_code, audit RPCs |

**Konsequenz:** Beim Erstellen eines Supabase-Branches werden nur die registrierten Migrationen (ab 20260307) abgespielt. Da die allererste registrierte Migration (`create_krankenfahrten_table`) profiles referenziert und profiles nicht existiert, scheitert der Branch sofort:

```
Status: MIGRATIONS_FAILED
Angewandte Migrationen: 0
Tabellen in public schema: 0
```

Dies wurde am 2026-08-06 durch zwei separate Branch-Erstellungen bestätigt:
- `profiles-staging-test` → MIGRATIONS_FAILED → gelöscht
- `profiles-staging-test-2` → MIGRATIONS_FAILED → manuell aufgebaut → getestet → gelöscht

### Bestehende Baseline-Migration

Die Datei `20250101000000_core_tables_baseline.sql` ist **korrekt und vollständig**:
- CREATE TABLE IF NOT EXISTS public.profiles (10 Basis-Spalten)
- Alle RLS-Policies mit IF NOT EXISTS
- handle_new_user Trigger (auth.users → profiles)
- Idempotent: IF NOT EXISTS / CREATE OR REPLACE überall

Weitere Spalten (postal_code, is_test, referral_*, onboarding_completed, deleted_at) werden von späteren Migrationen hinzugefügt, die BEREITS in der Production-History registriert sind.

### Lösung

Die 4 Baseline-Dateien müssen in der Production-`schema_migrations`-Tabelle registriert werden. Da alle Statements `IF NOT EXISTS` / `CREATE OR REPLACE` verwenden, ist die Ausführung auf Production ein **No-Op** — es werden keine Tabellen verändert, nur Metadaten (schema_migrations-Einträge) hinzugefügt.

**Empfohlene Ausführung:** `apply_migration` über Supabase MCP für jede der 4 Baseline-Dateien.

---

## 2. AP1-AP5 Staging-Testergebnisse

Getestet auf echtem Supabase-Branch `jwajxeljtsteujjdpsee` mit synthetischen Testdaten (keine Produktionsdaten).

### Testmatrix

| # | Test | Ergebnis |
|---|------|----------|
| 1 | AP1: Audit-Trigger feuert bei Status-Änderung | ✅ PASS |
| 2 | AP1: Audit UPDATE blockiert (Immutabilität) | ✅ PASS |
| 3 | AP1: Audit DELETE blockiert (Immutabilität) | ✅ PASS |
| 4 | AP2: Content-Änderung bei geschütztem Status blockiert | ✅ PASS |
| 5 | AP2: Workflow-Felder bei geschütztem Status erlaubt | ✅ PASS |
| 6 | AP2: Entwurf-Rechnung komplett editierbar | ✅ PASS |
| 7 | AP4: Backfill Count-Guard (5 Rechnungen) | ✅ PASS |
| 8 | AP4: Backfill Allowlist-Guard | ✅ PASS |
| 9 | AP4: Backfill Checksum-Guard (Non-Status MD5) | ✅ PASS |
| 10 | AP4: Backfill Items-Checksum-Guard | ✅ PASS |
| 11 | AP4: Post-Verification Status-Verteilung (3×uebermittelt, 1×strittig, 1×bezahlt) | ✅ PASS |
| 12 | AP4: Post-Verification Checksums unverändert | ✅ PASS |
| 13 | AP4: Idempotenz (zweiter Durchlauf → SKIP) | ✅ PASS |
| 14 | Rollback: DE → EN Status zurücksetzen | ✅ PASS |
| 15 | Post-Rollback: Fachliche Checksum identisch | ✅ PASS |
| 16 | RLS: billing_audit_trail org_fence RESTRICTIVE Policy | ✅ VORHANDEN |
| 17 | RLS: billing_audit_trail select PERMISSIVE Policy | ✅ VORHANDEN |

**Ergebnis: 17/17 Tests bestanden**

### Staging-Checksums (synthetische Daten)

- Non-Status MD5: `67832f52cb26405ab55b694a72994a91`
- Items MD5: `e63b9e363aba8b5e01ffe0af0aff72ef`
- Nach Backfill und Rollback: identisch ✅

### Audit-Trail-Einträge nach Backfill

- 5× manuelle Einträge (migration_id = `20260806700000_overhauled_backfill_STAGING`)
- 5× automatische Trigger-Einträge (migration_id = NULL)
- Alle mit Checksums (checksum_before, checksum_after)

### RLS-Hinweis

Die Org-Fence-Policy auf `billing_audit_trail` ist korrekt als RESTRICTIVE definiert. Der Test via `execute_sql` zeigt keine Filterung, da Supabase MCP als `service_role` operiert, der RLS umgeht. Dies ist gewolltes Verhalten — für `authenticated`/`anon`-Rollen greift die Policy.

---

## 3. Cleanup-Bestätigung

- [x] Alle synthetischen Testdaten gelöscht (0 Zeilen in allen Tabellen)
- [x] Supabase-Branch `profiles-staging-test` gelöscht
- [x] Supabase-Branch `profiles-staging-test-2` gelöscht
- [x] Nur `main`-Branch verbleibt (ACTIVE_HEALTHY)
- [x] Keine laufenden Kosten (Branch-Kosten: $0.01344/h × ~1h = ~$0.01)

---

## 4. Verbleibende Risiken

| Risiko | Schwere | Mitigation |
|--------|---------|------------|
| Production apply_migration ist technisch ein Write auf schema_migrations | Niedrig | Alle Statements sind IF NOT EXISTS → No-Op auf Daten/Schema-Ebene |
| strittig fehlt im Production-Constraint | Bereits gelöst | Repo-Migration `20260806400000_add_strittig_status.sql` vorhanden |
| 4 Baseline-Dateien müssen registriert werden, nicht nur profiles | Mittel | Alle 4 Dateien sind idempotent; Reihenfolge: 20250101000000 → 20250101000050 → 20260101000000 → 20260101000100 |
| Trigger-Funktionen (generate_referral_code, prevent_role_escalation) in Baseline-Functions-Datei | Niedrig | CREATE OR REPLACE, keine Kollision |
| Doppelte Audit-Einträge (manuell + Trigger) bei Backfill | Design-Entscheidung | Audit-Trigger bleibt aktiv während Backfill (gewollt: vollständiger Trail) |

---

## 5. Nächste Schritte (nach GO-Freigabe)

1. **Baseline-Registrierung auf Production:** `apply_migration` für 4 Baseline-Dateien (No-Op, nur schema_migrations-Eintrag)
2. **Branch-Erstellung verifizieren:** Neuen Supabase-Branch erstellen → Status muss ACTIVE sein
3. **PR #36 vorbereiten:** AP1-AP5 Migrationen auf main mergen
4. **Production-Backfill:** AP4 mit Production-Checksums ausführen

---

## 6. Endgültige Empfehlung

### ✅ GO

**Begründung:**
- Die Profiles-Baseline-Migration existiert bereits und ist korrekt (`20250101000000_core_tables_baseline.sql`)
- Das Problem ist ausschließlich die fehlende Registrierung in `schema_migrations`
- Alle AP1-AP5 Migrationen wurden auf echtem Supabase-Branch erfolgreich getestet (17/17)
- Rollback funktioniert sauber
- Checksums bleiben nach Backfill und Rollback identisch
- Keine Produktionsdaten wurden berührt oder kopiert

**Voraussetzung für Merge:**
Die 4 Baseline-Dateien müssen über `apply_migration` auf Production registriert werden. Dies ist ein reiner Metadaten-Write (schema_migrations), keine Schema-Änderung.
