# Staging-Runbook — 2026-08-10

**Branch:** `staging/expansion-abnahme`
**Supabase-Projekt:** `nnwyktkqibdjxgimjyuq`
**Stamm-Org:** `00000000-0000-4000-8000-000460629986`
**Voraussetzung:** `service_role`-Key oder `DATABASE_URL` (psql-Zugang)

---

## Glossar

| Kürzel | Bedeutung |
|--------|-----------|
| `$DB`  | `psql "$DATABASE_URL"` oder Supabase-SQL-Editor |
| `$SRK` | service_role-Key (`SUPABASE_SERVICE_ROLE_KEY`) |
| `$URL` | Supabase-URL (`https://nnwyktkqibdjxgimjyuq.supabase.co`) |

---

## SCHRITT 1: LIVE-SCHEMA-DIFF

**Ziel:** Exakter Vergleich Production vs. Repo — welche Migrationen sind applied, welche Tabellen/Policies/Functions existieren.

### 1.1 Applied Migrations abfragen

```sql
-- Alle applied Migrationen auf Production
SELECT version, name, statements_applied_at
FROM supabase_migrations.schema_migrations
ORDER BY version;
```

**Erwartetes Ergebnis:** ~50–75 Zeilen. Die `version`-Spalte abgleichen mit:

```bash
# Repo-Migrationen (108 Forward, 54 Rollbacks)
ls supabase/migrations/*.sql | grep -v rollback | \
  sed 's/.*\///' | sed 's/_.*//' | sort
```

**Diff-Befehl (lokal):**

```bash
# Repo-Versionen in Datei
ls supabase/migrations/*.sql | grep -v rollback | \
  sed 's/.*\///' | sed 's/_.*//' | sort > /tmp/repo_versions.txt

# Live-Versionen kopieren aus SQL-Ergebnis → /tmp/live_versions.txt

# Diff zeigt ausstehende Migrationen
comm -23 /tmp/repo_versions.txt /tmp/live_versions.txt
```

### 1.2 Tabellen-Vergleich

```sql
-- Alle public-Tabellen auf Production
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
```

**Repo-erwartete Tabellen (aus Migrationen):**

```sql
-- Zählung
SELECT count(*) AS tabellen_count
FROM pg_tables
WHERE schemaname = 'public';
```

Erwarteter Wert nach vollem Apply: **~120–130 Tabellen**

### 1.3 Policies-Vergleich

```sql
-- Alle RLS-Policies
SELECT tablename, policyname, permissive, cmd
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- Zählung
SELECT count(*) AS policy_count
FROM pg_policies
WHERE schemaname = 'public';
```

### 1.4 Functions-Vergleich

```sql
-- Alle public Functions
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args,
       p.prosecdef AS security_definer
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
ORDER BY p.proname;

-- Zählung
SELECT count(*) AS function_count
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public';
```

### 1.5 Trigger-Vergleich

```sql
SELECT trigger_name, event_object_table, action_timing, event_manipulation
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY event_object_table, trigger_name;

SELECT count(*) AS trigger_count
FROM information_schema.triggers
WHERE trigger_schema = 'public';
```

### 1.6 Indizes-Vergleich

```sql
SELECT indexname, tablename
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

SELECT count(*) AS index_count
FROM pg_indexes
WHERE schemaname = 'public';
```

### 1.7 Kritische Drift-Prüfung (aus MIGRATION_INVENTAR §2)

```sql
-- Existieren die verdächtigen Tabellen bereits?
SELECT
  to_regclass('public.payments')           AS payments_exists,
  to_regclass('public.dta_ruecklaeufer')   AS dta_ruecklaeufer_exists,
  to_regclass('public.ops_aufgaben')       AS ops_aufgaben_exists,
  to_regclass('public.wf_events')          AS wf_events_exists,
  to_regclass('public.tours')              AS tours_exists,
  to_regclass('public.pflege_aufnahmen')   AS pflege_aufnahmen_exists,
  to_regclass('public.medikamente')        AS medikamente_exists,
  to_regclass('public.sis_erhebungen')     AS sis_exists,
  to_regclass('public.vitalwerte')         AS vitalwerte_exists,
  to_regclass('public.coach_sessions')     AS coach_exists;

-- Falls payments existiert: hat es organization_id?
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'payments'
ORDER BY ordinal_position;

-- profiles-Spalten (organization_id sollte NICHT existieren)
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'profiles'
ORDER BY ordinal_position;
```

**Erwartete Abweichungen (dokumentiert):**

| Abweichung | Quelle | Aktion |
|------------|--------|--------|
| `payments` existiert als Legacy-Stripe-Tabelle | `initial-setup.sql` | Migration 20260808210000 benennt sie um |
| `profiles` hat KEIN `organization_id` | Phase-3-Design | Korrekt — Policies nutzen `current_org_id()` |
| `dta_*`-Tabellen möglicherweise manuell erstellt | Live-Drift (08.08.2026) | Vor Re-Apply prüfen |
| `ops_aufgaben` möglicherweise bereits live | Live-Drift-Verdacht | Vor Re-Apply prüfen |

