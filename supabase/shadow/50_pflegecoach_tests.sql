-- ════════════════════════════════════════════════════════════════════
-- SHADOW-TESTS: PflegeCoach (DiPA) — Rollen/Rechte, RLS, Produktgrenze
-- ════════════════════════════════════════════════════════════════════
--
-- Setzt 00_supabase_bootstrap.sql + alle Migrationen (inkl.
-- 20260819010000_pflegecoach_dipa_modul.sql) + 10_seed_two_orgs.sql
-- voraus. Läuft NUR gegen eine Shadow-DB (./scripts/shadow-db.sh):
--
--   ./scripts/shadow-db.sh up
--   psql -h 127.0.0.1 -p 55432 -U postgres -d shadow -f supabase/shadow/10_seed_two_orgs.sql
--   psql -h 127.0.0.1 -p 55432 -U postgres -d shadow -f supabase/shadow/50_pflegecoach_tests.sql
--
-- Prüft die DiPAV-kritischen Zusicherungen:
--   P1  Nutzer sieht/schreibt NUR eigene coach_*-Daten
--   P2  Fremde Nutzer sehen nichts und können nichts unterschieben
--   P3  Betriebs-Admins haben KEINEN Zugriff (Produktgrenze!)
--   P4  anon hat keinerlei Zugriff (Grant-Ebene)
--   P5  Freigabe (coach_shares): lesend, widerruflich, nie schreibend
--   P6  Unveränderlichkeit: reports kein UPDATE/DELETE, consents kein DELETE
--   P7  Audit-Log: append-only, nur eigene Einträge lesbar
--   P8  Struktur: RLS auf allen coach_-Tabellen aktiv
-- ════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on
\set ADMIN_A '''a0000000-0000-4000-8000-0000000000a1'''
\set PB      '''c0000000-0000-4000-8000-0000000000c1'''
\set ANG     '''c0000000-0000-4000-8000-0000000000c2'''
\set FREMD   '''c0000000-0000-4000-8000-0000000000c3'''
\set CU_PB   '''cc000000-0000-4000-8000-0000000000d1'''

CREATE TEMP TABLE shadow_test_results (
  nr       serial,
  bereich  text,
  test     text,
  erwartet text,
  gemessen text,
  status   text
);

