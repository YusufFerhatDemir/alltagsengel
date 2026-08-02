# Phase 3 Production Readiness — GO/NO-GO Report v2

**Datum:** 2026-08-03
**Branch:** `audit/phase3-production-readiness` · **PR:** [#22](https://github.com/YusufFerhatDemir/alltagsengel/pull/22)
**Basis-Commit dieser Session:** `022b4e4` (P0-Fix auto-invoice) — die in diesem Report beschriebenen P1-Fixes werden mit dem Folge-Commit gepusht.
**Vorgänger:** `audit/GO_NO_GO_REPORT.md` (v1, NO-GO mit 2 Blockern B-1/B-2)
**Produktiv-DB:** in dieser Session **nicht berührt** (weder gelesen noch geschrieben). Alle Live-Tests liefen gegen die aus dem Repo gebaute Shadow-DB (lokales Postgres 16 + PostgREST + Auth-Shim).

---

## Empfehlung: **GO** — unter Vorbehalt der kontrollierten Live-Migration (Abschnitt 6)

Beide Blocker aus v1 sind geschlossen:

| # | Blocker (v1) | Status |
|---|---|---|
| B-1 | **P0:** `/api/billing/auto-invoice` Cross-Client-Leak | ✅ **Gefixt in `022b4e4`**, in dieser Session re-verifiziert (Code-Review + 7/7 Security-Tests + Regressionslauf) |
| B-2 | **P1:** `profiles.deleted_at` + `account_deletion_tokens` fehlen live → DSGVO-Löschroute bricht | ✅ **Migration verifiziert & gehärtet**, DSGVO-Flow Ende-zu-Ende gegen Shadow-DB bewiesen (11/11 Tests), Rollback real getestet. Live-Apply steht noch aus (bewusst — Stoppregel), Anleitung in Abschnitt 6 |

**Wichtig:** Die Session hat dabei **zwei zuvor unbekannte Defekte in der Migrationskette gefunden und gefixt**, die ein naives Live-Apply von `20260419_soft_delete.sql` (der v1-Plan M-2!) **live hätten eskalieren lassen** — Details in Abschnitt 3. Der v1-Satz „B-2 = kontrolliertes Live-Apply der idempotenten Migration" wäre so nicht sicher gewesen.

---

## 1. B-1-Verifikation (Commit `022b4e4`)

Geänderte Dateien laut `audit/P0_FIX_REPORT_ALLTAGSENGEL.md` gegen den Code geprüft (`app/api/billing/auto-invoice/route.ts`, `__tests__/security/p0-auto-invoice-cross-client.test.ts`):

- Auth-Kontext typisiert (`admin` vs. `caregiver` + `caregiverId`) ✓
- `service_record_id`-Pfad: `rec.caregiver_id === auth.caregiverId` erzwungen (403) ✓
- `client_id`+`month`-Pfad: assignments- oder Eigen-Record-Check **vor** jedem Datenzugriff; unbekannte `client_id` → 403 (kein Existenz-Orakel) ✓
- Klienten-Load (Versicherungsdaten) und Monats-Records erst **nach** bestandenem Check ✓
- `organization_id` auf `invoices`- **und** `invoice_items`-Inserts explizit aus `clients.organization_id`; Abbruch 404 statt Torso-Rechnung ✓
- `service_role` bleibt nötig (RLS verbietet Caregiver-Invoice-Inserts), ist aber vollständig hinter den Checks gekapselt ✓

Keine Regression gefunden; die 7 Security-Tests decken alle Angriffs- und Positivpfade ab und sind grün (Abschnitt 4).

## 2. B-2: DSGVO-Löschroute — was in dieser Session gemacht wurde

1. **Migration `20260419_soft_delete.sql` geprüft:** war bereits idempotent (`IF NOT EXISTS` / `DROP POLICY IF EXISTS` durchgängig; Zweitlauf fehlerfrei) — aber mit zwei ernsten Defekten (Abschnitt 3), die gefixt wurden.
2. **Auf dem Branch angewendet** (Shadow-DB, voller Replay von null): `profiles.deleted_at` (timestamptz, partieller Index), `account_deletion_tokens` (PK `user_id`, `token` UNIQUE, RLS deny-all für Nicht-service_role) — Struktur verifiziert.
3. **Neue E2E-Suite `__tests__/shadow-db/dsgvo-account-deletion.test.ts`** (11 Tests): ruft die **echten Route-Handler** `/api/user/delete` (DELETE) und `/api/user/delete/undo` (GET) auf; gemockt sind nur Cookie-Session und Mail-Versand — alle DB-Zugriffe (Admin-Client, Re-Auth via Passwort) laufen real gegen die Shadow-DB. Ohne `SHADOW_*`-Env wird die Suite übersprungen (CI bleibt unverändert grün, nichts wird „grün gelogen").
4. **Rollback-Plan komplett neu geschrieben und real getestet** (Abschnitt 3c).

**Bewiesen (11/11 PASS):**

| # | Beleg |
|---|---|
| 1 | Ohne Session → 401 |
| 2 | Falsches Passwort → 401, `deleted_at` bleibt NULL |
| 3 | Baseline: anderer Nutzer sieht das Profil (RLS-Ausgangslage) |
| 4 | DELETE korrekt → 200, `deleted_at` gesetzt, 64-Hex-Token mit ~60 Tagen Gültigkeit angelegt, Widerruf-Mail (Mock) erhält exakt den DB-Token, `signOut()` ausgeführt |
| 5 | Nach Soft-Delete: Profil für andere authentifizierte Nutzer **und** anon unsichtbar (RLS `deleted_at IS NULL`) |
| 6 | Zweiter DELETE idempotent → 200, Token regeneriert |
| 7 | Undo mit unbekanntem Token → Redirect `undo_error=token_not_found`, Löschung bleibt |
| 8 | Undo mit gültigem Token → Redirect `reactivated=1`, `deleted_at` = NULL, Token verbrannt (`confirmed_at`) |
| 9 | Nach Undo: Profil wieder sichtbar |
| 10 | Verbrannter Token erneut → `undo_error=already_used`, Reaktivierung bleibt |
| 11 | Soft-deleted **Engel** verschwindet auch aus der Marktplatz-Discovery-Policy (Regression für Neufund N-3) |

## 3. Neue Befunde dieser Session (alle gefixt)

### N-1 (P0 für den Live-Apply-Plan): 42P17-Policy-Rekursion `profiles ↔ bookings`

`Admins can manage all bookings` (aus `20260319`) prüft Admin-Rechte per direktem Sub-SELECT auf `profiles`; seit dem Profiles-Hardening (`20260414`) referenziert `profiles` seinerseits `bookings` (`profiles_select_booking_partner`). Ergebnis: **jeder** authenticated/anon SELECT auf `profiles` (und transitiv `bookings`, `messages`, …) wirft `ERROR 42P17 infinite recursion` — auf der Shadow-DB reproduziert. Zusätzlich enthielt `20260419` selbst sechs weitere direkt-rekursive profiles-Subqueries (Policy auf `profiles` selbst + 5 Nachbartabellen).

**Live ist davon aktuell nichts zu sehen — aber nur wegen Policy-Drift** (Live-Admin-Checks laufen über `is_admin()`). Ein Live-Apply der unfixten `20260419` hätte die rekursiven Policies **live installiert und profiles-/bookings-SELECTs für alle Kunden gebrochen.**

**Fix:**
- `20260419_soft_delete.sql`: Admin-Policy auf `public.is_admin()` umgestellt (SECURITY DEFINER bricht den Zyklus); `is_admin()` prüft jetzt zusätzlich `deleted_at IS NULL` (soft-deleted Admin verliert überall Admin-Rechte); neuer Helper `is_profile_soft_deleted(uuid)` (SECURITY DEFINER) ersetzt die profiles-Subqueries in den Policies auf angels/bookings/messages/documents/notifications/care_eligibility.
- **Neue Migration `20260803000000_fix_rls_recursion_bookings_admin.sql`**: ersetzt `Admins can manage all bookings` durch `is_admin()`-Variante.
- Beweis: authenticated SELECT auf profiles/bookings/messages/notifications/angels läuft fehlerfrei (vorher: 42P17).

### N-2 (P1): Der dokumentierte Rollback-Plan der Migration war nicht ausführbar

`DROP COLUMN deleted_at` scheitert, weil Policies von der Spalte abhängen; der Kommentar-Plan („Policies aus fix_rls_policies.sql neu anwenden") hätte zudem ~60 fremde Policies auf einen veralteten Stand zurückgedreht und `is_admin()` funktionsunfähig zurückgelassen (referenziert nach dem Fix `deleted_at`). **Neuer Plan** (in der Migration dokumentiert, auf der Shadow-DB real durchexerziert): Policies zuerst auf Vor-Soft-Delete-Definition zurücksetzen → Funktionen zurücksetzen/droppen → dann `DROP COLUMN … CASCADE` + `DROP TABLE`. Ergebnis des Tests: Struktur sauber entfernt, **0 Zeilenverlust** (profiles/bookings/messages), DB auch im zurückgerollten Zustand voll abfragbar, Re-Apply stellt das Feature vollständig wieder her.

### N-3 (P1, DSGVO): Soft-deleted Engel blieben sichtbar

`profiles_select_engels` und `profiles_select_booking_partner` (20260414) prüfen `deleted_at` nicht; permissive Policies sind OR-verknüpft — ein gelöschter **Engel** wäre trotz Soft-Delete für jeden angemeldeten Nutzer sichtbar geblieben (Marktplatz-Discovery), ein gelöschter Buchungspartner für seine Gegenseite. **Fix in `20260803000000`** (beide Policies mit `deleted_at IS NULL`-Filter), Regression = Test 11.

## 4. Testmatrix (alle Läufe lokal, 2026-08-03, nach allen Fixes)

| Lauf | Ergebnis |
|---|---|
| Shadow-DB-Replay von null (Bootstrap + initial-setup + **44** Migrationen, inkl. neuer `20260803000000`) | ✅ 44/44 Dateien, 0 Fehler |
| SQL-Tenant-Tests (Isolation, Rollen, Storage, Struktur) | ✅ 28/28 PASS |
| Idempotenz: Zweitlauf aller 42 Migrationen auf gebauter DB | ✅ 42/42 |
| Rollback-Zyklus (Rollback → Datenintegrität → Queries → Re-Apply) | ✅ (Abschnitt 3, N-2) |
| Backup (`pg_dump`) + Restore | ✅ |
| `npx vitest run` **mit** Shadow-Stack (alle dynamischen Tests scharf) | ✅ **58 passed, 0 skipped** — darin: 7/7 P0-auto-invoice, 11/11 DSGVO-E2E, 4/4 dynamische RLS |
| `npx vitest run` **ohne** Shadow-Env (= CI-Modus) | ✅ 43 passed, 16 skipped (nur die dynamischen Shadow-Suiten; kein Fake-Grün) |
| `npm run test:unit` (node:test, `lib/**`) | ✅ 29/29 |
| `npx tsc --noEmit` | ✅ 0 Fehler |

Regressions-Doppellauf: die volle Matrix lief **nach** der P1-Migration und allen Policy-Fixes erneut — identisch grün.

## 5. Status aller Befunde

| Prio | Befund | Status |
|---|---|---|
| P0 | B-1 auto-invoice Cross-Client-Leak | ✅ gefixt (`022b4e4`), re-verifiziert |
| P0* | N-1 42P17-Rekursion (hätte Live-Apply gebrochen) | ✅ gefixt (dieser Commit) |
| P1 | B-2 DSGVO-Löschroute live kaputt | ✅ auf Branch bewiesen; **Live-Apply ausstehend** (Abschnitt 6) |
| P1 | N-2 Rollback-Plan defekt | ✅ gefixt + real getestet |
| P1 | N-3 Soft-deleted Engel sichtbar | ✅ gefixt (dieser Commit) |
| P1 | T-1 `current_org_id()` fail-open (Stamm-Org-Fallback) | ⏳ offen — M-3 (v1), Gate erst für echtes Zweit-Mandanten-Onboarding |
| P1 | 9 org-blinde Service-Role-Routen (M-3) | ⏳ offen — kein Cross-Client-Ownership-Leck (v1, Abschnitt 3) |
| P1 | Policy-Drift Live↔Repo (M-4) | ⏳ offen — durch N-1 **dringlicher geworden**: der Repo-Replay ist erst seit dieser Session funktional äquivalent testbar |
| P2 | 24 P2-Routen-Befunde, Repo-only-Tabellen, DSGVO-TTL (M-5) | ⏳ offen |

## 6. Vorbehalt: kontrolliertes Live-Apply (der eine verbleibende Schritt zu B-2)

Diese Session hat die Produktiv-DB regelkonform nicht angefasst. Für die Production-Freigabe des DSGVO-Flows müssen `20260419_soft_delete.sql` (gefixte Fassung!) und `20260803000000_fix_rls_recursion_bookings_admin.sql` live angewendet werden. Checkliste:

1. **Vorher Live-Policy-Dump ziehen** (Namen + Quals der Tabellen profiles/angels/bookings/messages/documents/notifications/care_eligibility) — Vergleichsbasis.
2. Beide Migrationen in Datei-Reihenfolge anwenden (idempotent, transaktional).
3. **Drift-Falle prüfen:** die Migration droppt Policies **per Namen**. Live existierende Alt-Policies mit *anderen* Namen (z. B. türkische Namen wie „Herkes profilleri okuyabilir") werden davon nicht erfasst; da permissive Policies OR-verknüpft sind, würde eine breitere Alt-SELECT-Policy soft-deleted Profile **weiter freigeben**. Nach dem Apply prüfen: `SELECT policyname, qual FROM pg_policies WHERE tablename='profiles' AND cmd='SELECT';` — jede Policy ohne `deleted_at`-Filter (außer Admin-/Self-Pfade) muss gedroppt oder gefiltert werden.
4. Smoke-Test gegen Preview/Prod: Login → Konto löschen (Testaccount) → Mail-Link → Undo; parallel prüfen, dass profiles-/bookings-Queries normal funktionieren (Rekursions-Gegenprobe).
5. Rollback-Weg: dokumentierter Plan im Migrations-Kopf (getestet, Abschnitt 3/N-2); App-seitig `./scripts/rollback.sh <N> --push`.

## 7. Verbleibende Risiken

- **Live-Apply selbst** (Abschnitt 6): Policy-Drift kann Alt-Policies mit abweichenden Namen zurücklassen — Schritt 3 der Checkliste ist Pflicht, sonst ist die DSGVO-Unsichtbarkeit live nicht garantiert.
- `is_profile_soft_deleted(uuid)` ist für authenticated/anon als RPC aufrufbar (bewusst: Policies brauchen EXECUTE) und verrät pro UUID ein Boolean — kein Datenabfluss, aber ein minimales Status-Orakel; akzeptiert.
- Hard-Delete nach 60 Tagen (pg_cron-Edge-Function) ist im Konzept beschrieben, aber **nicht Teil dieses Branches** — bis dahin bleiben soft-deleted Daten in der DB (DSGVO-konform während der Widerrufsfrist, danach offener Punkt für M-5).
- Die offenen M-3/M-4/M-5-Punkte aus v1 (org-blinde SR-Routen, Policy-Konsolidierung, fail-open `current_org_id()`) bestehen unverändert; keiner ist Merge-Gate.
- CI-Ehrlichkeit unverändert: Lint-Step ist informativ (`|| true`), alle übrigen Gates hart.

## 8. Commit-IDs

| Commit | Inhalt |
|---|---|
| `ac828d6` | Schema-Gap-Schließung, Shadow-DB-Toolchain, Audits (v1-Basis) |
| `7662a50` | GO/NO-GO-Report v1 (NO-GO mit B-1/B-2) |
| `022b4e4` | **P0-Fix B-1** auto-invoice + 7 Security-Tests |
| *(dieser Commit)* | **P1 B-2**: 20260419 gehärtet (Rekursion, is_admin, Helper, getesteter Rollback-Plan), neue Migration `20260803000000` (Rekursion bookings-Admin + DSGVO-Sichtbarkeit engels/booking_partner), DSGVO-E2E-Suite (11 Tests), Report v2 |

## 9. Eingehaltene Stoppregeln

❌ Kein Merge von PR #22 · ❌ kein Push auf `main` (nur `audit/phase3-production-readiness`) · ❌ keine Änderung an der Produktiv-DB (in dieser Session nicht einmal read-only kontaktiert) · ❌ keine `service_role` für normale Benutzerzugriffe (Route-Kapselung geprüft; Tests nutzen service_role nur als Test-Fixture-Verwaltung) · ✅ bei den zwei fehlgeschlagenen Zwischenläufen (42P17) wurde gestoppt, Ursache diagnostiziert und gefixt statt übergangen.
