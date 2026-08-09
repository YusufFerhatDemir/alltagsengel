-- ════════════════════════════════════════════════════════════════════
-- verify-touren-rls.sql — Rollen/Rechte-Test für die Tourenplanung
-- ════════════════════════════════════════════════════════════════════
-- Läuft gegen die Shadow-DB (scripts/shadow-db.sh up), NIE gegen
-- Production nötig — testet ausschließlich die RLS-Policies aus
-- 20260809120000_tourenplanung.sql per Rollen-Impersonation.
--
--   psql … -d shadow -f scripts/verify-touren-rls.sql
--
-- Alles in einer Transaktion, am Ende ROLLBACK — hinterlässt nichts.
-- Jede Prüfung wirft bei Abweichung eine Exception (FAIL), sonst
-- NOTICE mit PASS. Exit-Code über ON_ERROR_STOP.
-- ════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on
BEGIN;

-- Impersonations-Helfer (Temp-Schema, verschwinden mit der Session)
CREATE FUNCTION pg_temp.als(rolle text, sub uuid, org uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $fn$
BEGIN
  PERFORM set_config('role', rolle, true);
  PERFORM set_config('request.jwt.claims',
    json_build_object(
      'sub', sub::text,
      'role', rolle,
      'app_metadata', CASE WHEN org IS NULL THEN '{}'::json
                           ELSE json_build_object('org_id', org::text) END
    )::text, true);
END
$fn$;

CREATE FUNCTION pg_temp.als_postgres()
RETURNS void LANGUAGE plpgsql AS $fn$
BEGIN
  PERFORM set_config('role', 'postgres', true);
  PERFORM set_config('request.jwt.claims', '', true);
END
$fn$;

DO $$
DECLARE
  org_a  uuid := '00000000-0000-4000-8000-000460629986'; -- Stamm-Org
  org_b  uuid := 'bbbbbbbb-0000-4000-8000-000000000001';
  u_admin uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
  u_engel1 uuid := 'aaaaaaaa-0000-4000-8000-000000000002';
  u_engel2 uuid := 'aaaaaaaa-0000-4000-8000-000000000003';
  u_kunde uuid := 'aaaaaaaa-0000-4000-8000-000000000004';
  c1 uuid := 'cccccccc-0000-4000-8000-000000000001';
  c2 uuid := 'cccccccc-0000-4000-8000-000000000002';
  c3 uuid := 'cccccccc-0000-4000-8000-000000000003';
  k1 uuid := 'dddddddd-0000-4000-8000-000000000001';
  t1 uuid := 'eeeeeeee-0000-4000-8000-000000000001';
  t2 uuid := 'eeeeeeee-0000-4000-8000-000000000002';
  t3 uuid := 'eeeeeeee-0000-4000-8000-000000000003';
  n int;
  fehler_kam boolean;
BEGIN
  -- ── Testdaten (als postgres, RLS-frei) ────────────────────────
  INSERT INTO organizations (id, name) VALUES (org_a, 'Stamm') ON CONFLICT (id) DO NOTHING;
  INSERT INTO organizations (id, name) VALUES (org_b, 'Fremd-Org') ON CONFLICT (id) DO NOTHING;

  INSERT INTO auth.users (id, email) VALUES
    (u_admin, 'rls-admin@test.local'),
    (u_engel1, 'rls-engel1@test.local'),
    (u_engel2, 'rls-engel2@test.local'),
    (u_kunde, 'rls-kunde@test.local');
  -- handle_new_user-Trigger legt profiles beim auth.users-Insert an → Upsert
  INSERT INTO profiles (id, role, first_name) VALUES
    (u_admin, 'admin', 'Admin'),
    (u_engel1, 'engel', 'EngelEins'),
    (u_engel2, 'engel', 'EngelZwei'),
    (u_kunde, 'kunde', 'Kunde')
  ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, first_name = EXCLUDED.first_name;

  INSERT INTO caregivers (id, user_id, first_name, last_name, initials, organization_id, status, zip_code) VALUES
    (c1, u_engel1, 'Engel', 'Eins', 'E.E.', org_a, 'active', '60311'),
    (c2, u_engel2, 'Engel', 'Zwei', 'E.Z.', org_a, 'active', '60313'),
    (c3, NULL, 'Engel', 'Fremd', 'E.F.', org_b, 'active', '10115');
  INSERT INTO clients (id, user_id, first_name, last_name, customer_number, organization_id, zip_code) VALUES
    (k1, u_kunde, 'Test', 'Klient', 'RLS-TEST-1', org_a, '63065');

  INSERT INTO tours (id, organization_id, caregiver_id, tour_date, status) VALUES
    (t1, org_a, c1, '2026-08-10', 'GEPLANT'),
    (t2, org_a, c2, '2026-08-10', 'GEPLANT'),
    (t3, org_b, c3, '2026-08-10', 'GEPLANT');
  INSERT INTO tour_stops (organization_id, tour_id, client_id, position, geplante_ankunft, geplantes_ende, plz) VALUES
    (org_a, t1, k1, 1, '08:00', '09:00', '63065'),
    (org_a, t2, k1, 1, '10:00', '11:00', '63065'),
    (org_b, t3, NULL, 1, '08:00', '09:00', '10115');
  INSERT INTO tour_templates (organization_id, name, caregiver_id, stops) VALUES
    (org_a, 'RLS-Test-Vorlage', c1, '[]'::jsonb);

  -- ── 1) Engel 1: sieht nur die eigene Tour ─────────────────────
  PERFORM pg_temp.als('authenticated', u_engel1);
  SELECT count(*) INTO n FROM tours;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL 1a: Engel1 sieht % Touren statt 1', n; END IF;
  SELECT count(*) INTO n FROM tours WHERE id = t1;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL 1b: Engel1 sieht die eigene Tour nicht'; END IF;
  RAISE NOTICE 'PASS 1: Engel sieht nur eigene Tour';

  -- ── 2) Engel 1: Stops nur der eigenen Tour ────────────────────
  SELECT count(*) INTO n FROM tour_stops;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL 2: Engel1 sieht % Stops statt 1', n; END IF;
  RAISE NOTICE 'PASS 2: Engel sieht nur Stops der eigenen Tour';

  -- ── 3) Engel 1: darf eigene Tour fortschreiben ────────────────
  UPDATE tours SET status = 'UNTERWEGS' WHERE id = t1;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL 3: Engel1 kann eigene Tour nicht updaten'; END IF;
  RAISE NOTICE 'PASS 3: Engel kann eigene Tour updaten';

  -- ── 4) Engel 1: fremde Tour unsichtbar/unveränderbar ─────────
  UPDATE tours SET status = 'STORNIERT' WHERE id = t2;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL 4: Engel1 konnte fremde Tour ändern!'; END IF;
  RAISE NOTICE 'PASS 4: Fremde Tour nicht änderbar';

  -- ── 5) Engel 1: darf keine Touren anlegen ─────────────────────
  fehler_kam := false;
  BEGIN
    INSERT INTO tours (organization_id, caregiver_id, tour_date) VALUES (org_a, c1, '2026-08-11');
  EXCEPTION WHEN insufficient_privilege OR OTHERS THEN
    fehler_kam := true;
  END;
  IF NOT fehler_kam THEN RAISE EXCEPTION 'FAIL 5: Engel1 konnte Tour anlegen!'; END IF;
  RAISE NOTICE 'PASS 5: Engel kann keine Tour anlegen';

  -- ── 6) Engel 1: Vorlagen sind Admin-Sache ─────────────────────
  SELECT count(*) INTO n FROM tour_templates;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL 6: Engel1 sieht % Vorlagen statt 0', n; END IF;
  RAISE NOTICE 'PASS 6: Vorlagen für Engel unsichtbar';

  -- ── 7) Kunde: sieht nichts ────────────────────────────────────
  PERFORM pg_temp.als('authenticated', u_kunde);
  SELECT count(*) INTO n FROM tours;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL 7a: Kunde sieht % Touren', n; END IF;
  SELECT count(*) INTO n FROM tour_stops;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL 7b: Kunde sieht % Stops', n; END IF;
  RAISE NOTICE 'PASS 7: Kunde sieht keine Touren/Stops';

  -- ── 8) anon: sieht nichts ─────────────────────────────────────
  PERFORM set_config('role', 'anon', true);
  PERFORM set_config('request.jwt.claims', '', true);
  SELECT count(*) INTO n FROM tours;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL 8: anon sieht % Touren', n; END IF;
  RAISE NOTICE 'PASS 8: anon sieht nichts';

  -- ── 9) Admin (Org A): sieht beide Org-A-Touren, nicht Org B ──
  PERFORM pg_temp.als_postgres();
  PERFORM pg_temp.als('authenticated', u_admin);
  SELECT count(*) INTO n FROM tours;
  IF n <> 2 THEN RAISE EXCEPTION 'FAIL 9a: Admin sieht % Touren statt 2 (org_fence?)', n; END IF;
  SELECT count(*) INTO n FROM tours WHERE id = t3;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL 9b: Admin sieht Fremd-Org-Tour!'; END IF;
  RAISE NOTICE 'PASS 9: Admin sieht Org-A-Touren, org_fence hält';

  -- ── 10) Admin: darf anlegen/ändern ────────────────────────────
  INSERT INTO tours (organization_id, caregiver_id, tour_date) VALUES (org_a, c2, '2026-08-11');
  UPDATE tours SET name = 'RLS-Test' WHERE id = t1;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL 10: Admin-Update griff nicht'; END IF;
  RAISE NOTICE 'PASS 10: Admin kann anlegen und ändern';

  -- ── 11) Admin mit Org-B-Kontext: sieht nur Org B ─────────────
  PERFORM pg_temp.als_postgres();
  PERFORM pg_temp.als('authenticated', u_admin, org_b);
  SELECT count(*) INTO n FROM tours;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL 11a: Admin@OrgB sieht % Touren statt 1', n; END IF;
  SELECT count(*) INTO n FROM tours WHERE id = t3;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL 11b: Admin@OrgB sieht die Org-B-Tour nicht'; END IF;
  RAISE NOTICE 'PASS 11: Mandantenwechsel respektiert org_fence';

  -- ── 12) Engel-E2E: Stop abschließen spiegelt Assignment ──────
  PERFORM pg_temp.als_postgres();
  INSERT INTO assignments (id, client_id, caregiver_id, assignment_date, start_time, end_time, service_type, status, organization_id, is_recurring)
    VALUES ('ffffffff-0000-4000-8000-000000000001', k1, c1, '2026-08-10', '08:00', '09:00', 'Alltagsbegleitung', 'GEPLANT', org_a, false);
  UPDATE tour_stops SET assignment_id = 'ffffffff-0000-4000-8000-000000000001' WHERE tour_id = t1;

  PERFORM pg_temp.als('authenticated', u_engel1);
  UPDATE tour_stops SET status = 'BEIM_KLIENTEN' WHERE tour_id = t1;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL 12a: Engel konnte eigenen Stop nicht fortschreiben'; END IF;

  PERFORM pg_temp.als_postgres();
  SELECT count(*) INTO n FROM assignments
   WHERE id = 'ffffffff-0000-4000-8000-000000000001' AND status = 'GESTARTET' AND actual_start_time IS NOT NULL;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL 12b: Assignment-Sync griff für Engel nicht (Policy-Kette kaputt)'; END IF;
  RAISE NOTICE 'PASS 12: Engel-Stop-Status spiegelt auf Assignment (INVOKER-Kette intakt)';

  -- ── 13) Missbrauch: Stop auf FREMDES Assignment zeigen lassen ─
  -- Der Sync-Trigger läuft als INVOKER — die assignments-RLS des
  -- Engels darf das fremde Assignment NICHT ändern (0 Zeilen).
  PERFORM pg_temp.als_postgres();
  INSERT INTO assignments (id, client_id, caregiver_id, assignment_date, start_time, end_time, service_type, status, organization_id, is_recurring)
    VALUES ('ffffffff-0000-4000-8000-000000000002', k1, c2, '2026-08-10', '12:00', '13:00', 'Alltagsbegleitung', 'GEPLANT', org_a, false);

  PERFORM pg_temp.als('authenticated', u_engel1);
  UPDATE tour_stops SET assignment_id = 'ffffffff-0000-4000-8000-000000000002', status = 'ABGESCHLOSSEN' WHERE tour_id = t1;

  PERFORM pg_temp.als_postgres();
  SELECT count(*) INTO n FROM assignments
   WHERE id = 'ffffffff-0000-4000-8000-000000000002' AND status = 'GEPLANT';
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL 13: Engel konnte über Stop-Sync ein FREMDES Assignment ändern!'; END IF;
  RAISE NOTICE 'PASS 13: Sync-Trigger kann keine fremden Assignments ändern';

  PERFORM pg_temp.als_postgres();
  RAISE NOTICE '── ALLE 13 RLS-/E2E-PRÜFUNGEN PASS ──';
END $$;

ROLLBACK;
