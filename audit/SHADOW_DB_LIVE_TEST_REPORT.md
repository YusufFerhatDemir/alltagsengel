# Shadow-DB Live-Test — Report

**Datum:** 2026-08-02
**Branch:** `audit/phase3-production-readiness`
**Umgebung:** lokales PostgreSQL 16.14 (Homebrew), Port 55433 — **kein Docker, kein Supabase-Projekt, keine Produktivdaten**
**Vorgänger:** `audit/SHADOW_DB_MIGRATION_REPORT.md` (2026-08-01) dokumentierte, warum damals nur statisch getestet werden konnte. **Dieser Report ersetzt dessen Kernaussage: alle damals übersprungenen Tests wurden jetzt tatsächlich ausgeführt.**

---

## 0. Kurzfassung — alles ausgeführt, alles grün

| Schritt | Ergebnis |
|---|---|
| 1. Leere DB, Aufbau NUR aus dem Repo (43 SQL-Dateien) | ✅ 43 OK, 0 Fehler |
| 2. Seed Org A + Org B (`supabase/shadow/10_seed_two_orgs.sql`) | ✅ |
| 3. SQL-Tenant-Tests (`20_tenant_tests.sql`) | ✅ **28/28 PASS** |
| 4. Dynamische supabase-js-Tests über HTTP (bisher **skipped**) | ✅ **4/4 PASS** (19/19 der Gesamt-Suite) |
| 5. Idempotenz: kompletter Zweitlauf aller 41 Migrationen auf der gebauten DB | ✅ 41 OK, 0 Fehler |
| 6. Backup (`pg_dump -Fc`, 640 KB) + Restore in `shadow_restored` | ✅ Objektzahlen identisch (Tabellen 133, Policies 338+, Funktionen, Trigger, Zeilen) |
| 7. Storage-Tests (privater Bucket, Objekt-Sichtbarkeit) | ✅ Tests 20–23 |