**Fehlerbehandlung:** Bei unerwarteten Abweichungen STOP — nicht blind applyen. Abweichungen in dieses Dokument unter §1.7 dokumentieren und Apply-Plan anpassen.

**Rollback:** Schritt 1 ist read-only, kein Rollback nötig.

---

## SCHRITT 2: PREFLIGHT

**Ziel:** Alle Voraussetzungen prüfen, bevor eine einzige Zeile DDL ausgeführt wird.

### 2.1 Checkliste

```
[ ] Branch korrekt: staging/expansion-abnahme
    → git rev-parse --abbrev-ref HEAD

[ ] Shadow-DB-Test grün: 109/0 (alle Migrationen fehlerfrei)
    → ./scripts/shadow-db.sh reset  (Ergebnis: 0 Fehler)

[ ] Vitest grün: 1462/1462
    → npm run test

[ ] service_role-Key vorhanden und funktional
    → curl -s -H "apikey: $SRK" -H "Authorization: Bearer $SRK" \
         "$URL/rest/v1/profiles?select=id&limit=1" | head -1

[ ] Backup vorhanden (Supabase Dashboard → Database → Backups)
    → Notiz: Backup-Zeitpunkt _________________

[ ] Supabase-Branch für Staging erstellt (optional aber empfohlen)
    → supabase branches create staging-test --project-ref nnwyktkqibdjxgimjyuq
    ODER: direkt auf Production applyen (nur wenn Backup bestätigt)

[ ] Rollback-Dateien für alle Migrationen vorhanden
    → ls supabase/migrations/*rollback* | wc -l  (Erwartet: 54)

[ ] Live-Schema-Diff aus Schritt 1 dokumentiert
    → Datei: /tmp/live_versions.txt

[ ] Keine laufenden Deploys/Builds auf Vercel
    → gh api repos/AE-Projekte/alltagsengel-cms/deployments --jq '.[0].state'

[ ] Maintenance-Window kommuniziert (empfohlen: 30–60 Min.)
```

### 2.2 Umgebungsvariablen setzen

```bash
export DATABASE_URL="postgresql://postgres:[PASSWORD]@db.nnwyktkqibdjxgimjyuq.supabase.co:5432/postgres"
export SUPABASE_URL="https://nnwyktkqibdjxgimjyuq.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="[SERVICE_ROLE_KEY]"
export STAMM_ORG="00000000-0000-4000-8000-000460629986"
```

### 2.3 Connectivity-Test

```bash
psql "$DATABASE_URL" -c "SELECT version(), current_database(), current_user;"
```

**Erwartetes Ergebnis:** PostgreSQL 15.x, Datenbank `postgres`, User `postgres`.

**Fehlerbehandlung:** Bei Connection-Fehler → Supabase Dashboard prüfen (Database → Settings → Connection string). Bei SSL-Fehler: `?sslmode=require` an DATABASE_URL anhängen.

**Rollback:** Schritt 2 ist read-only, kein Rollback nötig.

---

## SCHRITT 3: MIGRATION DRY-RUN

**Ziel:** Jede ausstehende Migration einzeln testen, ohne Änderungen zu committen.

### 3.1 Dry-Run-Pattern

Für JEDE Migration aus der Apply-Liste (Schritt 4):

```sql
BEGIN;

-- [Migration-SQL hier einfügen]

-- Prüfe Ergebnis:
SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
SELECT count(*) FROM pg_policies WHERE schemaname = 'public';

-- IMMER Rollback im Dry-Run:
ROLLBACK;
```

### 3.2 Automatisierter Dry-Run via Script

```bash
# Dry-Run aller ausstehenden Migrationen
./scripts/staging-apply.sh --dry-run
```

Das Script (siehe `scripts/staging-apply.sh`) führt jede Migration in einer Transaction aus und rollt zurück. Output zeigt pro Migration: OK oder FEHLER mit Details.

### 3.3 Erwartete Ergebnisse

| Migration | Dry-Run-Erwartung |
|-----------|-------------------|
| Security-Basis (6 Stk.) | OK — reine REVOKE/GRANT/Policy-Drops |
| Modul-Migrationen (21 Stk.) | OK — CREATE TABLE IF NOT EXISTS |
| Security-Abschluss (2 Stk.) | OK — REVOKE + Policy-Replace |

### 3.4 Bekannte Bedingungen

- `20260808210000`: Dry-Run bricht ab, falls `payments` kein Legacy-Schema hat UND bereits `organization_id` hat → Migration überspringen (bereits applied).
- `20260808220000`: Bricht ab, falls `dta_ruecklaeufer` bereits existiert → Migration überspringen.
- `20260814010000`: Bricht ab, falls `get_monthly_closing_overview` bereits 10-spaltigen Rückgabetyp hat → Migration überspringen.

**Fehlerbehandlung:** Fehler im Dry-Run dokumentieren (Migration + Fehlertext + Zeile). NICHT fortfahren zu Schritt 4, bis alle Dry-Runs OK sind oder bewusst übersprungen werden.

