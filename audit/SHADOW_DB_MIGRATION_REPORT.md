# Shadow-DB Migrationstest & Tenant-Isolation — Report

**Datum:** 2026-08-01
**Branch:** `audit/phase3-production-readiness`
**Supabase-Projekt:** `nnwyktkqibdjxgimjyuq`
**Auftrag:** Isolierte Shadow-DB aufsetzen, Multi-Mandanten-Fähigkeit (Phase 3) und RLS-Policies testen.

---

## 0. Kurzfassung

Eine **echte** Shadow-Datenbank konnte in dieser Umgebung nicht aufgesetzt werden (siehe Abschnitt 1 — kein Supabase-Access-Token, kein Docker). Es wurde daher **Option C** umgesetzt: Testdaten-SQL und eine Test-Suite wurden vollständig erstellt (lauffähig, sobald eine Shadow-DB verfügbar ist), zusätzlich wurde die Migrations- und RLS-Struktur **statisch** ausgewertet.

Der statische Teil hat dabei einen **konkreten, reproduzierbaren Blocker** für Option A/B gefunden: **ein reiner Replay von `supabase/migrations/*.sql` auf einer leeren Datenbank schlägt fehl**, weil zentrale Tabellen (`clients`, `caregivers`, `service_records`, `invoices`, `fahrzeuge`, u.a. — 31 von 65 mandantenfähigen Tabellen) nur live in Supabase existieren und nirgends per `CREATE TABLE` angelegt werden. Das war vorher schon aus der Session-Memory bekannt (`betriebssystem-schema.md`), wird hier aber erstmals mit einem konkreten Fehlerpunkt belegt.

| Was | Status |
|---|---|
| Supabase-Branching (Option A) | ❌ Kein Access-Token in dieser Umgebung |
| Lokales `supabase start` (Option B) | ❌ Docker nicht installiert |
| Statische + vorbereitete dynamische Tests (Option C) | ✅ umgesetzt |
| `supabase/seed-shadow.sql` | ✅ erstellt (defensiv, läuft gegen unvollständige Schemas) |
| `__tests__/shadow-db/tenant-isolation.test.ts` | ✅ erstellt — 15 Tests laufen **heute** grün, 5 Tests warten auf eine echte Shadow-DB |
| Migrations-Replay auf leerer DB | ❌ bricht nachweislich (siehe 2.2) — noch nie getestet, da hierfür live-Schema fehlt |
| RLS-Fence-Struktur (statisch) | ✅ korrekt angelegt, siehe 3 |
| Server-seitige Org-Isolation (statisch) | ⚠️ nur 3 von ~60 Tabellen-Routen filtern aktiv nach `organization_id` |

---

## 1. Warum keine echte Shadow-DB (Option A/B)

```
$ npx supabase projects list
{"error":{"code":"LegacyPlatformAuthRequiredError","message":"Access token not provided..."}}

$ docker info
command not found: docker
```

- Kein `SUPABASE_ACCESS_TOKEN` in der Umgebung → `supabase branches create` nicht möglich.
- Kein Docker installiert → `supabase start` (lokaler Postgres via Docker) nicht möglich.
- Es wurde **nicht** versucht, gegen die Produktions-DB zu testen (explizit verboten).

**Empfehlung:** Wenn eine echte Shadow-DB gewünscht ist, entweder (a) `supabase login` einmalig interaktiv im Terminal ausführen und den Access-Token danach als Secret hinterlegen, oder (b) Docker Desktop installieren. Danach sind `seed-shadow.sql` und die dynamischen Tests in `tenant-isolation.test.ts` ohne weitere Änderungen lauffähig (Env-Variablen siehe Abschnitt 5).

---

## 2. Migrations-Audit (statisch, 37 Dateien)

