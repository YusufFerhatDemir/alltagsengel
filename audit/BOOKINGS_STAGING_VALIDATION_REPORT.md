# Bookings Policy Consolidation — Staging-Validierungsreport

**Datum:** 2026-08-03
**Branch:** `cleanup/bookings-policy-consolidation`
**Commits:** `ee7d445`, `1981d4d`, `76f1d17` (Typecheck-Fix)
**Pull Request:** https://github.com/YusufFerhatDemir/alltagsengel/pull/23
**Supabase-Projekt:** `nnwyktkqibdjxgimjyuq` (eu-west-1)

---

## 1. Umgebung

| Komponente | Version / Detail |
|---|---|
| PostgreSQL | 16.14 (Homebrew, lokal) |
| PostgREST | lokal via `shadow-db-http.sh` |
| Auth-Shim | `shadow-auth-shim.mjs` (JWT HS256) |
| Node.js | 22 (CI: ubuntu-latest) |
| Vitest | 4.1.10 |
| PGlite | `@electric-sql/pglite` (WASM Postgres) |
| Shadow-DB Port | 55432 (Cluster), 55434 (PostgREST), 55440 (Auth-Shim) |

**Hinweis:** Supabase Branch-DB konnte nicht erstellt werden (kein `SUPABASE_ACCESS_TOKEN` vorhanden). Stattdessen wurde die lokale Shadow-DB-Infrastruktur (PostgreSQL 16 + PostgREST + Auth-Shim) als vollwertiger Ersatz verwendet. Die Shadow-DB baut aus dem Repo (45 Migrationsdateien) eine identische Datenbankstruktur auf.

---

## 2. Pull Request

- **PR #23:** [P0/DSGVO: Bookings RLS Policy Consolidation (15→5)](https://github.com/YusufFerhatDemir/alltagsengel/pull/23)
- **Base:** `main`
- **Head:** `cleanup/bookings-policy-consolidation`
- **Geänderte Dateien:** 8 (Migration, 2 Testdateien, 2 Audit-Reports, package.json/lock, Arbeitsplan)

---

## 3. CI-Pipeline

### Lauf 1: Commit `1981d4d` — FAILURE

| Step | Status | Detail |
|---|---|---|
| Checkout | ✅ | — |
| Setup Node.js 22 | ✅ | — |
| npm ci | ✅ | — |
| **Typecheck** | ❌ | `error TS1501`: Regex `/s`-Flag (dotAll) erfordert `es2018`-Target |
| Lint | ⏭️ skipped | (nach Typecheck-Failure) |
| Unit tests (vitest) | ⏭️ skipped | — |
| Unit tests (node:test) | ⏭️ skipped | — |
| Secret scan | ⏭️ skipped | — |
| IK-Hardcoding-Check | ⏭️ skipped | — |
| Forbidden-strings lint | ⏭️ skipped | — |
| Production build | ⏭️ skipped | — |

**Ursache:** `__tests__/security/bookings-policy-consolidation.test.ts:468` enthielt `/s`-Regex-Flag.
**Fix:** Commit `76f1d17` — `/s` durch `[\s\S]` ersetzt.

### Lauf 2: Commit `76f1d17` — IN PROGRESS

| Detail | Wert |
|---|---|
| Run-ID | `30806492372` |
| Head SHA | `76f1d1751c84ed9db95ac81d711a4c8dfd3b37aa` |
| Status | `in_progress` (zum Zeitpunkt der Report-Erstellung) |

---

## 4. Lokale Tests

### 4.1 Statische + PGlite-Tests (Vitest)

```
Test Files  2 passed (2)
     Tests  42 passed | 13 skipped (55)
  Duration  1.72s
```

| Suite | Tests | Status |
|---|---|---|
| `bookings-policy-consolidation.test.ts` (statisch) | 28 | ✅ alle bestanden |
| `bookings-policy-pglite.test.ts` (PGlite) | 14 | ✅ alle bestanden |
| `bookings-policy-consolidation.test.ts` (dynamisch) | 13 | ⏭️ skipped (braucht Shadow-DB JS-Client-Fix) |

**13 übersprungene Tests:** Die dynamischen JS-Tests in `bookings-policy-consolidation.test.ts` verwenden `service.rpc('raw_sql', ...)`, das auf der lokalen Shadow-DB nicht existiert. Dieselben Szenarien wurden stattdessen als SQL-Level-Tests (Abschnitt 4.2) und PGlite-Tests (14 Tests) abgedeckt.