CREATE OR REPLACE FUNCTION pg_temp.check_test(
  p_bereich text, p_test text, p_erwartet anyelement, p_gemessen anyelement
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO shadow_test_results (bereich, test, erwartet, gemessen, status)
  VALUES (p_bereich, p_test, p_erwartet::text, p_gemessen::text,
          CASE WHEN p_erwartet::text IS NOT DISTINCT FROM p_gemessen::text
               THEN 'PASS' ELSE 'FAIL' END);
END $$;

-- SELECT-Zähler mit Rechtefehler-Abfang (Muster aus 20_tenant_tests.sql)
CREATE OR REPLACE FUNCTION pg_temp.zaehle(p_sql text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
  EXECUTE p_sql INTO n;
  RETURN n::text;
EXCEPTION WHEN insufficient_privilege THEN
  RETURN 'verweigert';
END $$;

-- DML-Probe: liefert betroffene Zeilenzahl, 'verweigert' bei Rechtefehler,
-- sonst den SQLSTATE (z. B. RLS-WITH-CHECK → 42501 kommt als 'verweigert').
CREATE OR REPLACE FUNCTION pg_temp.dml(p_sql text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
  EXECUTE p_sql;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n::text;
EXCEPTION
  WHEN insufficient_privilege THEN RETURN 'verweigert';
  WHEN others THEN RETURN SQLSTATE;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.als_user(p_uid text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
END $$;

-- ── Seed: 3 Coach-Testnutzer (als postgres) ──────────────────────────
INSERT INTO auth.users (id, email) VALUES
  ('c0000000-0000-4000-8000-0000000000c1', 'pb@shadow.test'),
  ('c0000000-0000-4000-8000-0000000000c2', 'angehoerig@shadow.test'),
  ('c0000000-0000-4000-8000-0000000000c3', 'fremd@shadow.test')
ON CONFLICT (id) DO NOTHING;

-- ════════════════════════════════════════════════════════════════════
-- P1) Pflegebedürftige/r legt eigene Daten an und sieht sie
-- ════════════════════════════════════════════════════════════════════
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_temp.als_user(:PB);

SELECT pg_temp.check_test('P1', 'PB legt coach_users-Profil an', '1',
  pg_temp.dml($$INSERT INTO coach_users (id, user_id, rolle, anzeigename, pflegegrad)
    VALUES ('cc000000-0000-4000-8000-0000000000d1'::uuid,
            'c0000000-0000-4000-8000-0000000000c1'::uuid, 'pflegebeduerftig', 'PB Test', 2)$$));

SELECT pg_temp.check_test('P1', 'PB legt Einwilligung an', '1',
  pg_temp.dml($$INSERT INTO coach_consents (coach_user_id, consent_typ, text_version, erteilt)
    VALUES ('cc000000-0000-4000-8000-0000000000d1'::uuid, 'gesundheitsdaten_art9', '2026-08-v1', true)$$));

SELECT pg_temp.check_test('P1', 'PB legt Ziel an', '1',
  pg_temp.dml($$INSERT INTO coach_goals (id, coach_user_id, titel, bereich)
    VALUES ('cc000000-0000-4000-8000-0000000000e1'::uuid,
            'cc000000-0000-4000-8000-0000000000d1'::uuid, 'Täglich gehen', 'mobilitaet')$$));

SELECT pg_temp.check_test('P1', 'PB legt Messung an', '1',
  pg_temp.dml($$INSERT INTO coach_measurements (coach_user_id, instrument, antworten, summenwert)
    VALUES ('cc000000-0000-4000-8000-0000000000d1'::uuid, 'belastung_kurz', '{}'::jsonb, 5)$$));

SELECT pg_temp.check_test('P1', 'PB legt Bericht an', '1',
  pg_temp.dml($$INSERT INTO coach_reports (id, coach_user_id, report_typ, inhalt)
    VALUES ('cc000000-0000-4000-8000-0000000000e2'::uuid,
            'cc000000-0000-4000-8000-0000000000d1'::uuid, 'verlaufsbericht', '{}'::jsonb)$$));

SELECT pg_temp.check_test('P1', 'PB sieht 1 eigenes Profil', '1',
  pg_temp.zaehle('SELECT count(*) FROM coach_users'));
SELECT pg_temp.check_test('P1', 'PB sieht 1 eigenes Ziel', '1',
  pg_temp.zaehle('SELECT count(*) FROM coach_goals'));
COMMIT;

-- ════════════════════════════════════════════════════════════════════
-- P2) Fremder authentifizierter Nutzer: sieht nichts, kann nichts unterschieben
-- ════════════════════════════════════════════════════════════════════
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_temp.als_user(:FREMD);

SELECT pg_temp.check_test('P2', 'FREMD sieht 0 coach_users', '0',
  pg_temp.zaehle('SELECT count(*) FROM coach_users'));
SELECT pg_temp.check_test('P2', 'FREMD sieht 0 Ziele', '0',
  pg_temp.zaehle('SELECT count(*) FROM coach_goals'));
SELECT pg_temp.check_test('P2', 'FREMD sieht 0 Messungen', '0',
  pg_temp.zaehle('SELECT count(*) FROM coach_measurements'));

-- INSERT mit fremder coach_user_id muss an WITH CHECK scheitern.
-- RLS-Verstöße sind SQLSTATE 42501 (insufficient_privilege) — pg_temp.dml
-- mappt das auf 'verweigert'.
SELECT pg_temp.check_test('P2', 'FREMD kann PB kein Ziel unterschieben', 'verweigert',
  pg_temp.dml($$INSERT INTO coach_goals (coach_user_id, titel, bereich)
    VALUES ('cc000000-0000-4000-8000-0000000000d1'::uuid, 'Unterschoben', 'mobilitaet')$$));

-- UPDATE/DELETE auf PBs Ziel: RLS filtert → 0 Zeilen betroffen
SELECT pg_temp.check_test('P2', 'FREMD kann PBs Ziel nicht ändern', '0',
  pg_temp.dml($$UPDATE coach_goals SET titel = 'gekapert'
    WHERE id = 'cc000000-0000-4000-8000-0000000000e1'::uuid$$));
SELECT pg_temp.check_test('P2', 'FREMD kann PBs Profil nicht löschen', '0',
  pg_temp.dml($$DELETE FROM coach_users
    WHERE id = 'cc000000-0000-4000-8000-0000000000d1'::uuid$$));
COMMIT;

-- ════════════════════════════════════════════════════════════════════
-- P3) PRODUKTGRENZE: Betriebs-Admin (profiles.role=admin) sieht NICHTS
-- ════════════════════════════════════════════════════════════════════
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_temp.als_user(:ADMIN_A);

SELECT pg_temp.check_test('P3', 'Admin sieht 0 coach_users', '0',
  pg_temp.zaehle('SELECT count(*) FROM coach_users'));
SELECT pg_temp.check_test('P3', 'Admin sieht 0 Ziele', '0',
  pg_temp.zaehle('SELECT count(*) FROM coach_goals'));
SELECT pg_temp.check_test('P3', 'Admin sieht 0 Messungen', '0',
  pg_temp.zaehle('SELECT count(*) FROM coach_measurements'));
SELECT pg_temp.check_test('P3', 'Admin sieht 0 Einwilligungen', '0',
  pg_temp.zaehle('SELECT count(*) FROM coach_consents'));
SELECT pg_temp.check_test('P3', 'Admin sieht 0 Audit-Einträge', '0',
  pg_temp.zaehle('SELECT count(*) FROM coach_audit_log'));
COMMIT;

-- ════════════════════════════════════════════════════════════════════
-- P4) anon: kompletter Grant-Entzug
-- ════════════════════════════════════════════════════════════════════
BEGIN;
SET LOCAL ROLE anon;