### 2.1 Struktur & Reihenfolge
- 37 zeitgestempelte Migrationen (`20260301` … `20260801`) + 1 unzeitgestempelte `fix_rls_policies.sql` (früher Sicherheits-Fix, chronologisch vor den datierten Dateien einzuordnen).
- Alle 37 Dateien sind transaktional (`BEGIN; … COMMIT;`, geprüft: Klammerung ausgeglichen).
- Keine Migration enthält ein destruktives `DROP TABLE` oder `TRUNCATE` im Code (ein Treffer war nur ein auskommentierter Beispielbefehl in `20260419_soft_delete.sql`). Ein `DELETE FROM` mit `WHERE`-Klausel existiert in `20260417_admin_audit_log.sql` (Audit-Log-Retention, unkritisch).
- Alle Migrationen sind idempotent geschrieben (`IF NOT EXISTS`, `ON CONFLICT DO NOTHING/UPDATE`, `DROP POLICY IF EXISTS` vor `CREATE POLICY`) — mehrfaches Anwenden ist sicher.

### 2.2 Kritischer Befund: 31 von 65 mandantenfähigen Tabellen existieren nicht in den Migrationen

Die Phase-3-Migration (`20260801_phase3_multi_mandant_saas.sql`) listet 65 Tabellen im `tenant_tables`-Array, die eine `organization_id`-Spalte + RLS-Fence bekommen sollen. Ein Abgleich gegen alle `CREATE TABLE`-Statements in `supabase/migrations/*.sql` und `supabase/initial-setup.sql` zeigt:

**31 dieser Tabellen werden nirgends per Migration angelegt** — u.a. `clients`, `caregivers`, `applications`, `assignments`, `bookings`, `fahrzeuge`, `invoices`, `invoice_items`, `service_records`, `client_budgets`, `caregiver_documents`. Sie wurden offensichtlich direkt im Supabase-Dashboard/SQL-Editor angelegt (konsistent mit der bestehenden Memory-Notiz `betriebssystem-schema.md`).

Die Phase-3-Migration selbst ist dagegen defensiv geschrieben — sie prüft vor jedem `ALTER TABLE` `information_schema.tables` und überspringt fehlende Tabellen mit `RAISE NOTICE`. **Andere, ältere Migrationen prüfen das nicht:**

```sql
-- supabase/migrations/20260719_eylem_audit_complete_features.sql:126
CREATE TABLE IF NOT EXISTS public.verordnungen (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id           uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    ...
```

Auf einer leeren Datenbank (reiner Migrations-Replay ohne vorheriges Anlegen von `clients`) bricht dieser Befehl mit `relation "public.clients" does not exist` ab. Zwei weitere Migrationen referenzieren `clients` in ähnlicher Weise ohne Existenzprüfung: `20260704_rls_lockdown_internal_tables.sql` (Policy auf `public.clients`) und `20260705_crm_module_tables.sql` (`ALTER TABLE clients …`).

→ **Ein vollständiger Migrations-Replay funktioniert erst, wenn zusätzlich ein Schema-Dump der live-only-Tabellen vorgeschaltet wird** (z.B. `supabase db dump --schema public --data-only=false` gegen das echte Projekt, oder ein manuell gepflegtes `initial-setup-2.sql`). Das war mit den hier verfügbaren Mitteln (kein Access-Token) nicht durchführbar und ist der Hauptgrund, warum Option A/B ausschied — nicht nur Docker/Token fehlten, sondern selbst mit ihnen wäre der Migrations-Ordner allein nicht ausreichend.

Ein Regressionstest dafür ist jetzt in der Suite (`Statisch: Live-only-Tabellen`, siehe Abschnitt 4) — er schlägt fehl, sobald eine **neue, bisher unbekannte** Live-only-Tabelle im `tenant_tables`-Array auftaucht, ohne dokumentiert zu werden.

### 2.3 Multi-Mandanten-Tabellen selbst — korrekt
`organizations`, `organization_members`, `organization_subscriptions` werden alle drei per Migration angelegt (keine Live-only-Abhängigkeit), inkl. Indizes, `updated_at`-Trigger und Stamm-Org-Backfill (`00000000-0000-4000-8000-000460629986`, kodiert IK 460629986). Das ist der einzige Teil von Phase 3, der auf einer leeren DB tatsächlich vollständig durchläuft.

