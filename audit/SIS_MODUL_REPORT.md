# SIS-Modul — Abnahme-Report (Stand 09.08.2026)

Strukturierte Informationssammlung: `sis_assessments` (Kopfsatz mit Eingangsfrage,
Statusmaschine `entwurf → abgeschlossen → gesperrt`), `sis_themenfelder` (Felder 1–6,
Feld 6 Haushaltsführung nur ambulant), `sis_risikomatrix` (Dekubitus, Sturz,
Inkontinenz, Schmerz, Ernährung — je `ja/nein/unklar` + Flag „weitere Einschätzung
notwendig").

Commits: `b5a485a` (Modul), `b88870b` (42P17-Fix + Shadow-Testsuite) auf
`staging/expansion-abnahme`. **Kein Merge nach main, kein Production-Apply** (Vorgabe
vom 09.08.).

## Status je Prüfstufe

| Stufe | Status | Nachweis |
|---|---|---|
| DB-Schema + Migration | **PASS (lokal)** | Migration läuft auf Von-null-Shadow-DB durch und ist idempotent re-applybar; Rollback-Skript vorhanden |
| Backend/API (`/api/sis/*`) | **PASS (Code)** | 6 Routen, `requirePflegeAdmin` + `createAdminClient`, `tsc` sauber |
| UI (`/admin/sis`) | **PASS (Code)** | Übersicht + Editor (Eingang, Themenfeld-Tabs, Risikomatrix), Nav-Eintrag; Browser-E2E offen (s. unten) |
| Unit-Tests | **PASS** | 18 neue node:test (Statusmaschine, Abschluss-Validierung, Feld-6-Regel, Sperr-Guards); Gesamtsuite 267/267 grün |
| Rollen-/Rechte-Test (E2E, echtes Postgres) | **PASS (Shadow-DB)** | `supabase/shadow/40_sis_tests.sql`: 28/28, zweifach gelaufen — Admin A/B nur eigene Org, Fence blockt Cross-Org-INSERT, Kunde 0 Zeilen, Engel nur aktiv zugewiesene Klienten (nur lesend), anon verweigert, Sperr-/updated_at-Trigger, CHECK/UNIQUE |
| Security-Review | **PASS (lokal)** | `is_admin()` statt profiles-Subquery; RESTRICTIVE-org_fence; Engel-Zugriff über SECURITY-DEFINER-Helfer `engel_hat_aktiven_klienten` (STABLE, `SET search_path`, kein anon/public-EXECUTE); `REVOKE` für anon auf allen 3 Tabellen; keine Secrets (precommit-guard grün) |
| Fachliche Prüfung (Domain) | **OFFEN (Yusuf)** | Struktur folgt dem SIS-Standard (Eingangsfrage aus Sicht der Person, 6 Themenfelder mit Leitfragen, Matrix der 5 pflegesensitiven Risiken); inhaltliche Abnahme durch Pflegefachkraft steht aus |
| Production-Verifikation | **BLOCKED** | Migration NICHT angewendet: `service_role` hat kein CREATE auf Schema `public` (42501, live nachgewiesen), `_run_sql` ist INVOKER → kein DDL-Weg in Agent-Sessions. `/admin/sis` liefert bis zum Apply „relation sis_assessments does not exist" |

**Gesamturteil: NICHT PASS** — blockiert allein durch den Production-Apply.

## Befund nebenbei: 42P17 im bestehenden Pflege-Modul

Die Engel-SELECT-Policies aus `20260810010000_pflegedokumentation.sql` subqueryen
`assignments` direkt; deren Policies enthalten profiles-Subqueries → in der Shadow-DB
wirft bereits `SELECT count(*) FROM pflege_aufnahmen` als eingeloggter Admin
`infinite recursion detected in policy for relation "assignments"`. Admin-API-Routen
sind unbetroffen (service_role, BYPASSRLS), aber jede direkte authenticated-Query
bricht. Fix-Muster liegt mit `engel_hat_aktiven_klienten()` vor; als separate Aufgabe
geflaggt.

## Abnahme-Checkliste für den Production-Apply (wenn freigegeben)

1. Apply aus einer Session **mit Supabase-MCP** (`execute_sql`, Projekt
   `nnwyktkqibdjxgimjyuq`) oder manuell im SQL-Editor:
   Inhalt von `supabase/migrations/20260818010000_sis_strukturierte_informationssammlung.sql`
   (idempotent, eine Transaktion, kein DROP/DELETE auf Bestandsobjekten).
2. `node scripts/verify-sis-migration.mjs` — 14 read-only Checks, muss `Exit 0`
   liefern (Tabellen+RLS, Policies, Rekursionsfreiheit, Helper-ACL, Trigger,
   anon-Blackbox, service_role-Durchlass). Vor dem Apply zeigt es erwartungsgemäß
   12/14 OFFEN.
3. Einmal Admin-Flow durchklicken: `/admin/sis` → SIS anlegen → Themenfeld speichern
   → Risikomatrix bewerten → abschließen → sperren.
4. Rollback im Notfall: `20260818010001_rollback_…` (⚠ löscht erfasste SIS-Daten).