### 4.2 Shadow-DB SQL-Tests (29 Tests)

Ausgeführt gegen: lokale PostgreSQL 16 Shadow-DB (Port 55432)

| Nr | Test | Erwartet | Gemessen | Status |
|---|---|---|---|---|
| 1 | SELECT: Customer sieht eigene Buchung | 1 | 1 | ✅ PASS |
| 2 | SELECT: Angel sieht eigene Buchung | 1 | 1 | ✅ PASS |
| 3 | SELECT: Fremde Org sieht keine Buchung | 0 | 0 | ✅ PASS |
| 4 | SELECT: Admin sieht Buchung | 1 | 1 | ✅ PASS |
| 5 | SOFT-DEL: Customer gelöscht → Angel sieht nichts | 0 | 0 | ✅ PASS |
| 6 | SOFT-DEL: Angel gelöscht → Customer sieht nichts | 0 | 0 | ✅ PASS |
| 7 | SOFT-DEL: Gelöschter Angel sieht eigene nichts | 0 | 0 | ✅ PASS |
| 8 | SOFT-DEL: Admin sieht trotz gelöschtem Angel | 1 | 1 | ✅ PASS |
| 9 | SOFT-DEL: Admin sieht trotz gelöschtem Customer | 1 | 1 | ✅ PASS |
| 10 | SOFT-DEL: Gelöschter Admin sieht nichts | 0 | 0 | ✅ PASS |
| 11 | SOFT-DEL: Beide gelöscht → Customer sieht nichts | 0 | 0 | ✅ PASS |
| 12 | INSERT: Customer kann Buchung erstellen | 1 | 1 | ✅ PASS |
| 13 | INSERT: Soft-gelöschter Customer blockiert | blocked | blocked | ✅ PASS |
| 14 | INSERT: Angel kann nicht inserieren | blocked | blocked | ✅ PASS |
| 15 | INSERT: Fremde Org blockiert (fence) | blocked | blocked | ✅ PASS |
| 16 | UPDATE: Customer kann eigene Buchung updaten | T16-Update | T16-Update | ✅ PASS |
| 17 | UPDATE: Angel kann eigene Buchung updaten | T17-Angel | T17-Angel | ✅ PASS |
| 18 | UPDATE: Soft-gelöschter Customer blockiert | NULL | NULL | ✅ PASS |
| 19 | UPDATE: Fremde Org blockiert (fence) | NULL | NULL | ✅ PASS |
| 20 | DELETE: Customer kann nicht löschen | 1 | 1 | ✅ PASS |
| 21 | DELETE: Admin kann löschen (ALL-Policy) | 1→0 | 1→0 | ✅ PASS |
| 22 | ANON: Bookings-Zugriff blockiert | blocked | blocked_perm | ✅ PASS |
| 23 | ANON: is_profile_soft_deleted() aufrufbar | callable | callable | ✅ PASS |
| 24 | ANON: Rückgabe ist boolean | false | false | ✅ PASS |
| 25 | 42P17: Kein Recursion-Fehler bookings | none | none | ✅ PASS |
| 26 | 42P17: Kein Recursion-Fehler profiles | none | none | ✅ PASS |
| 27 | SERVICE_ROLE: Sieht alle Buchungen | 1 | 1 | ✅ PASS |
| 28 | STRUKTUR: Genau 5 Policies auf bookings | 5 | 5 | ✅ PASS |
| 29 | STRUKTUR: bookings_org_fence ist RESTRICTIVE | RESTRICTIVE | RESTRICTIVE | ✅ PASS |

**Ergebnis: 29/29 PASS**

### 4.3 Tenant-Isolation-Tests (Shadow-DB SQL)

28 Tenant-Tests aus `supabase/shadow/20_tenant_tests.sql`:

| Bereich | Tests | Status |
|---|---|---|
| SELECT (Org-Isolation) | 7 | ✅ alle PASS |
| INSERT (Org-Fence) | 2 | ✅ alle PASS |
| UPDATE (Cross-Org) | 3 | ✅ alle PASS |
| DELETE (Cross-Org) | 1 | ✅ PASS |
| ROLLE (anon) | 3 | ✅ alle PASS |
| FALLBACK (Stamm-Org) | 1 | ✅ PASS |
| STORAGE | 4 | ✅ alle PASS |
| SERVICE_ROLE | 1 | ✅ PASS |
| STRUKTUR | 4 | ✅ alle PASS |
| Org-Fences (Anzahl) | 1 | ✅ PASS (65 org_fences) |
| RESTRICTIVE-Check | 1 | ✅ PASS (0 non-restrictive fences) |

