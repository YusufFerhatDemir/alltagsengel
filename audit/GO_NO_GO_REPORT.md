# Phase 3 Production Readiness — GO/NO-GO Report

**Datum:** 2026-08-02
**Branch:** `audit/phase3-production-readiness` · **PR:** [#22](https://github.com/YusufFerhatDemir/alltagsengel/pull/22)
**Head-Commit:** `ac828d6a62d4246624292a222e2a0fde1fa2d510`
**Supabase-Projekt:** `nnwyktkqibdjxgimjyuq` (nur read-only introspiziert — **keine Produktivmigration, kein Merge, kein Production-Deployment ausgeführt**)

---

## Empfehlung: **NO-GO für sofortigen Merge → Production** — GO nach Abschluss von 2 P0/P1-Fixes

Die Datenbank-Schicht ist in deutlich besserem Zustand als angenommen (Tenant-Isolation live aktiv und real getestet, Schema-Lücke im Repo geschlossen). Die verbleibenden Blocker liegen in der **Applikations-Schicht** (Service-Role-Routen) und sind klar umrissen:

| # | Blocker | Warum NO-GO |
|---|---|---|
| B-1 | **P0:** `/api/billing/auto-invoice` — Caregiver-Pfad erlaubt jedem Caregiver Rechnungserzeugung + Einsicht für **beliebige** Klienten (Body-`client_id` ungeprüft, service_role) | Cross-Client-Datenleck, abrechenbar |
| B-2 | **P1:** `profiles.deleted_at` + `account_deletion_tokens` fehlen LIVE → `/api/user/delete` (+ `/undo`) bricht zur Laufzeit | DSGVO-Art.-17-Flow ist live funktional kaputt |

Beides ist ohne Produktivmigrations-Risiko behebbar (B-1 reiner Code-Fix; B-2 = kontrolliertes Live-Apply der idempotenten Migration `20260419_soft_delete.sql` — bewusst NICHT in dieser Session ausgeführt, Stoppregel).

---

## 1. PR- & Vercel-Status (PR #22)

| Check | Commit | Status |
|---|---|---|
| CI „Typecheck, Lint, Tests, Build" (Run 30769027256) | `ac828d6` | ✅ success — **alle 15 Steps `success`, 0 skipped, 0 continue-on-error-Fehler** (Steps einzeln via `gh run view --json jobs` verifiziert) |
| Vercel – alltagsengel (Preview) | `ac828d6` | ✅ success — „Deployment has completed" |
| Vercel – alltagsengel-deploy (Preview) | `ac828d6` | ✅ success — „Deployment has completed" |
| Commit-Status gesamt (GitHub Status API) | `ac828d6` | ✅ `success` |

**Vorheriger Head `de57fb6`:** CI-Run 30725929116 ✅ success (alle 12 Steps grün), beide Vercel-Previews ✅ „Deployment has completed".

**Frühere Fehler?** Auf diesem Branch existiert **kein** fehlgeschlagener CI-Run und **kein** fehlgeschlagenes Vercel-Deployment: die Commits `47dd8f1`…`9b93a49` tragen gar keine Checks (in einem Push gebündelt — CI/Vercel bauen nur den Push-Head). Rot-Meldungen aus früheren Sessions bezogen sich nicht auf diesen Branch-Stand.

**CI-Ehrlichkeit (wichtig):** Der Step **„Lint (informativ)" läuft mit `npm run lint || true` und ist damit NICHT blockierend** (~1.100 bekannte `no-explicit-any`-Altfehler, siehe Workflow-Kommentar). Er darf nicht als „grün" gewertet werden — er ist „ausgeführt, Ergebnis ignoriert". Alle übrigen Steps (Typecheck, vitest, node:test, Secret-Scan, IK-Check, Forbidden-Strings, Production-Build) sind harte Gates ohne `continue-on-error`, ohne Skips.

## 2. Database Schema Gap (Details: `DATABASE_SCHEMA_GAP_REPORT.md`)

- **Leere DB ist jetzt vollständig aus dem Repo baubar** — bewiesen per Replay (43 Dateien, 0 Fehler). Die 61 historisch nur live existierenden Tabellen (clients, caregivers, service_records, invoices, …) sind als Baseline-Migrationen rekonstruiert (`20260101000000/-100`, `20260802000100/-200` — aus Live-OpenAPI-Introspektion).
- **Live-RLS-Stand verifiziert** (read-only via `audit_rls_all_policies()`): 124 Tabellen, **0 ohne RLS**; 67 mit `organization_id`, **65 `*_org_fence`-Policies, alle RESTRICTIVE** — identisch mit dem Repo-Aufbau. **Die Phase-3-Migration `20260801` IST live** (Memory-Annahme „noch offen" war veraltet).
- **Fehlende Tabellen im Repo: keine mehr.** Umgekehrt: 8 Repo-Tabellen fehlen live (documents, payments, carebox_*, care_eligibility, analytics_events, account_deletion_tokens) — live nie angewendete Migrationen/Setups, davon 1 kritisch (B-2).
- **Policy-Drift (P1):** 407 Live- vs. 338 Repo-Policies; 166 Namen nur live / 97 nur Repo. Klassifiziert: großteils Namens-Drift (alte türkische Policy-Namen live) + redundante `*_service_all` + feinere `mis_*_staff_*`-Abstufung nur live. Kein Isolations-Loch, aber Repo-Replay ≠ Live-Policy-Landschaft → Konsolidierungs-Migration empfohlen (E-2).
- **Storage:** alle 4 Live-Buckets privat; Bucket `abrechnung` fehlte im Repo → ergänzt (`20260802000200`).
- **Grenzen:** Live-Trigger/-Check-Constraints/storage-Objekt-Policies sind ohne SQL-Zugang nicht introspizierbar (Empfehlung E-4: Audit-RPCs ergänzen).

## 3. Tenant Route Coverage (Details: `TENANT_ROUTE_COVERAGE.md`)

58 API-Routen + Edge Function + Server Components + Storage + RPCs + 3 Crons auditiert: **1× P0, 9× P1, 24× P2, 24× OK.**

- **P0:** `/api/billing/auto-invoice` (B-1 oben).
- **P1 (9):** `admin/abrechnung/zertifikat` (GET über alle Orgs), `admin/manage-role` + `admin/reset-password` (mandantenblinde Plattform-Rolle), `leistungsnachweis` (Admin-Pfad SR ohne Org-Filter), 3× `native/*` (SR-Inserts ohne `organization_id` → landen per `current_org_id()`-Default in der Stamm-Org), `pricing` (tenant_table via SR ungefiltert), `cron/review-request` (bookings aller Orgs).
- **Systemisch:** `getActiveOrgId()`/`requireOrgRole()` werden nur von `/api/organizations/*` + `/api/stripe/*` genutzt (dort vorbildlich, Client-Org-IDs stets gegen Mitgliedschaft validiert). Übriger Bestandscode ist org-blind: Anon-Key-Routen deckt die live aktive org_fence, **Service-Role-Routen nicht** (BYPASSRLS).
- **Client-übermittelte organization_id ungeprüft verwendet:** in den `/api/organizations/*`-Routen nein (validiert); Risiko konzentriert sich auf Body-IDs wie `client_id` in SR-Routen (B-1).

## 4. Shadow-DB Live-Test (Details: `SHADOW_DB_LIVE_TEST_REPORT.md`)

Lokales Postgres 16 (kein Docker, kein Supabase-Projekt, keine Produktivdaten):

| Schritt | Ergebnis |
|---|---|
| Aufbau von null aus Repo (Bootstrap → initial-setup → 41 Migrationen) | ✅ 43/43 Dateien |
| Seed Org A + Org B | ✅ |
| SQL-Tenant-Tests (SELECT/INSERT/UPDATE/DELETE/Rollen/Storage/service_role/Struktur) | ✅ **28/28 PASS** |
| **Bisher übersprungene dynamische supabase-js-RLS-Tests** — jetzt real via PostgREST + Auth-Shim (`scripts/shadow-db-http.sh`) | ✅ **4/4 PASS** (Suite 19/19, 0 skipped) |
| Idempotenz: Zweitlauf aller 41 Migrationen | ✅ 41/41 |
| Backup (`pg_dump`) + Restore + Objektzahl-Abgleich | ✅ identisch |

**Befund T-1 (P1):** `current_org_id()` ist fail-open — User ohne Org-Mitgliedschaft und service_role-Inserts fallen auf die Stamm-Org zurück (Test 19 belegt es). Deckt sich mit den P1-Routen-Befunden; Fix gehört zu Maßnahme M-2.

## 5. Maßnahmenplan (Reihenfolge)

| # | Prio | Maßnahme | Gate für |
|---|---|---|---|
| M-1 | **P0** | `auto-invoice`: Caregiver↔Klient-Zuordnung erzwingen (`service_records.caregiver_id === auth.caregiverId`) + `organization_id` am Insert | **Merge** |
| M-2 | **P1** | `20260419_soft_delete.sql` kontrolliert live anwenden (idempotent, `IF NOT EXISTS`) + `/api/user/delete` gegen Preview testen | **Production-Freigabe** |
| M-3 | P1 | SR-Schreibpfade org-explizit machen (Helper `insertWithOrg`), SR-Admin-Reads mit `.eq('organization_id', …)` fencen; danach `current_org_id()`-Fallback von Stamm-Org auf NULL härten (T-1) | SaaS-Onboarding echter Zweit-Mandanten |
| M-4 | P1 | Policy-Konsolidierungs-Migration (Repo-Replay ≡ Live), vorher Live-Policy-Dump als Fixture | Disaster-Recovery-Garantie |
| M-5 | P2 | Entscheid je Repo-only-Tabelle (documents/payments/carebox_* …): live anlegen oder entfernen; Introspektions-RPCs für Trigger/Constraints; DSGVO-TTL für visitors/page_views | — |

## 6. Eingehaltene Stoppregeln

- ❌ Kein Merge von PR #22 · ❌ kein Production-Deployment ausgelöst (nur automatische Vercel-**Preview**-Builds des Branch-Pushs) · ❌ keine Migration/kein Schreibzugriff auf die Produktiv-DB (ausschließlich `GET`/read-only-RPCs) · ❌ keine Produktivdaten in Tests (Shadow-DB mit synthetischem Seed).
