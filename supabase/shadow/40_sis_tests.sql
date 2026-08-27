-- ════════════════════════════════════════════════════════════════════
-- SHADOW-TESTS: SIS — Strukturierte Informationssammlung
-- RLS (admin/kunde/engel/anon), Mandanten-Fence, Sperr-Trigger,
-- CHECK-/UNIQUE-Constraints. Muster analog 20_tenant_tests.sql.
--
-- Setzt 00_supabase_bootstrap.sql + alle Migrationen (inkl.
-- 20260818010000_sis_strukturierte_informationssammlung.sql) und
-- 10_seed_two_orgs.sql voraus. Läuft NUR gegen eine Shadow-DB.
-- ════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on
\set ORG_A   '''aaaaaaaa-0000-4000-8000-000000000001'''
\set ORG_B   '''bbbbbbbb-0000-4000-8000-000000000002'''
\set ADMIN_A '''a0000000-0000-4000-8000-0000000000a1'''
\set ADMIN_B '''b0000000-0000-4000-8000-0000000000b1'''
\set KUNDE_A '''a0000000-0000-4000-8000-0000000000a2'''
\set ENGEL_A '''ea000000-0000-4000-8000-0000000000e1'''
\set CLIENT_A1 '''c1a00000-0000-4000-8000-000000000001'''
\set CLIENT_B1 '''c1b00000-0000-4000-8000-000000000003'''
\set SIS_A   '''d1a00000-0000-4000-8000-000000000001'''
\set SIS_B   '''d1b00000-0000-4000-8000-000000000002'''

CREATE TEMP TABLE sis_test_results (
  nr serial, bereich text, test text, erwartet text, gemessen text, status text
);