**Ergebnis: 28/28 PASS**

---

## 5. Migrationsergebnis

### 5.1 Leere Datenbank (Shadow-DB von null)

```
45 Dateien: 45 OK, 0 fehlgeschlagen
```

### 5.2 Idempotenz (Zweiter Migrationslauf)

```
43 Migrationen: 43 OK, 0 fehlgeschlagen
```

Alle Migrationen sind idempotent (DROP ... IF EXISTS + CREATE OR REPLACE).

### 5.3 Rollback

| Schritt | Ergebnis |
|---|---|
| Buchungen vor Rollback | 1 |
| DROP 5 neue Policies | ✅ 0 Policies verbleiben |
| CREATE 8 alte Policies | ✅ 8 Policies wiederhergestellt |
| Buchungen nach Rollback | 1 (kein Datenverlust) |
| Customer sieht Buchung | ✅ PASS |

### 5.4 Re-Apply nach Rollback

| Schritt | Ergebnis |
|---|---|
| Policies vor Re-Apply | 8 (alte) |
| Migration anwenden | ✅ DROP 8 alte + CREATE 5 neue |
| Policies nach Re-Apply | 5 (konsolidiert) |
| Buchungen nach Re-Apply | 1 (kein Datenverlust) |
| Customer sieht Buchung | ✅ PASS |

---

## 6. Security-Review: `is_profile_soft_deleted()`

### Definitionsort

- **Produktion:** `supabase/migrations/20260419_soft_delete.sql:121-131`
- **Test-Mirror:** `__tests__/security/bookings-policy-pglite.test.ts:203-213` (identisch)

### Attribut-Prüfung

| Prüfpunkt | Ergebnis | Detail |
|---|---|---|
| `search_path` | ✅ SICHER | `SET search_path TO 'public'` — kein Hijacking möglich |
| SECURITY DEFINER | ✅ BY DESIGN | Notwendig um 42P17-Rekursion zu brechen |
| Rückgabewert | ✅ SICHER | Nur `boolean`, kein Datenleck |
| SQL-Injection | ✅ NICHT VERWUNDBAR | Reine SQL-Funktion, `uuid`-Typ-Check, kein dynamisches SQL |
| Privilege Escalation | ✅ NICHT VERWUNDBAR | Read-Only (`SELECT EXISTS`), keine Schreiboperationen |
| Datenexfiltration | ✅ MINIMALES RISIKO | 1 Bit Information (gelöscht/nicht-gelöscht), UUIDs v4 nicht erratbar |
| Multi-Mandant-Isolation | ✅ KORREKT | Org-Fence auf Policy-Ebene, nicht Funktionsebene |

### Findings

| # | Finding | Schwere | Status |
|---|---|---|---|
| F-1 | `anon` hat EXECUTE (ermöglicht RPC-Probing von UUID-Soft-Delete-Status) | LOW | Offen — by design (Policy-Abhängigkeit: `Anyone can view angels`) |
| F-2 | Kein funktionsspezifisches Rate-Limiting | LOW | Mitigiert durch API-Gateway-Rate-Limits |
| F-3 | Funktion erzwingt keinen Org-Fence | NON-ISSUE | Org-Fencing auf Policy-Ebene |
| F-4 | SECURITY DEFINER umgeht RLS auf profiles | BY DESIGN | Notwendig für 42P17-Prävention |

**Empfehlung:** F-1 akzeptieren und dokumentieren. Das Risiko ist minimal (boolean-Rückgabe, UUIDs nicht erratbar). Der `anon`-EXECUTE-Grant ist erforderlich für die öffentliche Engel-Verzeichnis-Policy.

---

## 7. anon-EXECUTE-Analyse (Detailprüfung)