---

## 3. RLS-Policy-Analyse (statisch)

### 3.1 Fence-Mechanismus
Jede der (existierenden) 34 mandantenfähigen Tabellen bekommt eine **RESTRICTIVE**-Policy:

```sql
CREATE POLICY "<table>_org_fence" ON public.<table> AS RESTRICTIVE FOR ALL
  USING (organization_id = public.current_org_id())
  WITH CHECK (organization_id = public.current_org_id());
```

RESTRICTIVE-Policies werden mit UND an alle bestehenden PERMISSIVE-Policies (z.B. die `is_admin()`-Policies aus dem RLS-Lockdown vom 2026-07-04/05) angehängt — ein Admin von Org A sieht damit korrekt **keine** Daten von Org B, selbst wenn seine `is_admin()`-Policy grundsätzlich vollen Zugriff gäbe. Das Konstruktionsprinzip ist korrekt.

### 3.2 `current_org_id()` — Fallback-Kette
```
1. JWT app_metadata.org_id   (nur serverseitig setzbar → vertrauenswürdig)
2. organization_members-Lookup (älteste Mitgliedschaft)
3. Fallback: Stamm-Org Alltagsengel
```
Alle drei Helper-Funktionen (`current_org_id`, `is_org_member`, `has_org_role`) sind `SECURITY DEFINER` mit `SET search_path = public` (schützt vor Search-Path-Hijacking) und haben `REVOKE ALL … FROM public` + gezielte `GRANT` an `authenticated`/`service_role`. Das folgt denselben Mustern wie die bestehenden `is_admin()`/`is_internal_staff()`-Funktionen aus dem RLS-Lockdown.

### 3.3 service_role-Bypass — wichtige Einschränkung
`service_role` hat `BYPASSRLS` und wird von der RESTRICTIVE-Fence **nicht** eingeschränkt — das ist gewollt (Admin-Panel/Server-APIs sollen weiter funktionieren), bedeutet aber: **Die RLS-Fence schützt nur den direkten PostgREST-Zugriff mit User-JWT, nicht die eigenen Server-Routen.** Siehe Abschnitt 4.4.

---

## 4. Tenant-Isolation-Tests

Datei: `__tests__/shadow-db/tenant-isolation.test.ts` (Vitest, wie der Rest des Repos).

### 4.1 Statisch — läuft heute, ohne DB (15 Tests, alle grün)
```
$ npx vitest run __tests__/shadow-db/tenant-isolation.test.ts
 Test Files  1 passed (1)
      Tests  15 passed | 5 skipped (20)
```
- **Migrations-Struktur:** RESTRICTIVE-Fence-Pattern, `SECURITY DEFINER`, Grants/Revokes, Idempotenz, Transaktionsklammerung, `tenant_tables`-Vollständigkeit gegen eine Liste geschäftskritischer Tabellen.
- **Live-only-Tabellen-Regressionsguard:** parst alle 37 Migrationen, vergleicht `CREATE TABLE`-Treffer gegen das `tenant_tables`-Array, schlägt fehl bei unbekannten Lücken (aktueller Stand: 31 bekannte, dokumentierte Lücken — siehe 2.2).
- **`requireOrgRole()` (Admin-Routen-Guard), gemockt:** vier Fälle — nicht angemeldet (401), angemeldet ohne Mitgliedschaft (403), Mitglied mit unzureichender Rolle (403), Mitglied mit passender Rolle (ok). Deckt „Admin-Routen prüfen Organisationszugehörigkeit" aus dem Auftrag ab, ohne DB-Abhängigkeit.