SELECT pg_temp.check_test('P4', 'anon: SELECT coach_users verweigert', 'verweigert',
  pg_temp.zaehle('SELECT count(*) FROM coach_users'));
SELECT pg_temp.check_test('P4', 'anon: SELECT coach_goals verweigert', 'verweigert',
  pg_temp.zaehle('SELECT count(*) FROM coach_goals'));
SELECT pg_temp.check_test('P4', 'anon: INSERT coach_users verweigert', 'verweigert',
  pg_temp.dml($$INSERT INTO coach_users (user_id, rolle)
    VALUES ('c0000000-0000-4000-8000-0000000000c3'::uuid, 'pflegebeduerftig')$$));
COMMIT;

-- ════════════════════════════════════════════════════════════════════
-- P5) Freigabe: lesend nach Share, nie schreibend, nach Widerruf nichts
-- ════════════════════════════════════════════════════════════════════
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_temp.als_user(:PB);
SELECT pg_temp.check_test('P5', 'PB erteilt ANG eine Freigabe', '1',
  pg_temp.dml($$INSERT INTO coach_shares (id, owner_coach_user_id, grantee_user_id, empfaenger_rolle)
    VALUES ('cc000000-0000-4000-8000-0000000000f1'::uuid,
            'cc000000-0000-4000-8000-0000000000d1'::uuid,
            'c0000000-0000-4000-8000-0000000000c2'::uuid, 'angehoerig')$$));
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_temp.als_user(:ANG);
SELECT pg_temp.check_test('P5', 'ANG sieht PBs Ziel nach Freigabe', '1',
  pg_temp.zaehle('SELECT count(*) FROM coach_goals'));
SELECT pg_temp.check_test('P5', 'ANG sieht PBs Messungen nach Freigabe', '1',
  pg_temp.zaehle('SELECT count(*) FROM coach_measurements'));
SELECT pg_temp.check_test('P5', 'Freigabe ist NUR lesend (kein UPDATE)', '0',
  pg_temp.dml($$UPDATE coach_goals SET titel = 'geändert durch ANG'
    WHERE id = 'cc000000-0000-4000-8000-0000000000e1'::uuid$$));
SELECT pg_temp.check_test('P5', 'ANG sieht PBs Profil NICHT (coach_users bleibt privat)', '0',
  pg_temp.zaehle('SELECT count(*) FROM coach_users WHERE user_id <> auth.uid()'));
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_temp.als_user(:PB);
SELECT pg_temp.check_test('P5', 'PB widerruft die Freigabe', '1',
  pg_temp.dml($$UPDATE coach_shares SET widerrufen_am = now()
    WHERE id = 'cc000000-0000-4000-8000-0000000000f1'::uuid$$));
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_temp.als_user(:ANG);
SELECT pg_temp.check_test('P5', 'Nach Widerruf sieht ANG 0 Ziele', '0',
  pg_temp.zaehle('SELECT count(*) FROM coach_goals'));