**Rollback:** Dry-Run rollt sich selbst zurück (ROLLBACK in jeder Transaction).

---

## SCHRITT 4: MIGRATION APPLY

**Ziel:** Alle ausstehenden Migrationen in exakter Reihenfolge anwenden.

### 4.0 Abhängigkeitsbaum

```
Phase 3 (Multi-Mandant) ← Basis für alles
  ├─ Security-Basis (Schritt 4.1)
  │   ├─ 817010000 (sql_exec) ← keine
  │   ├─ 817030000 (secdef) ← wf_* Funktionen (813010000)
  │   ├─ 817030002 (secdef2) ← Expansion (808100000)
  │   ├─ 817040000 (bookings) ← profiles
  │   ├─ 822010000 (audit_log) ← mis_audit_log + org_members
  │   └─ 822020000 (billing) ← is_admin()
  │
  ├─ Modul-Migrationen (Schritt 4.2)
  │   ├─ 808200000 (Einsatzplanung) ← Phase 3
  │   ├─ 808210000 (Zahlungen) ← 808200000
  │   ├─ 808220000 (Kassenabrechnung) ← 808210000
  │   ├─ 809010000 (Dokumentenmanagement) ← Phase 3
  │   ├─ 809120000 (Tourenplanung) ← 808200000
  │   ├─ 810010000 (Pflegedoku) ← Phase 3
  │   ├─ 811010000 (Personal) ← Phase 3
  │   ├─ 812010000 (Aufgaben) ← Phase 3
  │   ├─ 813010000 (Workflow) ← 808220000, 812010000
  │   ├─ 814010000 (LN-Härtung) ← 808200000
  │   ├─ 818010000a (SIS) ← Phase 3
  │   ├─ 818010000b (Vitalwerte) ← Phase 3
  │   ├─ 818030000 (Wunddoku) ← Phase 3
  │   ├─ 819010000 (PflegeCoach) ← Phase 3
  │   ├─ 819020000 (Billing-Fence) ← Phase 3
  │   ├─ 820010000 (Medikamente) ← Phase 3
  │   ├─ 821010000 (Angehörige) ← Phase 3
  │   └─ 821020000 (Signaturen) ← keine
  │
  └─ Security-Abschluss (Schritt 4.3)
      ├─ 823010000 (SECDEF REVOKE) ← alle SECDEF-Funktionen
      └─ 823020000 (profiles→is_admin) ← alle Modul-Tabellen
```

### 4.1 Phase 1: Security-Basis

**WICHTIG:** Migrationen 817030000 und 817030002 setzen Funktionen voraus, die in den Modul-Migrationen erstellt werden. Falls diese Funktionen noch nicht existieren (Live-Check!), müssen diese beiden Migrationen NACH den Modul-Migrationen angewendet werden.

| # | Datei | Erwartetes Ergebnis | Abhängig von |
|---|-------|---------------------|--------------|
| 1 | `20260817010000_sql_exec_rpc_absichern.sql` | `_run_sql` REVOKED für anon | Keine |
| 2 | `20260817040000_bookings_policy_rekursion.sql` | 3 bookings-Policies ersetzt (42P17-Fix) | profiles, bookings |
| 3 | `20260822010000_mis_audit_log_org_id.sql` | org_id Spalte + Backfill + Policy | mis_audit_log |
| 4 | `20260822020000_billing_policies_is_admin.sql` | 6 Billing-Policies auf is_admin() | is_admin() |

**Bedingt (nur wenn wf_*-Funktionen bereits existieren):**

| # | Datei | Erwartetes Ergebnis |
|---|-------|---------------------|
| 5 | `20260817030000_secdef_rpc_haertung.sql` | 6 wf_* + next_billing_number REVOKED |
| 6 | `20260817030002_zusaetzliche_secdef_haertung.sql` | kassenabrechnung_erlaubt + bundesland_fuer_plz REVOKED |

```bash
# Apply Phase 1
./scripts/staging-apply.sh --phase security-basis
```

### 4.2 Phase 2: Modul-Migrationen

**WICHTIG:** Vor jedem Apply prüfen ob die Tabelle bereits existiert (Drift aus Schritt 1.7). Existiert sie bereits → Migration überspringen und als "bereits applied" markieren.

