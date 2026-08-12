-- ════════════════════════════════════════════════════════════════════
-- SHADOW-TESTS: Vitalwerte — Constraints, RLS/Mandantentrennung, Engel-,
--               Kunden- und Admin-Rechte
-- ════════════════════════════════════════════════════════════════════
-- Setzt 00_supabase_bootstrap.sql + alle Migrationen + 10_seed_two_orgs.sql
-- voraus. Läuft NUR gegen eine Shadow-DB (./scripts/shadow-db.sh).
-- Selbst-enthaltend: definiert eigene Helfer, damit es unabhängig von
-- 20_tenant_tests.sql läuft.
-- ════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on
\set ORG_A  '''aaaaaaaa-0000-4000-8000-000000000001'''
\set ADMIN_A '''a0000000-0000-4000-8000-0000000000a1'''
\set ENGEL_A '''a0000000-0000-4000-8000-0000000000a3'''
\set KUNDE_A '''a0000000-0000-4000-8000-0000000000a2'''
\set ADMIN_B '''b0000000-0000-4000-8000-0000000000b1'''
\set CLIENT_A1 '''c1a00000-0000-4000-8000-000000000001'''
\set CLIENT_A2 '''c2a00000-0000-4000-8000-000000000002'''
\set CG_A '''e1a00000-0000-4000-8000-000000000001'''

CREATE TEMP TABLE vw_results (
  nr serial, bereich text, test text, erwartet text, gemessen text, status text
);

CREATE OR REPLACE FUNCTION pg_temp.check_test(
  p_bereich text, p_test text, p_erwartet text, p_gemessen text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO vw_results (bereich, test, erwartet, gemessen, status)
  VALUES (p_bereich, p_test, p_erwartet, p_gemessen,
          CASE WHEN p_erwartet IS NOT DISTINCT FROM p_gemessen
               THEN 'PASS' ELSE 'FAIL' END);
END $$;

CREATE OR REPLACE FUNCTION pg_temp.als_user(p_uid text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
END $$;

CREATE OR REPLACE FUNCTION pg_temp.zaehle(p_sql text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
  EXECUTE p_sql INTO n; RETURN n::text;
EXCEPTION WHEN insufficient_privilege THEN RETURN 'verweigert';
END $$;

-- Wiederholbarkeit: eigene Tabellen leeren (als postgres, vor den Fixtures).
TRUNCATE vital_signs, vital_sign_thresholds;

-- ── Fixtures (als postgres, RLS wird umgangen) ───────────────────────
-- Engel-User + Mitgliedschaft (steuert current_org_id()), Caregiver an den
-- Engel binden, aktive Zuweisung auf Klient A1 (NICHT auf A2).
INSERT INTO auth.users (id, email) VALUES (:ENGEL_A, 'engel-a@shadow.test')
  ON CONFLICT (id) DO NOTHING;
INSERT INTO public.profiles (id, role, first_name, last_name, email)
  VALUES (:ENGEL_A, 'engel', 'Engel', 'EinsA', 'engel-a@shadow.test')
  ON CONFLICT (id) DO UPDATE SET role = 'engel';
INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (:ORG_A, :ENGEL_A, 'staff') ON CONFLICT DO NOTHING;
UPDATE public.caregivers SET user_id = :ENGEL_A WHERE id = :CG_A;
INSERT INTO public.assignments
  (id, organization_id, client_id, caregiver_id, start_time, end_time, service_type, status)
VALUES ('a5510000-0000-4000-8000-000000000001', :ORG_A, :CLIENT_A1, :CG_A,
        TIME '08:00', TIME '10:00', 'alltagsbegleitung', 'active')
ON CONFLICT (id) DO NOTHING;

-- ════════════════════════════════════════════════════════════════════
-- 1) Struktur & Security-Fix
-- ════════════════════════════════════════════════════════════════════
SELECT pg_temp.check_test('STRUKTUR', 'vital_signs hat RLS aktiv', 'true',
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'vital_signs')::text);
SELECT pg_temp.check_test('STRUKTUR', 'vital_sign_thresholds hat RLS aktiv', 'true',
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'vital_sign_thresholds')::text);
-- Security-Fix: es darf KEINE Kunden-Lesepolicy auf vital_signs geben.
SELECT pg_temp.check_test('SECURITY', 'keine kunde_vital_signs_select-Policy', '0',
  (SELECT count(*) FROM pg_policies
     WHERE tablename = 'vital_signs' AND policyname = 'kunde_vital_signs_select')::text);
-- Keine profiles-Subquery in den Policies (42P17-Falle).
SELECT pg_temp.check_test('SECURITY', 'keine profiles-Subquery in vital-Policies', '0',
  (SELECT count(*) FROM pg_policies
     WHERE tablename IN ('vital_signs','vital_sign_thresholds')
       AND (COALESCE(qual,'') ILIKE '%from profiles%' OR COALESCE(with_check,'') ILIKE '%from profiles%'))::text);