### 4.2 Dynamisch — vorbereitet, aktuell übersprungen (5 Tests)
Aktiviert durch `SHADOW_SUPABASE_URL` / `SHADOW_SUPABASE_ANON_KEY` / `SHADOW_SUPABASE_SERVICE_ROLE_KEY`:
- Org-A-User → SELECT auf Org-B-Klient liefert leeres Ergebnis (kein Fehler, RLS filtert).
- Org-A-User → INSERT mit `organization_id = Org B` schlägt fehl (`WITH CHECK`).
- Org-A-User → UPDATE/DELETE auf Org-B-Klient betrifft 0 Zeilen.
- `service_role` liest weiterhin über beide Orgs hinweg (Admin-Panel-Pfad bleibt funktionsfähig).

Diese Tests sind **nicht** hypothetisch formuliert — sie referenzieren konkrete IDs/E-Mails aus `supabase/seed-shadow.sql` und können unverändert gegen eine echte Shadow-DB laufen, sobald eine verfügbar ist.

### 4.3 `supabase/seed-shadow.sql`
- 2 Test-Organisationen (Frankfurt, München) mit festen, von der Stamm-Org unterscheidbaren UUIDs (`aaaaaaaa-…` / `bbbbbbbb-…`).
- Je Org: 1 Admin (Org-Rolle `owner`), 1 Alltagsbegleiter, 1 Fahrer (beide `profiles.role = 'engel'` — es gibt in `initial-setup.sql` kein eigenes `role='fahrer'`, unterschieden nur über Vor-/Nachname im Testdatensatz; siehe 4.5).
- Klienten mit Pflegegrad, Verordnung + Genehmigungsstatus, ein Einsatz (`service_records`) und ein Rechnungsentwurf (`invoices`) je Org.
- Fahrzeug je Org (`fahrzeuge`).
- Jeder Block prüft per `information_schema`, ob die Zieltabelle/-spalte existiert, und überspringt mit `RAISE NOTICE` statt hart zu brechen — das Skript ist damit auch gegen eine **unvollständige** Shadow-DB robust (z.B. wenn nur die Migrationen, aber nicht das Live-Schema eingespielt wurden).
- Test-Passwort für alle Seed-User: `ShadowTest123!` — **ausschließlich für eine isolierte Shadow-DB**, niemals gegen Produktion verwenden.

### 4.4 Nicht von RLS abgedeckt: Server-Routen filtern größtenteils NICHT nach `organization_id`
Stichprobenauswertung (`grep` über `app/api` + `lib`):

| Tabelle | Routen, die die Tabelle nutzen | davon mit `organization_id`/`getActiveOrgId` |
|---|---|---|
| `clients` | 6 | 2 |
| `care_recipients` | 0 | 0 |
| `service_records` | 10 | 0 |
| `invoices` | 2 | 0 |
| `bookings` | 6 | 0 |

Nur 3 Routen im gesamten Repo verwenden `getActiveOrgId()`/filtern explizit nach `organization_id`: `app/api/organizations/subscription`, `app/api/organizations/route.ts`, `app/api/stripe/webhook` + `lib/stripe/helpers.ts`. Das ist exakt das im Migrations-Kommentar selbst benannte Risiko:

> „service_role hat BYPASSRLS → alle bestehenden Server-API-Routen laufen unverändert. Serverseitiger Code MUSS bei Schreibzugriffen für fremde Mandanten organization_id explizit setzen."

**Solange es nur die Stamm-Org gibt, ist das harmlos** (jede Zeile landet ohnehin dort, Fallback greift). **Sobald eine zweite, echte Organisation onboarded wird, ist das ein aktives Datenleck**: Die Admin-/MIS-Oberfläche läuft mit `service_role` (RLS-Bypass) und liefert bei `select()` ohne `.eq('organization_id', …)` Zeilen **aller** Organisationen zurück, nicht nur der eigenen. Die RESTRICTIVE-RLS-Fence schützt hier nicht, weil sie nur für Rollen mit RLS-Durchsetzung (nicht `service_role`) gilt.