Der frühere Blocker („31 von 65 tenant_tables existieren in keiner Migration → Replay bricht") ist durch die Baseline-Migrationen `20260101000000/-100` + `20260802000100/-200` **behoben und per echtem Replay bewiesen**.

## 1. Was sich seit dem Vorgänger-Report geändert hat

1. **Aufbau von null funktioniert jetzt.** Neue Baselines rekonstruieren die 61 Live-only-Tabellen (+ Funktionen, FKs, letzte 20 Spalten, Bucket `abrechnung`) aus der Live-OpenAPI-Introspektion. Migrations-Renames (`fix_rls_policies.sql` → `20260319000000_…` u. a.) stellen die topologische Reihenfolge her; ~20 Bestandsmigrationen wurden idempotent/replay-fest gemacht (dokumentierte `IF NOT EXISTS`/`DROP POLICY IF EXISTS`-Nachrüstungen, Angleich `notifications.read`→`is_read` an den Live-Stand).
2. **Die „übersprungenen" dynamischen Tests laufen jetzt real.** Damals: `describe.skipIf` mangels Supabase-Stack (kein Docker, kein Access-Token). Jetzt lokal nachgebaut:
   - `scripts/shadow-db.sh` — Cluster + DB von null (up/reset/test/idempotency/dump/restore/down)
   - **neu** `scripts/shadow-db-http.sh` — startet **PostgREST** (brew) direkt auf der Shadow-DB + **`scripts/shadow-auth-shim.mjs`**, einen minimalen GoTrue-Ersatz: er prüft nur das feste Shadow-Testpasswort, stellt HS256-JWTs mit demselben Secret wie PostgREST aus und proxyt `/rest/v1/*`. **Die Passwortprüfung ist damit ausdrücklich nicht Testgegenstand — getestet wird das echte RLS-Verhalten von PostgREST mit echten JWT-Claims.**
3. Testkonstanten in `__tests__/shadow-db/tenant-isolation.test.ts` auf den Seed `10_seed_two_orgs.sql` vereinheitlicht; zwei statische Tests aktualisiert (sie dokumentierten die inzwischen geschlossene Live-only-Lücke und wirken jetzt als Regressions-Anker: fällt eine Tabelle wieder aus den Migrationen, schlagen sie an).

## 2. Testmatrix (28 SQL-Tests + 4 dynamische)

**SQL-Ebene (`supabase/shadow/20_tenant_tests.sql`, via simulierte JWT-Claims + `SET ROLE`):**

| Bereich | Tests | Ergebnis |
|---|---|---|
| SELECT-Isolation (A sieht nur A, Direktzugriff auf B-IDs leer) | 1–8 | ✅ |
| INSERT (ohne org_id → eigene Org; fremde org_id → blockiert) | 9–10 | ✅ |
| UPDATE/DELETE (Cross-Org trifft 0 Zeilen; eigenes geht; „Umhängen" nach Org B blockiert) | 11–14 | ✅ |
| Rollen (anon: alles verweigert; Kunde ohne Adminrechte: 0 Zeilen) | 15–18 | ✅ |
| Fallback ohne Mitgliedschaft → Stamm-Org (**fail-open, Befund T-1, s. §4**) | 19 | ✅ (Verhalten bestätigt) |
| Storage (privater Bucket, keine Policies → anon/auth sehen nichts; service_role alles) | 20–23 | ✅ |
| service_role-Bypass (sieht alle Orgs — Admin-Panel-Pfad) | 24 | ✅ |
| Struktur (65 Fences, alle RESTRICTIVE, keine Tabelle mit org_id ohne RLS, keine public-Tabelle ohne RLS) | 25–28 | ✅ |

**HTTP-Ebene (supabase-js → Auth-Shim → PostgREST → Shadow-DB), vorher skipped, jetzt PASS:**

1. Org-A-User kann Org-B-Klienten NICHT lesen (SELECT → `[]`)
2. Org-A-User kann KEINE Zeile in Org B einfügen (INSERT → RLS-Fehler)
3. Org-A-User kann Org-B-Klienten NICHT verändern/löschen (UPDATE/DELETE → 0 Zeilen)
4. service_role liest mandantenübergreifend (Admin-Panel-Pfad funktionsfähig)

Gesamtlauf `npx vitest run __tests__/shadow-db/tenant-isolation.test.ts`: **19/19 passed** (15 statisch + 4 dynamisch, 0 skipped bei gesetzten `SHADOW_SUPABASE_*`-Env-Variablen).

## 3. Rollback / Wiederholungslauf / Backup–Restore

- **Wiederholungslauf:** Alle 41 Migrationen ein zweites Mal auf der fertigen, geseedeten DB → 41 OK, 0 Fehler. Ein Retry/Teil-Deploy bleibt also nicht hängen und zerstört keine Daten (Seeds blieben intakt, Tests danach grün).
- **Rollback-Modell:** Migrationen sind vorwärts-idempotent statt down-migrierbar (bewusst, wie produktiv via `scripts/rollback.sh` = `git revert` + Forward-Fix). „Rollback + erneuter Lauf" wurde als **DROP DATABASE + kompletter Neuaufbau** getestet (`shadow-db.sh reset` → identisches Ergebnis) — das ist der reale Disaster-Recovery-Pfad.
- **Backup + Restore:** `pg_dump -Fc` (640 KB) → `pg_restore` in `shadow_restored`. Verifiziert identisch: 133 Tabellen, 338+ Policies (inkl. aller 65 Fences), 25 Funktionen, 21 Trigger, Zeilenzahlen (clients, invoices, storage.objects).

## 4. Befunde

| # | Prio | Befund |
|---|---|---|
| T-1 | **P1** | **`current_org_id()` ist fail-open:** User ohne `organization_members`-Eintrag fällt auf die Stamm-Org `00000000-…-000460629986` zurück (Test 19 bestätigt das Verhalten live-gleich). Konsequenz: jeder neue Auth-User „gehört" implizit zur Stamm-Org; unter `service_role` evaluiert der Spalten-Default ebenfalls zur Stamm-Org (deckt sich mit den P1-Routen-Befunden in `audit/TENANT_ROUTE_COVERAGE.md`). Empfehlung: Fallback auf `NULL` + NOT-NULL-Verletzung statt Stamm-Org, sobald die Service-Role-Routen org-explizit schreiben. |
| T-2 | P2 | **Keine Storage-Objekt-Policies im Repo für `mis-documents`/`abrechnung`** (Tests 20–22 dokumentieren: anon/authenticated sehen nichts — sicher, aber App-Zugriffe laufen zwingend über service_role). |
| T-3 | P2 | `supabase/seed-shadow.sql` (alter, defensiver Seed) ist durch `supabase/shadow/10_seed_two_orgs.sql` überholt — bei Gelegenheit entfernen, um doppelte Wahrheit zu vermeiden. |

## 5. Reproduktion

```bash
brew install postgresql@16 postgrest        # einmalig
./scripts/shadow-db.sh test                 # Cluster + DB von null + Seed + 28 SQL-Tests
./scripts/shadow-db.sh idempotency          # Zweitlauf aller Migrationen
eval "$(./scripts/shadow-db-http.sh up | grep '^export')"
npx vitest run __tests__/shadow-db/tenant-isolation.test.ts   # 19/19, inkl. dynamisch
./scripts/shadow-db.sh dump && ./scripts/shadow-db.sh restore
./scripts/shadow-db-http.sh down && ./scripts/shadow-db.sh down
```

(Läuft der Port 55432 bereits woanders: `SHADOW_PGPORT=55433` voranstellen.)