-- ════════════════════════════════════════════════════════════════════
-- 2) Constraints (als postgres; jeder Verstoß MUSS eine Exception werfen)
-- ════════════════════════════════════════════════════════════════════
DO $$ BEGIN
  BEGIN
    INSERT INTO vital_signs (organization_id, client_id, type, value, unit, measured_by)
    VALUES ('aaaaaaaa-0000-4000-8000-000000000001','c1a00000-0000-4000-8000-000000000001',
            'cholesterin', 200, 'mg/dl', 'a0000000-0000-4000-8000-0000000000a1');
    PERFORM pg_temp.check_test('CONSTRAINT','type-Check lehnt unbekannten Typ ab','abgelehnt','durchgelassen');
  EXCEPTION WHEN check_violation THEN
    PERFORM pg_temp.check_test('CONSTRAINT','type-Check lehnt unbekannten Typ ab','abgelehnt','abgelehnt');
  END;
  BEGIN
    INSERT INTO vital_signs (organization_id, client_id, type, value, unit, measured_by)
    VALUES ('aaaaaaaa-0000-4000-8000-000000000001','c1a00000-0000-4000-8000-000000000001',
            'blutdruck', 120, 'mmHg', 'a0000000-0000-4000-8000-0000000000a1');
    PERFORM pg_temp.check_test('CONSTRAINT','Blutdruck ohne diastolisch abgelehnt','abgelehnt','durchgelassen');
  EXCEPTION WHEN check_violation THEN
    PERFORM pg_temp.check_test('CONSTRAINT','Blutdruck ohne diastolisch abgelehnt','abgelehnt','abgelehnt');
  END;
  BEGIN
    INSERT INTO vital_signs (organization_id, client_id, type, value, value_secondary, unit, measured_by)
    VALUES ('aaaaaaaa-0000-4000-8000-000000000001','c1a00000-0000-4000-8000-000000000001',
            'puls', 72, 60, 'bpm', 'a0000000-0000-4000-8000-0000000000a1');
    PERFORM pg_temp.check_test('CONSTRAINT','Zweitwert nur bei Blutdruck erlaubt','abgelehnt','durchgelassen');
  EXCEPTION WHEN check_violation THEN
    PERFORM pg_temp.check_test('CONSTRAINT','Zweitwert nur bei Blutdruck erlaubt','abgelehnt','abgelehnt');
  END;
  -- Grenzwert-Constraints
  BEGIN
    INSERT INTO vital_sign_thresholds (organization_id, client_id, type, min_warn, max_warn, min_critical)
    VALUES ('aaaaaaaa-0000-4000-8000-000000000001','c1a00000-0000-4000-8000-000000000001',
            'puls', 50, 100, 60);
    PERFORM pg_temp.check_test('CONSTRAINT','kritisch>warn (Verschachtelung) abgelehnt','abgelehnt','durchgelassen');
  EXCEPTION WHEN check_violation THEN
    PERFORM pg_temp.check_test('CONSTRAINT','kritisch>warn (Verschachtelung) abgelehnt','abgelehnt','abgelehnt');
  END;
  BEGIN
    INSERT INTO vital_sign_thresholds (organization_id, client_id, type, min_warn_secondary)
    VALUES ('aaaaaaaa-0000-4000-8000-000000000001','c1a00000-0000-4000-8000-000000000001',
            'puls', 60);
    PERFORM pg_temp.check_test('CONSTRAINT','Sekundär-Grenze nur bei Blutdruck','abgelehnt','durchgelassen');
  EXCEPTION WHEN check_violation THEN
    PERFORM pg_temp.check_test('CONSTRAINT','Sekundär-Grenze nur bei Blutdruck','abgelehnt','abgelehnt');
  END;
END $$;
-- Unique (client,type): zwei Grenzwertsätze für denselben Typ → Verstoß
DO $$ BEGIN
  INSERT INTO vital_sign_thresholds (organization_id, client_id, type, min_warn, max_warn)
  VALUES ('aaaaaaaa-0000-4000-8000-000000000001','c1a00000-0000-4000-8000-000000000001','spo2', 92, NULL);
  BEGIN
    INSERT INTO vital_sign_thresholds (organization_id, client_id, type, min_warn, max_warn)
    VALUES ('aaaaaaaa-0000-4000-8000-000000000001','c1a00000-0000-4000-8000-000000000001','spo2', 90, NULL);
    PERFORM pg_temp.check_test('CONSTRAINT','unique(client,type) verhindert Dublette','abgelehnt','durchgelassen');
  EXCEPTION WHEN unique_violation THEN
    PERFORM pg_temp.check_test('CONSTRAINT','unique(client,type) verhindert Dublette','abgelehnt','abgelehnt');
  END;
END $$;