### 4.5 Namensabweichung zum Auftrag
Der Auftrag nennt „Einsätze (service_visits)" — die tatsächliche Tabelle heißt `service_records` (bestätigt u.a. durch `20260702_fix_service_records_check_constraints.sql` und diverse API-Routen). Eine Tabelle `service_visits` existiert nicht. Ebenso gibt es keine dedizierte „Touren"-Tabelle (weder live noch migriert) — `fahrzeuge` existiert, Touren-Zuordnung läuft vermutlich über `dispatch_status`/`assignments` (nicht verifiziert, da deren Schema ebenfalls live-only ist). `seed-shadow.sql` seedet entsprechend `service_records` statt `service_visits` und lässt „Touren" mit einem `RAISE NOTICE`-Hinweis aus.

---

## 5. Aktivierung gegen eine echte Shadow-DB (sobald verfügbar)

```bash
# 1) Branch anlegen (benötigt SUPABASE_ACCESS_TOKEN)
npx supabase branches create shadow-phase3 --project-ref nnwyktkqibdjxgimjyuq

# 2) Schema vollständig herstellen — NICHT nur supabase/migrations/ replayen
#    (siehe 2.2), sondern zusätzlich das Live-Schema der 31 admin-only
#    Tabellen übertragen, z.B. per `supabase db dump` gegen das Haupt-
#    projekt oder Schema-Export aus dem Dashboard.

# 3) Testdaten einspielen
psql "$SHADOW_DB_URL" -f supabase/seed-shadow.sql

# 4) Dynamische Tests aktivieren
SHADOW_SUPABASE_URL=https://<branch-ref>.supabase.co \
SHADOW_SUPABASE_ANON_KEY=<anon-key-der-branch> \
SHADOW_SUPABASE_SERVICE_ROLE_KEY=<service-key-der-branch> \
npx vitest run __tests__/shadow-db/tenant-isolation.test.ts
```

## 6. Rollback-Test

Nicht dynamisch ausführbar (keine Shadow-DB) — **statisch geprüft**:

- Die Phase-3-Migration erzeugt ausschließlich neue Objekte (Tabellen, Spalten, Policies, Funktionen) und modifiziert keine bestehenden Spalten destruktiv. Ein Rollback ist daher additiv rückbaubar, nicht destruktiv nötig:

```sql
-- Rollback-Skizze für 20260801_phase3_multi_mandant_saas.sql (ungetestet,
-- nur gegen Shadow-DB anwenden):
BEGIN;
  -- Fences + neue Spalte je tenant_tables-Tabelle entfernen (Schleife analog
  -- zum Rollout in der Migration selbst, hier nur die Grundidee):
  --   DROP POLICY IF EXISTS "<table>_org_fence" ON public.<table>;
  --   ALTER TABLE public.<table> DROP COLUMN IF EXISTS organization_id;
  DROP FUNCTION IF EXISTS public.has_org_role(uuid, text[]);
  DROP FUNCTION IF EXISTS public.is_org_member(uuid);
  DROP FUNCTION IF EXISTS public.current_org_id();
  DROP TABLE IF EXISTS public.organization_subscriptions;
  DROP TABLE IF EXISTS public.organization_members;
  DROP TABLE IF EXISTS public.organizations;
COMMIT;
```
- Diese Skizze wurde **nicht ausgeführt** (keine Shadow-DB verfügbar, Produktions-DB tabu). Vor echter Nutzung: gegen eine Shadow-DB testen und insbesondere die `DROP COLUMN organization_id`-Schleife über alle 34 existierenden Tabellen aus dem `tenant_tables`-Array generieren (analog zum `DO $$ … FOREACH t IN ARRAY tenant_tables$$`-Muster der Original-Migration).
- `scripts/rollback.sh` aus dem Repo ist dafür **nicht** geeignet — es macht `git revert` auf Commits, keinen DB-Rollback.

## 7. Verbleibende Risiken (priorisiert)