| # | Datei | Neue Objekte | Bedingt |
|---|-------|-------------|---------|
| 7 | `20260809010000_dokumentenmanagement_akten.sql` | akten, akten_dokumente, … | — |
| 8 | `20260809120000_tourenplanung.sql` | tours, tour_stops, tour_templates | assignments muss existieren |
| 9 | `20260810010000_pflegedokumentation.sql` | pflege_aufnahmen, pflege_anamnesen, … (8 Tabellen) | — |
| 10 | `20260811010000_personalmanagement.sql` | personal_schulungen, dienstplan_*, … (7 Tabellen) | — |
| 11 | `20260818010000_sis_strukturierte_informationssammlung.sql` | sis_erhebungen, sis_themenfelder, sis_risikomatrix | — |
| 12 | `20260818010000_vitalwerte.sql` | vitalwerte | — |
| 13 | `20260818030000_wunddokumentation.sql` | wunden, wund_verlauf | — |
| 14 | `20260819010000_pflegecoach_dipa_modul.sql` | coach_sessions, coach_messages, coach_favorites | — |
| 15 | `20260819020000_billing_org_fence_haertung.sql` | 3 RESTRICTIVE Policies | invoices muss existieren |
| 16 | `20260820010000_medikamentenmanagement.sql` | medikamente, medikament_eingaben | — |
| 17 | `20260821010000_angehoerigenzugang.sql` | angehoerige_zugang | — |
| 18 | `20260821020000_digitale_signaturen.sql` | signaturen | — |

**Bedingt (nur wenn Live-Check zeigt: Tabellen fehlen):**

| # | Datei | Bedingung |
|---|-------|-----------|
| 19 | `20260808210000_zahlungen_forderungen_monatsabschluss.sql` | NUR wenn `payments` Legacy-Schema hat |
| 20 | `20260808220000_kassenabrechnung_dta_dakota.sql` | NUR wenn `dta_ruecklaeufer` nicht existiert |
| 21 | `20260812010000_aufgaben_kommunikation.sql` | NUR wenn `ops_aufgaben` nicht existiert |
| 22 | `20260813010000_workflow_engine.sql` | NUR wenn `wf_events` nicht existiert |
| 23 | `20260814010000_leistungsnachweis_haertung.sql` | NUR wenn Rollback 200001 auf Prod lief |

```bash
# Apply Phase 2
./scripts/staging-apply.sh --phase module
```

### 4.3 Phase 3: Security-Abschluss

**MUSS nach ALLEN Modul-Tabellen kommen** — referenziert Tabellen aus Phase 2.

| # | Datei | Erwartetes Ergebnis |
|---|-------|---------------------|
| 24 | `20260823010000_secdef_trigger_revoke.sql` | 19 SECDEF-Funktionen: anon=false, auth=false |
| 25 | `20260823020000_profiles_subquery_to_is_admin.sql` | 44 Policies auf is_admin() umgestellt |

**Bedingt verschoben aus Phase 1:**

| # | Datei | Erwartetes Ergebnis |
|---|-------|---------------------|
| 26 | `20260817030000_secdef_rpc_haertung.sql` | Falls in Phase 1 noch nicht applied |
| 27 | `20260817030002_zusaetzliche_secdef_haertung.sql` | Falls in Phase 1 noch nicht applied |

```bash
# Apply Phase 3
./scripts/staging-apply.sh --phase security-abschluss
```

**Fehlerbehandlung bei Apply-Fehler:**

1. Fehler-Migration notieren (Dateiname + Fehlertext + Zeilennummer)
2. **NICHT** weitermachen — Abhängigkeitsbaum prüfen
3. Rollback der fehlerhaften Migration anwenden:
   ```bash
   psql "$DATABASE_URL" -f "supabase/migrations/[TIMESTAMP]_rollback_[NAME].sql"
   ```
4. Fix erstellen, im Shadow-DB testen, dann erneut applyen
5. Falls kein Rollback möglich: Supabase-Branch löschen und neu beginnen

**Rollback für den gesamten Apply:**

```bash
# Rollback aller Migrationen in umgekehrter Reihenfolge
./scripts/staging-apply.sh --rollback
```

---

## SCHRITT 5: SCHEMA-VERIFIKATION

**Ziel:** Nach dem Apply sicherstellen, dass das DB-Schema dem Repo entspricht.

### 5.1 Zählungen