-- ════════════════════════════════════════════════════════════════════
-- 3) RLS: Mandantentrennung (Admin)
-- ════════════════════════════════════════════════════════════════════
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_temp.als_user(:ADMIN_A);
-- Admin A erfasst eine Messung für Klient A1 (org_id-Default = current_org_id() = A)
INSERT INTO vital_signs (client_id, type, value, unit, measured_by)
VALUES (:CLIENT_A1, 'puls', 68, 'bpm', :ADMIN_A);
SELECT pg_temp.check_test('RLS', 'Admin A sieht die eigene Messung', '1',
  pg_temp.zaehle('SELECT count(*) FROM vital_signs WHERE client_id = '''||:CLIENT_A1||''''));
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_temp.als_user(:ADMIN_B);
SELECT pg_temp.check_test('RLS', 'Admin B sieht KEINE Org-A-Messung', '0',
  pg_temp.zaehle('SELECT count(*) FROM vital_signs WHERE client_id = '''||:CLIENT_A1||''''));
COMMIT;

-- ════════════════════════════════════════════════════════════════════
-- 4) RLS: Engel-Rechte (nur zugewiesene Klienten, measured_by = self)
-- ════════════════════════════════════════════════════════════════════
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_temp.als_user(:ENGEL_A);
-- 4a) Engel erfasst für ZUGEWIESENEN Klienten A1 mit measured_by = self → OK
DO $$ BEGIN
  INSERT INTO vital_signs (client_id, type, value, unit, measured_by)
  VALUES ('c1a00000-0000-4000-8000-000000000001','temperatur', 37.0, '°C',
          'a0000000-0000-4000-8000-0000000000a3');
  PERFORM pg_temp.check_test('RLS-ENGEL','Engel erfasst für zugewiesenen Klienten','ok','ok');
EXCEPTION WHEN insufficient_privilege THEN
  PERFORM pg_temp.check_test('RLS-ENGEL','Engel erfasst für zugewiesenen Klienten','ok','verweigert');
END $$;
-- 4b) Engel fälscht measured_by (fremde uid) → WITH CHECK verweigert
DO $$ BEGIN
  INSERT INTO vital_signs (client_id, type, value, unit, measured_by)
  VALUES ('c1a00000-0000-4000-8000-000000000001','puls', 70, 'bpm',
          'a0000000-0000-4000-8000-0000000000a1');
  PERFORM pg_temp.check_test('RLS-ENGEL','Engel kann measured_by NICHT fälschen','verweigert','durchgelassen');
EXCEPTION WHEN insufficient_privilege THEN
  PERFORM pg_temp.check_test('RLS-ENGEL','Engel kann measured_by NICHT fälschen','verweigert','verweigert');
END $$;
-- 4c) Engel erfasst für NICHT zugewiesenen Klienten A2 → verweigert
DO $$ BEGIN
  INSERT INTO vital_signs (client_id, type, value, unit, measured_by)
  VALUES ('c2a00000-0000-4000-8000-000000000002','puls', 70, 'bpm',
          'a0000000-0000-4000-8000-0000000000a3');
  PERFORM pg_temp.check_test('RLS-ENGEL','Engel NICHT für fremden Klienten','verweigert','durchgelassen');
EXCEPTION WHEN insufficient_privilege THEN
  PERFORM pg_temp.check_test('RLS-ENGEL','Engel NICHT für fremden Klienten','verweigert','verweigert');
END $$;
-- 4d) Engel sieht nur Messungen seines zugewiesenen Klienten (A1), nicht A2
SELECT pg_temp.check_test('RLS-ENGEL','Engel sieht Messungen von Klient A2 nicht', '0',
  pg_temp.zaehle('SELECT count(*) FROM vital_signs WHERE client_id = '''||:CLIENT_A2||''''));
COMMIT;

-- ════════════════════════════════════════════════════════════════════
-- 5) RLS: Kunde sieht KEINE Vitalwerte (Security-Fix, keine Kunden-Policy)
-- ════════════════════════════════════════════════════════════════════
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_temp.als_user(:KUNDE_A);
-- Kunde A ist user_id von Klient A1 — dürfte OHNE Policy 0 Zeilen sehen.
SELECT pg_temp.check_test('RLS-KUNDE','Kunde sieht eigene Vitalwerte NICHT', '0',
  pg_temp.zaehle('SELECT count(*) FROM vital_signs WHERE client_id = '''||:CLIENT_A1||''''));
COMMIT;

RESET ROLE;

-- ════════════════════════════════════════════════════════════════════
-- Auswertung
-- ════════════════════════════════════════════════════════════════════
\echo ''
\echo '── Vitalwerte-Shadow-Tests ─────────────────────────────'
SELECT lpad(nr::text,2) AS nr, bereich, test, status FROM vw_results ORDER BY nr;
DO $$
DECLARE f int;
BEGIN
  SELECT count(*) INTO f FROM vw_results WHERE status = 'FAIL';
  RAISE NOTICE '%', repeat('─', 56);
  IF f = 0 THEN RAISE NOTICE 'ALLE % TESTS GRÜN', (SELECT count(*) FROM vw_results);
  ELSE RAISE EXCEPTION '% Test(s) FEHLGESCHLAGEN', f;
  END IF;
END $$;