CREATE OR REPLACE FUNCTION pg_temp.check_test(
  p_bereich text, p_test text, p_erwartet text, p_gemessen text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO sis_test_results (bereich, test, erwartet, gemessen, status)
  VALUES (p_bereich, p_test, p_erwartet, p_gemessen,
          CASE WHEN p_erwartet IS NOT DISTINCT FROM p_gemessen THEN 'PASS' ELSE 'FAIL' END);
END $$;

-- Zählt Zeilen; Rechtefehler werden als 'verweigert' protokolliert.
CREATE OR REPLACE FUNCTION pg_temp.zaehle(p_sql text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
  EXECUTE p_sql INTO n;
  RETURN n::text;
EXCEPTION WHEN insufficient_privilege THEN
  RETURN 'verweigert';
END $$;

-- Führt DML aus; erwartete Blockade (RLS/Trigger/Constraint) → 'geblockt'.
CREATE OR REPLACE FUNCTION pg_temp.versuche(p_sql text)
RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  RETURN 'durchgelassen';
EXCEPTION
  WHEN insufficient_privilege THEN RETURN 'geblockt';
  WHEN check_violation THEN RETURN 'geblockt';
  WHEN unique_violation THEN RETURN 'geblockt';
  WHEN raise_exception THEN RETURN 'geblockt';
  WHEN others THEN
    -- RLS-WITH-CHECK-Verletzungen kommen als 42501/new row violates …
    IF SQLERRM LIKE '%row-level security%' THEN RETURN 'geblockt'; END IF;
    RAISE;
END $$;

-- Führt DML aus und liefert die Zahl der betroffenen Zeilen ('0' = RLS hat
-- still gefiltert, kein Fehler).
CREATE OR REPLACE FUNCTION pg_temp.dml_zeilen(p_sql text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
  EXECUTE p_sql;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n::text;
EXCEPTION WHEN insufficient_privilege THEN
  RETURN 'verweigert';
END $$;

CREATE OR REPLACE FUNCTION pg_temp.als_user(p_uid text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
END $$;

-- ════════════════════════════════════════════════════════════════════
-- 0) SETUP (als postgres): Engel-User mit aktiver Zuweisung auf Klient A1
--    + SIS-Daten je Org, wie createAdminClient() sie anlegt (service_role)
-- ════════════════════════════════════════════════════════════════════
BEGIN;
INSERT INTO auth.users (id, email) VALUES (:ENGEL_A, 'engel-a@shadow.test')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.profiles (id, role, first_name, last_name, email)
VALUES (:ENGEL_A, 'engel', 'Engel', 'EinsA', 'engel-a@shadow.test')
ON CONFLICT (id) DO UPDATE SET role = 'engel';
-- current_org_id() braucht die Mitgliedschaft, sonst fällt der Engel auf
-- die Stamm-Org zurück und der RESTRICTIVE-Fence blendet alles aus.
INSERT INTO public.organization_members (organization_id, user_id, role)
VALUES (:ORG_A, :ENGEL_A, 'staff') ON CONFLICT DO NOTHING;
UPDATE public.caregivers SET user_id = :ENGEL_A
WHERE id = 'e1a00000-0000-4000-8000-000000000001';
INSERT INTO public.assignments
  (client_id, caregiver_id, organization_id, start_time, end_time, service_type, status)
VALUES (:CLIENT_A1, 'e1a00000-0000-4000-8000-000000000001', :ORG_A,
        TIME '09:00', TIME '11:00', 'alltagsbegleitung', 'active')
ON CONFLICT DO NOTHING;
COMMIT;

BEGIN;
SET LOCAL ROLE service_role;
-- Re-Run-Fähigkeit ZUERST: Block 6 sperrt SIS_A, und der BEFORE-INSERT-
-- Trigger der Kindtabellen feuert VOR der ON-CONFLICT-Auflösung — ohne
-- Entsperrung würde schon das idempotente Re-Insert unten abbrechen.
-- (NEW.gesperrt=false ist der legitime Entsperr-Pfad des Triggers.)
UPDATE public.sis_assessments SET gesperrt = false, status = 'entwurf'
WHERE id IN (:SIS_A, :SIS_B) AND gesperrt = true;
INSERT INTO public.sis_assessments
  (id, organization_id, client_id, versorgungsform, erhoben_von, erstellt_von, eingangsfrage)
VALUES
  (:SIS_A, :ORG_A, :CLIENT_A1, 'ambulant', :ADMIN_A, :ADMIN_A, 'Ich möchte so lange wie möglich zu Hause bleiben.'),
  (:SIS_B, :ORG_B, :CLIENT_B1, 'ambulant', :ADMIN_B, :ADMIN_B, 'Testfall Org B')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.sis_themenfelder (organization_id, assessment_id, feld_nr)
SELECT :ORG_A, :SIS_A, nr FROM generate_series(1, 6) nr
ON CONFLICT (assessment_id, feld_nr) DO NOTHING;
INSERT INTO public.sis_themenfelder (organization_id, assessment_id, feld_nr)
SELECT :ORG_B, :SIS_B, nr FROM generate_series(1, 6) nr
ON CONFLICT (assessment_id, feld_nr) DO NOTHING;
INSERT INTO public.sis_risikomatrix (organization_id, assessment_id, risiko)
SELECT :ORG_A, :SIS_A, r FROM unnest(ARRAY['dekubitus','sturz','inkontinenz','schmerz','ernaehrung']) r
ON CONFLICT (assessment_id, risiko) DO NOTHING;
INSERT INTO public.sis_risikomatrix (organization_id, assessment_id, risiko)
SELECT :ORG_B, :SIS_B, r FROM unnest(ARRAY['dekubitus','sturz','inkontinenz','schmerz','ernaehrung']) r
ON CONFLICT (assessment_id, risiko) DO NOTHING;
COMMIT;

-- ════════════════════════════════════════════════════════════════════
-- 1) Admin A — sieht nur Org A, darf in Org A schreiben, nicht in Org B
-- ════════════════════════════════════════════════════════════════════
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_temp.als_user(:ADMIN_A);

SELECT pg_temp.check_test('RLS admin', 'Admin A sieht genau 1 SIS (Org A)',
  '1', pg_temp.zaehle('SELECT count(*) FROM public.sis_assessments'));
SELECT pg_temp.check_test('RLS admin', 'Admin A sieht 0 Org-B-SIS',
  '0', pg_temp.zaehle('SELECT count(*) FROM public.sis_assessments WHERE organization_id = ' || quote_literal(:ORG_B) || '::uuid'));
SELECT pg_temp.check_test('RLS admin', 'Admin A sieht 6 Themenfelder',
  '6', pg_temp.zaehle('SELECT count(*) FROM public.sis_themenfelder'));
SELECT pg_temp.check_test('RLS admin', 'Admin A sieht 5 Risikozeilen',
  '5', pg_temp.zaehle('SELECT count(*) FROM public.sis_risikomatrix'));

SELECT pg_temp.check_test('RLS admin', 'Admin A darf Org-A-SIS anlegen',
  'durchgelassen', pg_temp.versuche(
    'INSERT INTO public.sis_assessments (id, organization_id, client_id, erhoben_von, erstellt_von) VALUES ('
    || '''d2a00000-0000-4000-8000-000000000009''::uuid, '
    || quote_literal(:ORG_A) || '::uuid, ' || quote_literal(:CLIENT_A1) || '::uuid, ' || quote_literal(:ADMIN_A) || '::uuid, ' || quote_literal(:ADMIN_A) || '::uuid)'));
-- Aufräumen, damit spätere Zähl-Tests (Engel) deterministisch bleiben
DELETE FROM public.sis_assessments WHERE id = 'd2a00000-0000-4000-8000-000000000009';

SELECT pg_temp.check_test('RLS admin', 'Fence blockt Admin A bei INSERT mit Org-B-ID',
  'geblockt', pg_temp.versuche(
    'INSERT INTO public.sis_assessments (organization_id, client_id, erhoben_von, erstellt_von) VALUES ('
    || quote_literal(:ORG_B) || '::uuid, ' || quote_literal(:CLIENT_B1) || '::uuid, ' || quote_literal(:ADMIN_A) || '::uuid, ' || quote_literal(:ADMIN_A) || '::uuid)'));
COMMIT;

-- ════════════════════════════════════════════════════════════════════
-- 2) Admin B — Spiegelbild
-- ════════════════════════════════════════════════════════════════════
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_temp.als_user(:ADMIN_B);
SELECT pg_temp.check_test('RLS admin', 'Admin B sieht genau 1 SIS (Org B)',
  '1', pg_temp.zaehle('SELECT count(*) FROM public.sis_assessments'));
SELECT pg_temp.check_test('RLS admin', 'Admin B sieht 0 Org-A-SIS',
  '0', pg_temp.zaehle('SELECT count(*) FROM public.sis_assessments WHERE organization_id = ' || quote_literal(:ORG_A) || '::uuid'));
COMMIT;

-- ════════════════════════════════════════════════════════════════════
-- 3) Kunde A — keine Policy für Kunden → 0 Zeilen
-- ════════════════════════════════════════════════════════════════════
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_temp.als_user(:KUNDE_A);
SELECT pg_temp.check_test('RLS kunde', 'Kunde sieht 0 SIS',
  '0', pg_temp.zaehle('SELECT count(*) FROM public.sis_assessments'));
SELECT pg_temp.check_test('RLS kunde', 'Kunde sieht 0 Themenfelder',
  '0', pg_temp.zaehle('SELECT count(*) FROM public.sis_themenfelder'));
SELECT pg_temp.check_test('RLS kunde', 'Kunde darf keine SIS anlegen',
  'geblockt', pg_temp.versuche(
    'INSERT INTO public.sis_assessments (organization_id, client_id, erhoben_von, erstellt_von) VALUES ('
    || quote_literal(:ORG_A) || '::uuid, ' || quote_literal(:CLIENT_A1) || '::uuid, ' || quote_literal(:KUNDE_A) || '::uuid, ' || quote_literal(:KUNDE_A) || '::uuid)'));
COMMIT;

-- ════════════════════════════════════════════════════════════════════
-- 4) Engel A — liest SIS des aktiv zugewiesenen Klienten, schreibt nichts
-- ════════════════════════════════════════════════════════════════════
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_temp.als_user(:ENGEL_A);
SELECT pg_temp.check_test('RLS engel', 'Engel sieht SIS des zugewiesenen Klienten',
  '1', pg_temp.zaehle('SELECT count(*) FROM public.sis_assessments'));
SELECT pg_temp.check_test('RLS engel', 'Engel sieht dessen 6 Themenfelder',
  '6', pg_temp.zaehle('SELECT count(*) FROM public.sis_themenfelder'));
SELECT pg_temp.check_test('RLS engel', 'Engel sieht dessen 5 Risikozeilen',
  '5', pg_temp.zaehle('SELECT count(*) FROM public.sis_risikomatrix'));
SELECT pg_temp.check_test('RLS engel', 'Engel sieht 0 Org-B-SIS',
  '0', pg_temp.zaehle('SELECT count(*) FROM public.sis_assessments WHERE organization_id = ' || quote_literal(:ORG_B) || '::uuid'));
SELECT pg_temp.check_test('RLS engel', 'Engel darf SIS nicht ändern (0 Zeilen erfasst)',
  '0', pg_temp.dml_zeilen(
    'UPDATE public.sis_assessments SET bemerkung = ''engel-schreibversuch'' WHERE id = ' || quote_literal(:SIS_A) || '::uuid'));
COMMIT;

-- ════════════════════════════════════════════════════════════════════
-- 5) anon — Tabellenrechte entzogen
-- ════════════════════════════════════════════════════════════════════
BEGIN;
SET LOCAL ROLE anon;
SELECT pg_temp.check_test('RLS anon', 'anon: SELECT sis_assessments verweigert',
  'verweigert', pg_temp.zaehle('SELECT count(*) FROM public.sis_assessments'));
SELECT pg_temp.check_test('RLS anon', 'anon: SELECT sis_themenfelder verweigert',
  'verweigert', pg_temp.zaehle('SELECT count(*) FROM public.sis_themenfelder'));
SELECT pg_temp.check_test('RLS anon', 'anon: SELECT sis_risikomatrix verweigert',
  'verweigert', pg_temp.zaehle('SELECT count(*) FROM public.sis_risikomatrix'));
COMMIT;

-- ════════════════════════════════════════════════════════════════════
-- 6) Constraints & Trigger (als service_role — Trigger feuern trotzdem)
-- ════════════════════════════════════════════════════════════════════
BEGIN;
SET LOCAL ROLE service_role;

SELECT pg_temp.check_test('Constraint', 'feld_nr 7 wird abgewiesen',
  'geblockt', pg_temp.versuche(
    'INSERT INTO public.sis_themenfelder (organization_id, assessment_id, feld_nr) VALUES ('
    || quote_literal(:ORG_A) || '::uuid, ' || quote_literal(:SIS_A) || '::uuid, 7)'));
SELECT pg_temp.check_test('Constraint', 'Duplikat (assessment, feld_nr) wird abgewiesen',
  'geblockt', pg_temp.versuche(
    'INSERT INTO public.sis_themenfelder (organization_id, assessment_id, feld_nr) VALUES ('
    || quote_literal(:ORG_A) || '::uuid, ' || quote_literal(:SIS_A) || '::uuid, 1)'));
SELECT pg_temp.check_test('Constraint', 'Unbekanntes Risiko wird abgewiesen',
  'geblockt', pg_temp.versuche(
    'INSERT INTO public.sis_risikomatrix (organization_id, assessment_id, risiko) VALUES ('
    || quote_literal(:ORG_A) || '::uuid, ' || quote_literal(:SIS_A) || '::uuid, ''demenz'')'));
SELECT pg_temp.check_test('Constraint', 'Ungültiger Status wird abgewiesen',
  'geblockt', pg_temp.versuche(
    'UPDATE public.sis_assessments SET status = ''archiviert'' WHERE id = ' || quote_literal(:SIS_A) || '::uuid'));

-- updated_at-Trigger
UPDATE public.sis_themenfelder SET sicht_klient = 'Testeintrag'
WHERE assessment_id = :SIS_A ::uuid AND feld_nr = 1;
SELECT pg_temp.check_test('Trigger', 'updated_at wird beim UPDATE fortgeschrieben',
  'true', (SELECT (updated_at > created_at)::text FROM public.sis_themenfelder
        WHERE assessment_id = :SIS_A ::uuid AND feld_nr = 1));

-- Abschluss (ohne Sperre): status='abgeschlossen', gesperrt bleibt false —
-- muss dennoch bereits vollstaendig dicht sein (20261007000000-Haertung).
UPDATE public.sis_assessments SET status = 'entwurf', gesperrt = false WHERE id = :SIS_A ::uuid;
UPDATE public.sis_assessments SET status = 'abgeschlossen', abgeschlossen_am = now(), abgeschlossen_von = :ADMIN_A ::uuid
  WHERE id = :SIS_A ::uuid;

SELECT pg_temp.check_test('Trigger Abschluss', 'Abgeschlossener Kopfsatz (gesperrt=false) nicht änderbar',
  'geblockt', pg_temp.versuche(
    'UPDATE public.sis_assessments SET bemerkung = ''nachträglich'' WHERE id = ' || quote_literal(:SIS_A) || '::uuid'));
SELECT pg_temp.check_test('Trigger Abschluss', 'Themenfeld unter abgeschlossenem Kopf nicht änderbar',
  'geblockt', pg_temp.versuche(
    'UPDATE public.sis_themenfelder SET bemerkung = ''nachträglich'' WHERE assessment_id = ' || quote_literal(:SIS_A) || '::uuid AND feld_nr = 3'));
SELECT pg_temp.check_test('Trigger Abschluss', 'Risikozeile unter abgeschlossenem Kopf nicht löschbar',
  'geblockt', pg_temp.versuche(
    'DELETE FROM public.sis_risikomatrix WHERE assessment_id = ' || quote_literal(:SIS_A) || '::uuid AND risiko = ''ernaehrung'''));
SELECT pg_temp.check_test('Trigger Abschluss', 'Kein neues Themenfeld unter abgeschlossenem Kopf',
  'geblockt', pg_temp.versuche(
    'INSERT INTO public.sis_themenfelder (organization_id, assessment_id, feld_nr) VALUES ('
    || quote_literal(:ORG_A) || '::uuid, ' || quote_literal(:SIS_A) || '::uuid, 6) ON CONFLICT DO NOTHING'));
SELECT pg_temp.check_test('Trigger Abschluss', 'Wiedereröffnung (abgeschlossen → entwurf) bleibt möglich',
  'durchgelassen', pg_temp.versuche(
    'UPDATE public.sis_assessments SET status = ''entwurf'', abgeschlossen_am = NULL, abgeschlossen_von = NULL WHERE id = ' || quote_literal(:SIS_A) || '::uuid'));

-- Erneut abschließen und diesmal sperren, um den Sperr-Pfad wie zuvor zu prüfen
UPDATE public.sis_assessments SET status = 'abgeschlossen', abgeschlossen_am = now(), abgeschlossen_von = :ADMIN_A ::uuid
  WHERE id = :SIS_A ::uuid;

-- Sperre setzen, danach ist ALLES dicht (Kopf + Kinder)
UPDATE public.sis_assessments SET status = 'gesperrt', gesperrt = true WHERE id = :SIS_A ::uuid;

SELECT pg_temp.check_test('Trigger Sperre', 'Gesperrter Kopfsatz nicht änderbar',
  'geblockt', pg_temp.versuche(
    'UPDATE public.sis_assessments SET bemerkung = ''nachträglich'' WHERE id = ' || quote_literal(:SIS_A) || '::uuid'));
SELECT pg_temp.check_test('Trigger Sperre', 'Themenfeld unter gesperrtem Kopf nicht änderbar',
  'geblockt', pg_temp.versuche(
    'UPDATE public.sis_themenfelder SET bemerkung = ''nachträglich'' WHERE assessment_id = ' || quote_literal(:SIS_A) || '::uuid AND feld_nr = 2'));
SELECT pg_temp.check_test('Trigger Sperre', 'Kein neues Themenfeld unter gesperrtem Kopf',
  'geblockt', pg_temp.versuche(
    'DELETE FROM public.sis_themenfelder WHERE assessment_id = ' || quote_literal(:SIS_A) || '::uuid AND feld_nr = 6'));
SELECT pg_temp.check_test('Trigger Sperre', 'Risikozeile unter gesperrtem Kopf nicht löschbar',
  'geblockt', pg_temp.versuche(
    'DELETE FROM public.sis_risikomatrix WHERE assessment_id = ' || quote_literal(:SIS_A) || '::uuid AND risiko = ''sturz'''));
COMMIT;

-- ════════════════════════════════════════════════════════════════════
-- Auswertung — bricht mit Fehler ab, wenn mindestens ein Test FAIL ist
-- ════════════════════════════════════════════════════════════════════
SELECT nr, bereich, test, erwartet, gemessen, status FROM sis_test_results ORDER BY nr;

DO $$
DECLARE fails bigint;
BEGIN
  SELECT count(*) INTO fails FROM sis_test_results WHERE status <> 'PASS';
  IF fails > 0 THEN
    RAISE EXCEPTION 'SIS-Shadow-Tests: % FAIL(s)', fails;
  END IF;
  RAISE NOTICE 'SIS-Shadow-Tests: alle % Tests PASS', (SELECT count(*) FROM sis_test_results);
END $$;