```sql
-- Tabellen-Count
SELECT count(*) AS tabellen_total
FROM pg_tables WHERE schemaname = 'public';
-- Erwartet: ~125-135

-- Policy-Count
SELECT count(*) AS policies_total
FROM pg_policies WHERE schemaname = 'public';
-- Erwartet: ~250-300

-- Function-Count
SELECT count(*) AS functions_total
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public';
-- Erwartet: ~60-80

-- Trigger-Count
SELECT count(*) AS triggers_total
FROM information_schema.triggers
WHERE trigger_schema = 'public';
-- Erwartet: ~40-50

-- Index-Count
SELECT count(*) AS indexes_total
FROM pg_indexes WHERE schemaname = 'public';
-- Erwartet: ~200-250 (123 FK-Indizes + Primary Keys + Custom)

-- Migration-Count
SELECT count(*) AS migrations_applied
FROM supabase_migrations.schema_migrations;
-- Erwartet: gleiche Anzahl wie `ls supabase/migrations/*.sql | grep -v rollback | wc -l`
```

### 5.2 RLS-Abdeckung

```sql
-- Tabellen OHNE jede Policy (sollte leer sein nach vollem Apply)
SELECT t.tablename
FROM pg_tables t
WHERE t.schemaname = 'public'
  AND t.tablename NOT IN (
    SELECT DISTINCT tablename FROM pg_policies WHERE schemaname = 'public'
  )
  AND t.tablename NOT LIKE 'pg_%'
  AND t.tablename NOT IN ('schema_migrations', 'spatial_ref_sys')
ORDER BY t.tablename;
```

**Erwartet:** 0 Zeilen (alle Tabellen haben mindestens eine Policy).

### 5.3 RLS aktiviert

```sql
-- Tabellen mit deaktiviertem RLS
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
  AND NOT rowsecurity;
```

**Erwartet:** 0 Zeilen.

### 5.4 Keine profiles-Subqueries in Policies

```sql
SELECT schemaname, tablename, policyname, qual
FROM pg_policies
WHERE schemaname = 'public'
  AND qual LIKE '%profiles%'
  AND qual NOT LIKE '%is_admin%'
  AND qual NOT LIKE '%is_internal_staff%';
```

**Erwartet:** 0 Zeilen (evtl. bewusste Ausnahmen wie `bookings_select`).

### 5.5 Vergleichstabelle

| Metrik | VOR Apply | NACH Apply | Erwartete Differenz |
|--------|-----------|------------|---------------------|
| Tabellen | ___ | ___ | +25–35 |
| Policies | ___ | ___ | +50–80 |
| Functions | ___ | ___ | +15–25 |
| Triggers | ___ | ___ | +10–20 |
| Indizes | ___ | ___ | +130–160 |
| Migrations | ___ | ___ | +20–25 |

**Fehlerbehandlung:** Bei signifikanter Abweichung von den erwarteten Differenzen: einzelne Migrationen prüfen, ob sie übersprungen oder fehlgeschlagen sind.

**Rollback:** Schritt 5 ist read-only, kein Rollback nötig.

---

## SCHRITT 6: RLS-/SECURITY-TEST

**Ziel:** Verifizieren, dass Multi-Tenant-Isolation und Security-Härtung korrekt funktionieren.

### 6.1 Cross-Tenant-Test (Org A → Org B)

```sql
-- Test-Setup: 2 verschiedene Org-IDs
-- Stamm-Org: 00000000-0000-4000-8000-000460629986

-- Als User von Stamm-Org einloggen (via Supabase Auth)
-- und versuchen, Daten einer anderen Org zu lesen:

-- 1. current_org_id() muss Stamm-Org zurückgeben
SELECT public.current_org_id();
-- Erwartet: 00000000-0000-4000-8000-000460629986

-- 2. Clients nur von eigener Org sichtbar
SELECT count(*) FROM public.clients;
-- Erwartet: nur Clients der eigenen Org

-- 3. Invoices nur von eigener Org
SELECT count(*) FROM public.invoices;
-- Erwartet: nur Invoices der eigenen Org

-- 4. Cross-Tenant-Versuch (sollte 0 Zeilen liefern)
-- Manuell org_id-Wert einer anderen Org einsetzen:
SELECT * FROM public.clients
WHERE organization_id != public.current_org_id();
-- Erwartet: 0 Zeilen (RLS blockiert)
```

### 6.2 Anon-Zugriff-Test

```bash
# Anon-Key-Test: Versuche Daten als anonymer User zu lesen
ANON_KEY="[ANON_KEY_HIER]"

# profiles (sollte leer sein für anon)
curl -s -H "apikey: $ANON_KEY" \
  "$URL/rest/v1/profiles?select=id&limit=5"
# Erwartet: [] (leeres Array)

# clients (sollte leer sein für anon)
curl -s -H "apikey: $ANON_KEY" \
  "$URL/rest/v1/clients?select=id&limit=5"
# Erwartet: [] oder 403

# mis_audit_log (muss leer sein für anon — P0-Fix)
curl -s -H "apikey: $ANON_KEY" \
  "$URL/rest/v1/mis_audit_log?select=id&limit=5"
# Erwartet: [] oder 403

# state_waitlist (bewusst offen für anon)
curl -s -H "apikey: $ANON_KEY" \
  -X POST -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","bundesland":"HE"}' \
  "$URL/rest/v1/state_waitlist"
# Erwartet: 201 Created (bewusst erlaubt)
```

### 6.3 SECDEF-Funktionen: REVOKE verifizieren

```sql
-- Alle SECURITY DEFINER Funktionen und ihre Grants
SELECT p.proname,
       has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon_exec,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec,
       has_function_privilege('service_role',  p.oid, 'EXECUTE') AS svc_exec
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prosecdef
ORDER BY p.proname;
```

**Erwartete Ergebnisse:**

| Funktion | anon | auth | svc |
|----------|------|------|-----|
| `is_admin()` | true | true | true |
| `current_org_id()` | true | true | true |
| `wf_emit_event(...)` | **false** | **false** | true |
| `wf_process_event(...)` | **false** | **false** | true |
| `wf_execute_queue_item(...)` | **false** | **false** | true |
| `wf_process_pending()` | **false** | **false** | true |
| `wf_check_fristen()` | **false** | **false** | true |
| `next_billing_number(...)` | **false** | **false** | true |
| `kassenabrechnung_erlaubt(...)` | **false** | true | true |
| `bundesland_fuer_plz(...)` | **false** | true | true |
| `is_internal_staff()` | **false** | true | true |
| `state_flag(...)` | **false** | true | true |
| Alle Trigger-Funktionen (`audit_*`, `prevent_*`, `enforce_*`, …) | **false** | **false** | true |

### 6.4 Admin-Only-Routes testen

```bash
# Diese API-Routes dürfen nur für authentifizierte Admins funktionieren:

# Ohne Auth → 401/403
curl -s -o /dev/null -w "%{http_code}" "$URL/functions/v1/api/admin/dashboard"
# Erwartet: 401

# Mit Anon-Key → 403
curl -s -o /dev/null -w "%{http_code}" \
  -H "apikey: $ANON_KEY" \
  "$URL/functions/v1/api/admin/dashboard"
# Erwartet: 403
```

**Fehlerbehandlung:** Bei fehlgeschlagenem Security-Test → SOFORT stoppen. Betroffene Migration identifizieren und Rollback ausführen. Security-Tests sind GO/NO-GO-Kriterien.

**Rollback:** Tests sind read-only (außer state_waitlist-INSERT — mit `DELETE FROM state_waitlist WHERE email = 'test@example.com'` aufräumen).

---

## SCHRITT 7: E2E-TEST

**Ziel:** Gesamtes System nach Apply testen.

### 7.1 Test-Suite

```bash
# Vitest (Unit + Integration)
npm run test
# Erwartet: 1462+ PASS, 0 FAIL

# TypeScript Type-Check
npx tsc --noEmit
# Erwartet: 0 Fehler (oder nur bekannte Warn-only-Fehler)

# Production Build
npm run build
# Erwartet: Exit-Code 0, keine Fehler
```

### 7.2 Erwartete Ergebnisse

| Test | Erwartet | Aktion bei Fehler |
|------|----------|-------------------|
| Vitest | ≥1462 PASS, 0 FAIL | Fehlende Tests analysieren — sind es neue Modul-Tests, die ein Schema brauchen? |
| TypeScript | 0 Fehler | Kompilier-Fehler deuten auf Type-Mismatch nach Migration — `types/supabase.ts` regenerieren |
| Build | Exit 0 | Vercel-Build-Kompatibilität sicherstellen (NODE_OPTIONS=--max-old-space-size=2048) |

### 7.3 Security-Test-Suite

```bash
# Spezifische Security-Verifikation
npm run test -- --grep "security\|rls\|policy\|secdef\|org.fence"
# Erwartet: 181+ Security-Tests PASS
```

**Fehlerbehandlung:** Bei Test-Fehlern die Ursache identifizieren:
1. Schema-Fehler → Migration war nicht korrekt applied
2. Type-Fehler → `types/supabase.ts` regenerieren mit `supabase gen types typescript`
3. Logik-Fehler → Code-Fix, nicht Schema-Fix

**Rollback:** Tests ändern nichts. Bei Schema-Problem → zurück zu Schritt 4.

---

## SCHRITT 8: BILLING-E2E-TEST

**Ziel:** Vollständiger Billing-Workflow auf Staging durchspielen.

### 8.1 Test-Tarif anlegen

```sql
-- Test-Tarif für Hessen (Stamm-Bundesland)
INSERT INTO public.billing_tariffs (
  organization_id, leistungsart, rechtsgrundlage,
  bundesland, tarif_name, einzelpreis_cent,
  gueltig_ab, gueltig_bis, aktiv
) VALUES (
  '00000000-0000-4000-8000-000460629986',
  'Grundpflege',
  'SGB XI §36',
  'HE',
  'TEST-Tarif Staging',
  2500,  -- 25,00 EUR
  '2026-01-01',
  '2026-12-31',
  true
) RETURNING id;
-- Notiz: Tarif-ID = _______________
```

### 8.2 Test-Leistungsnachweis erstellen

```sql
-- Test-Client muss existieren
SELECT id, full_name FROM public.clients
WHERE organization_id = '00000000-0000-4000-8000-000460629986'
LIMIT 1;
-- Notiz: Client-ID = _______________

-- Test-Caregiver muss existieren
SELECT id FROM public.caregivers
WHERE organization_id = '00000000-0000-4000-8000-000460629986'
LIMIT 1;
-- Notiz: Caregiver-ID = _______________

-- Leistungsnachweis erstellen (falls Tabelle existiert)
INSERT INTO public.leistungsnachweise (
  organization_id, client_id, caregiver_id,
  datum, leistungsart, dauer_minuten, status
) VALUES (
  '00000000-0000-4000-8000-000460629986',
  '[CLIENT_ID]',
  '[CAREGIVER_ID]',
  CURRENT_DATE,
  'Grundpflege',
  60,
  'erfasst'
) RETURNING id;
```

### 8.3 Monatsabschluss durchführen

```sql
-- Monatsabschluss-RPC aufrufen (als service_role)
SELECT public.get_monthly_closing_overview(CURRENT_DATE);
```

### 8.4 Rechnung generieren

```sql
-- Rechnungsentwurf erstellen (als service_role)
SELECT public.create_invoice_draft_atomic(
  '00000000-0000-4000-8000-000460629986',
  '[CLIENT_ID]',
  DATE_TRUNC('month', CURRENT_DATE)::date,
  (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')::date
);
```

### 8.5 DTA-Export prüfen

```sql
-- Prüfe ob abrechnungslaeufe-Tabelle existiert und funktioniert
SELECT count(*) FROM public.abrechnungslaeufe
WHERE organization_id = '00000000-0000-4000-8000-000460629986';

-- DTA-Dateien
SELECT count(*) FROM public.dta_dateien
WHERE organization_id = '00000000-0000-4000-8000-000460629986';
```

### 8.6 Aufräumen

```sql
-- Test-Daten entfernen (umgekehrte Reihenfolge)
DELETE FROM public.leistungsnachweise
WHERE organization_id = '00000000-0000-4000-8000-000460629986'
  AND leistungsart = 'Grundpflege'
  AND datum = CURRENT_DATE;

DELETE FROM public.billing_tariffs
WHERE tarif_name = 'TEST-Tarif Staging';
```

**Fehlerbehandlung:** Billing-Fehler sind oft Spalten-/Constraint-Probleme. Prüfen:
1. `total_amount` ist EURO, nicht Cent (Memory: `abrechnung-schema-fallen`)
2. `abrechnungslaeufe` nutzt `erstellt_am`, nicht `created_at`
3. Kein `period_month` — Zeitraum über `gueltig_ab`/`gueltig_bis`

**Rollback:** Test-Daten wie in 8.6 aufräumen.

---

## SCHRITT 9: ROLLBACK-VERIFIKATION

**Ziel:** Sicherstellen, dass Rollbacks funktionieren.

### 9.1 Test-Migration für Rollback wählen

Wähle eine unkritische, rein additive Migration:

```bash
# Empfehlung: Angehörigenzugang (isoliert, niedrig-riskant)
MIGRATION="20260821010000_angehoerigenzugang.sql"
ROLLBACK="20260821010001_rollback_angehoerigenzugang.sql"
```

### 9.2 Rollback ausführen

```sql
-- Schema-Snapshot VOR Rollback
SELECT count(*) FROM pg_tables WHERE schemaname = 'public';
SELECT count(*) FROM pg_policies WHERE schemaname = 'public';

-- Tabelle muss existieren
SELECT to_regclass('public.angehoerige_zugang');
-- Erwartet: public.angehoerige_zugang
```

```bash
# Rollback ausführen
psql "$DATABASE_URL" -f "supabase/migrations/$ROLLBACK"
```

### 9.3 Schema nach Rollback prüfen

```sql
-- Tabelle muss WEG sein
SELECT to_regclass('public.angehoerige_zugang');
-- Erwartet: NULL

-- Counts müssen um die erwartete Differenz gesunken sein
SELECT count(*) FROM pg_tables WHERE schemaname = 'public';
SELECT count(*) FROM pg_policies WHERE schemaname = 'public';
```

### 9.4 Re-Apply nach Rollback

```bash
# Migration erneut anwenden (Idempotenz-Test)
psql "$DATABASE_URL" -f "supabase/migrations/$MIGRATION"
```

```sql
-- Tabelle muss wieder da sein
SELECT to_regclass('public.angehoerige_zugang');
-- Erwartet: public.angehoerige_zugang
```

**Fehlerbehandlung:** Rollback-Fehler → Rollback-SQL manuell prüfen. Häufige Ursache: `DROP TABLE` ohne `CASCADE` bei bestehenden FK-Referenzen. Fix: `DROP TABLE IF EXISTS ... CASCADE` in Rollback-Datei.

**Rollback:** Nach dem Rollback-Test: Re-Apply (9.4) stellt den Zustand wieder her.

---

## SCHRITT 10: STAGING-GO/NO-GO

**Ziel:** Finale Entscheidung, ob der Apply auf Production übertragen werden kann.

### 10.1 GO/NO-GO-Checkliste

```
SCHEMA:
[ ] Live-Schema-Diff abgeschlossen (Schritt 1)
[ ] Alle ausstehenden Migrationen identified
[ ] Keine unerwarteten Drift-Abweichungen

PREFLIGHT:
[ ] Backup bestätigt
[ ] Shadow-DB 109/0
[ ] Vitest 1462+ PASS
[ ] service_role-Zugang funktional

DRY-RUN:
[ ] Alle Migrationen im Dry-Run OK
[ ] Bedingte Migrationen korrekt evaluiert

APPLY:
[ ] Phase 1 (Security-Basis) applied: ___ von ___ OK
[ ] Phase 2 (Module) applied: ___ von ___ OK
[ ] Phase 3 (Security-Abschluss) applied: ___ von ___ OK
[ ] Keine Fehler beim Apply

SCHEMA-VERIFIKATION:
[ ] Tabellen-Count im Erwartungsbereich
[ ] Policy-Count im Erwartungsbereich
[ ] Function-Count im Erwartungsbereich
[ ] RLS auf allen Tabellen aktiv
[ ] Keine profiles-Subqueries in Policies (außer bewusste Ausnahmen)

SECURITY:
[ ] Cross-Tenant-Test bestanden
[ ] Anon-Zugriff blockiert (außer state_waitlist)
[ ] SECDEF REVOKE verifiziert (19/19)
[ ] Admin-Only-Routes geschützt

E2E:
[ ] npm run test: ___ PASS, ___ FAIL
[ ] TypeScript: ___ Fehler
[ ] Build: OK / FEHLER
[ ] Security-Tests: ___ PASS

BILLING:
[ ] Test-Tarif angelegt
[ ] Leistungsnachweis erstellt
[ ] Monatsabschluss OK / FEHLER / N/A
[ ] Rechnung generiert OK / FEHLER / N/A
[ ] DTA-Export OK / FEHLER / N/A
[ ] Test-Daten aufgeräumt

ROLLBACK:
[ ] Rollback einer Test-Migration erfolgreich
[ ] Re-Apply nach Rollback erfolgreich
```

### 10.2 GO-Kriterien (ALLE müssen erfüllt sein)

1. **Schema:** Tabellen-/Policy-/Function-Counts im Erwartungsbereich
2. **Security:** Cross-Tenant = 0 Zeilen, SECDEF REVOKE = 19/19, Anon = blockiert
3. **Tests:** 0 FAIL in Vitest, Build grün
4. **Rollback:** Mindestens 1 Rollback erfolgreich getestet

### 10.3 NO-GO-Kriterien (eines reicht)

1. ≥1 Migration-Fehler, der nicht durch Überspringen gelöst werden kann
2. Cross-Tenant-Leak (Daten einer anderen Org sichtbar)
3. SECDEF-Funktion noch für anon ausführbar
4. Build-Fehler, der nicht auf Type-Regeneration zurückzuführen ist
5. Rollback einer Migration schlägt fehl

### 10.4 Bericht-Template

```markdown
# Staging-Abnahme-Bericht — [DATUM]

## Ergebnis: GO / NO-GO

### Zusammenfassung
- Migrationen applied: ___ / ___
- Migrationen übersprungen (bereits live): ___
- Schema-Verifikation: PASS / FAIL
- Security-Tests: PASS / FAIL
- E2E-Tests: ___ PASS, ___ FAIL
- Billing-E2E: PASS / FAIL / N/A

### Offene Punkte
1. ...
2. ...

### Nächste Schritte
- [ ] Production-Apply planen (Maintenance-Window)
- [ ] Team informieren
- [ ] Monitoring nach Apply (Sentry, Grafana)

### Durchgeführt von
- Datum: ___
- Branch: staging/expansion-abnahme
- Commit: ___
```

**Fehlerbehandlung:** Bei NO-GO → Bericht mit exakten Fehlern erstellen, Fix-Plan dokumentieren, neuen Apply-Termin planen.

**Rollback:** Bei NO-GO nach Apply: `./scripts/staging-apply.sh --rollback` führt alle Rollbacks in umgekehrter Reihenfolge aus.

---

## Anhang A: Migrations-Gesamtliste (108 Forward, 54 Rollbacks)

Stand: 2026-08-10, Branch `staging/expansion-abnahme`

### Forward-Migrationen

| # | Zeitstempel | Datei | Status |
|---|-------------|-------|--------|
| 1 | 20250101000000 | core_tables_baseline | LIVE |
| 2 | 20250101000050 | missing_production_functions | LIVE |
| 3 | 20260101000000 | baseline_live_only_tables | LIVE |
| 4 | 20260101000100 | baseline_live_only_functions | LIVE |
| 5–50 | 20260301–20260808190000 | (siehe MIGRATION_INVENTAR §3) | LIVE |
| 51–108 | 20260808200000–20260823020000 | (siehe MIGRATION_APPLY_PLAN) | TEILWEISE AUSSTEHEND |

---

## Anhang B: Häufige Fehler und Lösungen

| Fehler | Ursache | Lösung |
|--------|---------|--------|
| `column "organization_id" does not exist` | Legacy-Tabelle ohne org_id | Migration 20260808210000 umbenennt Legacy-Tabelle |
| `42P17 infinite recursion` | profiles-Subquery in RLS-Policy | Policy auf `is_admin()` umstellen |
| `policy already exists` | Fehlende Idempotenz | `DROP POLICY IF EXISTS` vor `CREATE POLICY` |
| `cannot change return type` | Funktions-Signaturwechsel | `DROP FUNCTION IF EXISTS` vor `CREATE OR REPLACE` |
| `relation does not exist` | Kaskadenfehler | Abhängige Migration zuerst applyen |
| `permission denied for schema public` | Fehlende Grants | Als `postgres`-User ausführen, nicht als anon |

---

*Erstellt 2026-08-10. Reproduzierbar via `./scripts/staging-apply.sh --help`.*