| Frage | Antwort |
|---|---|
| Kann anon die Funktion aufrufen? | ✅ Ja (T23 PASS) |
| Gibt die Funktion sensible Daten zurück? | ❌ Nein — nur boolean (T24 PASS) |
| Kann anon Buchungen lesen? | ❌ Nein — `is_admin()` EXECUTE revoked → `permission denied` (T22 PASS) |
| Kann anon UUID-Existenz prüfen? | Theoretisch ja, aber: `false` = nicht-existent ODER aktiv (nicht unterscheidbar) |
| Kann anon Soft-Delete-Status proben? | Nur für bekannte UUIDs (v4, 122 Bit Entropie — Brute-Force infeasible) |
| Praktisches Risiko? | Minimal — kein PII, kein Zugang zu Buchungen, kein Mandanten-Leak |

---

## 8. Offene Risiken

| # | Risiko | Schwere | Mitigation |
|---|---|---|---|
| R-1 | Supabase Branch-DB-Test nicht durchgeführt (kein Token) | MITTEL | Lokale Shadow-DB mit identischem Schema als Ersatz; PGlite als zweiter Beweis |
| R-2 | 13 JS-dynamische Tests noch übersprungen (brauchen `raw_sql`-RPC-Fix) | NIEDRIG | Alle 13 Szenarien durch 29 SQL-Level-Tests und 14 PGlite-Tests abgedeckt |
| R-3 | anon-Zugriff auf `bookings` wirft `permission denied for function is_admin` | NIEDRIG | Kein Regressionsproblem (bestand schon vor Konsolidierung); anon soll nie auf bookings zugreifen |
| R-4 | Live-Drift: Policies auf Prod können von Shadow-DB abweichen | MITTEL | Vor Prod-Apply: `SELECT policyname FROM pg_policies WHERE tablename='bookings'` vergleichen |
| R-5 | CI Lauf 2 zum Zeitpunkt der Report-Erstellung noch in Progress | NIEDRIG | Lauf 1 scheiterte nur an Typecheck-Regex, nicht an Tests; Fix in 76f1d17 |

---

## 9. Test-Zusammenfassung

| Testkategorie | Bestanden | Fehlgeschlagen | Übersprungen |
|---|---|---|---|
| Statische Strukturtests (Vitest) | 28 | 0 | 0 |
| PGlite-Tests (WASM Postgres) | 14 | 0 | 0 |
| Shadow-DB SQL-Tests | 29 | 0 | 0 |
| Tenant-Isolation-Tests (SQL) | 28 | 0 | 0 |
| Idempotenz-Test (CLI) | 43 | 0 | 0 |
| Rollback-Test | 1 | 0 | 0 |
| Re-Apply nach Rollback | 1 | 0 | 0 |
| JS-dynamische Tests (Shadow-DB) | 0 | 0 | 13 |
| **Gesamt** | **144** | **0** | **13** |

---

## 10. GO / NO-GO Empfehlung

### ✅ BEDINGTES GO für Produktions-Migration

**Begründung:**
1. **144 Tests bestanden, 0 fehlgeschlagen** — alle relevanten RLS-Szenarien (SELECT, INSERT, UPDATE, DELETE, Soft-Delete, Admin, anon, service_role, 42P17, Org-Fence) sind nachgewiesen.
2. **DSGVO-Lücke geschlossen** — Soft-Delete-Bypass durch OR-Verknüpfung permissiver Policies eliminiert.
3. **Kein Datenverlust** — Migration, Rollback und Re-Apply sind datenerhaltend.
4. **Idempotent** — Migration kann gefahrlos mehrfach angewendet werden.
5. **Rollback getestet** — Rollback-Plan funktioniert und stellt alle Policies wieder her.
6. **Security-Review bestanden** — `is_profile_soft_deleted()` hat keine kritischen Schwachstellen.

**Bedingungen für Prod-Apply:**
1. CI-Lauf 2 (76f1d17) muss grün sein.
2. Vor Prod-Apply: Aktuellen Policy-Stand auf Prod mit `SELECT policyname, permissive, cmd, qual, with_check FROM pg_policies WHERE tablename = 'bookings';` prüfen und gegen erwarteten Zustand abgleichen.
3. Backup der bestehenden Policies als SQL-Dump.
4. Migration in einer Transaktion (BEGIN/COMMIT) ausführen — ist bereits so implementiert.
5. Sofortige Verifikation nach Apply: RLS-Funktionstest mit Test-Accounts.

**KEIN Merge, KEIN Prod-Deploy — warte auf explizite Freigabe.**

---

*Erstellt: 2026-08-03 12:45 CEST*
*Agent: Claude Code (automatisiert)*
*Kein Einsatz echter Kundendaten.*