1. **Hoch — Server-Routen ohne Org-Filter (4.4).** Bevor eine zweite Organisation produktiv onboarded wird, müssen alle Admin-/API-Routen, die mandantenfähige Tabellen per `service_role` lesen/schreiben, explizit `organization_id` setzen/filtern (`getActiveOrgId()`). Aktuell betrifft das ~55 der 65 gelisteten Tabellen.
2. **Mittel — Migrations-Ordner ist allein nicht schema-vollständig (2.2).** Für zukünftige Shadow-DB-/CI-Tests muss zusätzlich zum Migrations-Replay ein aktueller Schema-Dump der 31 live-only Tabellen gepflegt werden, sonst bricht jeder Fresh-Setup-Versuch an `public.clients`.
3. **Mittel — Dynamische RLS-Tests sind ungetestet.** Die 5 dynamischen Tests in `tenant-isolation.test.ts` sind logisch korrekt aufgebaut (gegen das dokumentierte Schema/Policies), liefen aber **noch nie gegen eine echte Datenbank**. Erste Priorität, sobald Docker oder ein Supabase-Access-Token verfügbar sind.
4. **Niedrig — Namensabweichungen im Auftrag (4.5).** `service_visits` und eine „Touren"-Tabelle existieren nicht — falls diese fachlich gebraucht werden, ist das ein separates Datenmodell-Thema, kein Test-Blocker.
5. **Niedrig — `organization_members`/`organizations` UPDATE-Policy erlaubt Admin/Owner beliebige Felder zu ändern**, inkl. `billing_plan` (kein separater Schutz gegen Selbst-Upgrade ohne Stripe-Bestätigung). Nicht Teil dieses Auftrags, aber beim nächsten Billing-Audit zu prüfen.

## 8. Was wurde committet, was nicht

- ✅ `supabase/seed-shadow.sql`
- ✅ `__tests__/shadow-db/tenant-isolation.test.ts`
- ✅ `audit/SHADOW_DB_MIGRATION_REPORT.md` (dieser Report)
- ❌ Keine Änderungen an bestehenden Migrationen oder an Produktions-/Live-Daten.
- ❌ Kein Docker-/Supabase-CLI-Setup wurde installiert (außerhalb des Auftragsumfangs, würde System-Software-Installation erfordern).

**Commit:** `a1a18cd` „phase3: Shadow-DB Migrationstest + Tenant-Isolation-Tests" (lokal, 3 Dateien, 794 Zeilen).

**Push steht aus** — schlägt wie im Auftrag erwartet fehl:
```
! [remote rejected] audit/phase3-production-readiness -> audit/phase3-production-readiness
  (refusing to allow an OAuth App to create or update workflow `.github/workflows/ci.yml`
   without `workflow` scope)
```
Ursache: Ein früherer Commit auf diesem Branch (`47dd8f1`, „Hessen-PLZ-Tests + CI/CD-Pipeline") hat `.github/workflows/ci.yml` verändert; das aktuelle GitHub-Token/OAuth-App hat keinen `workflow`-Scope. Betrifft den gesamten Branch, nicht nur diesen Commit — ein manueller Push mit einem Token mit `workflow`-Scope (oder ein PAT mit diesem Scope hinterlegt) ist nötig.

**Nebenfund (nicht committet):** Während der Session waren `package.json`/`package-lock.json` mit einer Next.js-/sharp-Versionsänderung modifiziert (`next` → `^16.2.12` in `package.json`, aber inkonsistent `^14.2.35` im Lockfile — sieht nach einem unterbrochenen `npm install` aus einer parallelen Session aus). Diese Änderung wurde bewusst **nicht** in den Shadow-DB-Commit übernommen (out of scope), per `git stash` beiseitegelegt und danach unverändert in den Arbeitsbaum zurückgegeben — sie steht weiterhin als unstaged Änderung aus und sollte von der Session/Person geprüft werden, die sie verursacht hat, bevor sie committet wird.