COMMIT;

-- ════════════════════════════════════════════════════════════════════
-- P6) Unveränderlichkeit: reports kein UPDATE/DELETE, consents kein DELETE
-- ════════════════════════════════════════════════════════════════════
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_temp.als_user(:PB);

SELECT pg_temp.check_test('P6', 'Eigener Bericht: UPDATE verweigert (Grant entzogen)', 'verweigert',
  pg_temp.dml($$UPDATE coach_reports SET inhalt = '{"manipuliert":true}'::jsonb
    WHERE id = 'cc000000-0000-4000-8000-0000000000e2'::uuid$$));
SELECT pg_temp.check_test('P6', 'Eigener Bericht: DELETE verweigert', 'verweigert',
  pg_temp.dml($$DELETE FROM coach_reports
    WHERE id = 'cc000000-0000-4000-8000-0000000000e2'::uuid$$));
SELECT pg_temp.check_test('P6', 'Eigene Einwilligung: DELETE verweigert', 'verweigert',
  pg_temp.dml($$DELETE FROM coach_consents$$));
COMMIT;

-- ════════════════════════════════════════════════════════════════════
-- P7) Audit-Log: Einträge entstanden, nur selbst lesbar, append-only
-- ════════════════════════════════════════════════════════════════════
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_temp.als_user(:PB);

SELECT pg_temp.check_test('P7', 'PB hat Audit-Einträge (>= 6 Schreibzugriffe)', 'true',
  (SELECT (count(*) >= 6)::text FROM coach_audit_log));
SELECT pg_temp.check_test('P7', 'Audit enthält KEINE Datenwerte-Spalte',
  '0', pg_temp.zaehle($$SELECT count(*) FROM information_schema.columns
    WHERE table_name = 'coach_audit_log' AND column_name IN ('alte_werte','neue_werte','details','old_data','new_data')$$));
SELECT pg_temp.check_test('P7', 'PB kann Audit nicht direkt beschreiben', 'verweigert',
  pg_temp.dml($$INSERT INTO coach_audit_log (tabelle, aktion) VALUES ('x','INSERT')$$));
SELECT pg_temp.check_test('P7', 'PB kann Audit nicht ändern', 'verweigert',
  pg_temp.dml($$UPDATE coach_audit_log SET tabelle = 'y'$$));
SELECT pg_temp.check_test('P7', 'PB kann Audit nicht löschen', 'verweigert',
  pg_temp.dml($$DELETE FROM coach_audit_log$$));
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_temp.als_user(:FREMD);
SELECT pg_temp.check_test('P7', 'FREMD sieht 0 Audit-Einträge', '0',
  pg_temp.zaehle('SELECT count(*) FROM coach_audit_log'));
COMMIT;

-- ════════════════════════════════════════════════════════════════════
-- P8) Struktur: RLS aktiv, anon-Grants = 0 auf allen coach_-Tabellen
-- ════════════════════════════════════════════════════════════════════
SELECT pg_temp.check_test('P8', 'Alle 10 coach_-Tabellen haben RLS aktiv', 10::bigint,
  (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r'
     AND c.relname LIKE 'coach\_%' AND c.relrowsecurity));

SELECT pg_temp.check_test('P8', 'anon hat 0 Grants auf coach_-Tabellen', 0::bigint,
  (SELECT count(*) FROM information_schema.role_table_grants
   WHERE grantee = 'anon' AND table_schema = 'public' AND table_name LIKE 'coach\_%'));

-- ════════════════════════════════════════════════════════════════════
-- Auswertung
-- ════════════════════════════════════════════════════════════════════
\echo ''
\echo '── Ergebnis PflegeCoach ─────────────────────────────────────────'
SELECT nr, bereich, test, erwartet, gemessen, status
FROM shadow_test_results ORDER BY nr;

SELECT status, count(*) FROM shadow_test_results GROUP BY status ORDER BY status;

DO $$
DECLARE f integer;
BEGIN
  SELECT count(*) INTO f FROM shadow_test_results WHERE status = 'FAIL';
  IF f > 0 THEN
    RAISE EXCEPTION '% PflegeCoach-Test(s) fehlgeschlagen', f;
  END IF;
  RAISE NOTICE 'Alle PflegeCoach-Tests bestanden.';
END $$;
