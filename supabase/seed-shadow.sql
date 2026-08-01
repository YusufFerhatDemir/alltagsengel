-- ════════════════════════════════════════════════════════════════════
-- SHADOW-DB TESTDATEN — Phase-3 Multi-Mandant / RLS-Isolationstest
-- ════════════════════════════════════════════════════════════════════
--
-- NUR FÜR EINE ISOLIERTE SHADOW-/TEST-DATENBANK. NIEMALS auf Produktion
-- ausführen — legt Test-Organisationen, Test-User (auth.users) und
-- fiktive Klientendaten an.
--
-- Voraussetzungen (siehe audit/SHADOW_DB_MIGRATION_REPORT.md):
--   • Alle 37 Migrationen aus supabase/migrations/ UND das Live-Schema
--     der ~31 admin-only Tabellen (clients, caregivers, service_records,
--     invoices, fahrzeuge, …), die NICHT in den Migrationen enthalten
--     sind. Ein reiner `supabase db reset` auf einer leeren DB reicht
--     NICHT — siehe Report Abschnitt "Kritischer Befund".
--   • pgcrypto-Extension (für crypt()/gen_salt() bei den Test-Usern).
--
-- Jeder Block ist defensiv: `IF EXISTS`-Checks gegen information_schema,
-- damit das Skript auch auf einer unvollständigen Shadow-DB möglichst
-- weit durchläuft und den Rest überspringt (RAISE NOTICE statt Fehler).
--
-- IDs sind FEST verdrahtet (nicht gen_random_uuid()), damit die Tests
-- in __tests__/shadow-db/tenant-isolation.test.ts sie referenzieren
-- können. Test-Präfixe: 'aaaaaaaa-' = Org Frankfurt, 'bbbbbbbb-' = Org
-- München — kollidieren nicht mit der echten Stamm-Org-UUID
-- (00000000-0000-4000-8000-000460629986).
-- ════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- 0) Helper: Tabelle existiert?
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION pg_temp.tbl_exists(t text) RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = t
  );
$$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION pg_temp.col_exists(t text, c text) RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = t AND column_name = c
  );
$$ LANGUAGE sql;

-- ─────────────────────────────────────────────────────────────────────
-- 1) Organisationen (Voraussetzung: 20260801_phase3_multi_mandant_saas.sql)
-- ─────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT pg_temp.tbl_exists('organizations') THEN
    RAISE EXCEPTION 'Tabelle organizations fehlt — Migration 20260801 zuerst anwenden. Abbruch.';
  END IF;

  INSERT INTO public.organizations (id, name, ik_nummer, address, bundesland, billing_plan, status, onboarding_step, settings)
  VALUES
    ('aaaaaaaa-0000-4000-8000-000000000001', 'Alltagsengel Frankfurt (Test)', '260123456',
     '{"strasse":"Teststraße 1", "plz":"60311", "ort":"Frankfurt am Main", "bundesland":"Hessen"}'::jsonb,
     'Hessen', 'pro', 'active', 4, '{}'::jsonb),
    ('bbbbbbbb-0000-4000-8000-000000000001', 'Alltagsengel München (Test)', '260987654',
     '{"strasse":"Teststraße 2", "plz":"80331", "ort":"München", "bundesland":"Bayern"}'::jsonb,
     'Bayern', 'starter', 'active', 4, '{}'::jsonb)
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

  INSERT INTO public.organization_subscriptions (organization_id, plan, status, features)
  VALUES
    ('aaaaaaaa-0000-4000-8000-000000000001', 'pro', 'active',
     '{"max_klienten": 150, "edifact": true, "ki_pruefung": true, "elnw": true, "api": false}'::jsonb),
    ('bbbbbbbb-0000-4000-8000-000000000001', 'starter', 'active',
     '{"max_klienten": 50, "edifact": true, "ki_pruefung": false, "elnw": false, "api": false}'::jsonb)
  ON CONFLICT (organization_id) DO UPDATE SET plan = EXCLUDED.plan;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- 2) Test-User (auth.users + profiles + organization_members)
--    Je Org: 1 Admin (Org-Rolle 'owner'), 1 Alltagsbegleiter (profiles.role
--    'engel'), 1 Fahrer (profiles.role 'engel', per Service-Tag unterschieden
--    — es gibt kein eigenes profiles.role='fahrer', siehe initial-setup.sql).
--    Passwort für alle Test-User: 'ShadowTest123!' (NUR Shadow-DB!)
-- ─────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  test_users jsonb := '[
    {"id":"aaaaaaaa-0001-4000-8000-000000000001","org":"aaaaaaaa-0000-4000-8000-000000000001","org_role":"owner","email":"admin.ffm@shadow-test.invalid","role":"admin","first":"Admina","last":"Frankfurt"},
    {"id":"aaaaaaaa-0001-4000-8000-000000000002","org":"aaaaaaaa-0000-4000-8000-000000000001","org_role":"staff","email":"begleiter.ffm@shadow-test.invalid","role":"engel","first":"Begleiter","last":"Frankfurt"},
    {"id":"aaaaaaaa-0001-4000-8000-000000000003","org":"aaaaaaaa-0000-4000-8000-000000000001","org_role":"staff","email":"fahrer.ffm@shadow-test.invalid","role":"engel","first":"Fahrer","last":"Frankfurt"},
    {"id":"bbbbbbbb-0001-4000-8000-000000000001","org":"bbbbbbbb-0000-4000-8000-000000000001","org_role":"owner","email":"admin.muc@shadow-test.invalid","role":"admin","first":"Admina","last":"München"},
    {"id":"bbbbbbbb-0001-4000-8000-000000000002","org":"bbbbbbbb-0000-4000-8000-000000000001","org_role":"staff","email":"begleiter.muc@shadow-test.invalid","role":"engel","first":"Begleiter","last":"München"},
    {"id":"bbbbbbbb-0001-4000-8000-000000000003","org":"bbbbbbbb-0000-4000-8000-000000000001","org_role":"staff","email":"fahrer.muc@shadow-test.invalid","role":"engel","first":"Fahrer","last":"München"}
  ]'::jsonb;
  u jsonb;
BEGIN
  IF NOT pg_temp.tbl_exists('profiles') THEN
    RAISE EXCEPTION 'Tabelle profiles fehlt — initial-setup.sql zuerst anwenden. Abbruch.';
  END IF;

  FOR u IN SELECT * FROM jsonb_array_elements(test_users) LOOP
    -- auth.users: nur einfügen, wenn auth-Schema beschreibbar ist
    -- (auf Supabase-Branches/Docker-Local der Fall, NICHT über die REST-API).
    BEGIN
      INSERT INTO auth.users (
        id, instance_id, aud, role, email, encrypted_password,
        email_confirmed_at, created_at, updated_at,
        raw_app_meta_data, raw_user_meta_data
      )
      VALUES (
        (u->>'id')::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        u->>'email', crypt('ShadowTest123!', gen_salt('bf')),
        now(), now(), now(),
        jsonb_build_object('org_id', u->>'org'),
        jsonb_build_object('first_name', u->>'first', 'last_name', u->>'last')
      )
      ON CONFLICT (id) DO NOTHING;
    EXCEPTION WHEN insufficient_privilege OR undefined_table THEN
      RAISE NOTICE 'auth.users nicht beschreibbar (erwartet über REST-API/Pooler) — Test-User % übersprungen, Seed nutzt dann service_role-Pfad', u->>'email';
    END;

    INSERT INTO public.profiles (id, role, first_name, last_name, email)
    VALUES ((u->>'id')::uuid, u->>'role', u->>'first', u->>'last', u->>'email')
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;

    IF pg_temp.tbl_exists('organization_members') THEN
      INSERT INTO public.organization_members (organization_id, user_id, role)
      VALUES ((u->>'org')::uuid, (u->>'id')::uuid, u->>'org_role')
      ON CONFLICT (organization_id, user_id) DO UPDATE SET role = EXCLUDED.role;
    END IF;
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- 3) Klienten mit Pflegegrad (Tabelle 'clients' — NUR live in Supabase,
--    nicht in den Migrationen enthalten, siehe Report).
-- ─────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT pg_temp.tbl_exists('clients') THEN
    RAISE NOTICE 'Tabelle clients existiert nicht in dieser Shadow-DB — Klienten/Verordnungen/Einsätze/Rechnungen übersprungen.';
    RETURN;
  END IF;

  INSERT INTO public.clients (
    id, first_name, last_name, date_of_birth, care_level, address, city, zip_code,
    insurance_name, insurance_number, versichertennummer, pflegekasse_name, pflegekasse_ik,
    organization_id
  ) VALUES
    ('aaaaaaaa-0002-4000-8000-000000000001', 'Klient', 'Frankfurt-Eins', '1945-03-12', 2,
     'Musterweg 1', 'Frankfurt am Main', '60311', 'AOK Hessen', 'A123456789', 'A123456789',
     'AOK Hessen', '308012345', 'aaaaaaaa-0000-4000-8000-000000000001'),
    ('aaaaaaaa-0002-4000-8000-000000000002', 'Klient', 'Frankfurt-Zwei', '1938-07-24', 3,
     'Musterweg 2', 'Frankfurt am Main', '60313', 'Barmer', 'B987654321', 'B987654321',
     'Barmer', '108012345', 'aaaaaaaa-0000-4000-8000-000000000001'),
    ('bbbbbbbb-0002-4000-8000-000000000001', 'Klient', 'München-Eins', '1950-11-02', 1,
     'Beispielallee 1', 'München', '80331', 'TK', 'T123456789', 'T123456789',
     'TK', '101575519', 'bbbbbbbb-0000-4000-8000-000000000001')
  ON CONFLICT (id) DO UPDATE SET organization_id = EXCLUDED.organization_id;

  -- Verordnungen + Genehmigungen
  IF pg_temp.tbl_exists('verordnungen') THEN
    INSERT INTO public.verordnungen (
      id, client_id, verordnung_type, ausstellungsdatum, arzt_name,
      genehmigung_status, genehmigung_datum, genehmigung_bis, organization_id
    ) VALUES
      ('aaaaaaaa-0003-4000-8000-000000000001', 'aaaaaaaa-0002-4000-8000-000000000001',
       'entlastung_45b', '2026-01-15', 'Dr. Test Ffm', 'genehmigt', '2026-02-01', '2027-01-31',
       'aaaaaaaa-0000-4000-8000-000000000001'),
      ('bbbbbbbb-0003-4000-8000-000000000001', 'bbbbbbbb-0002-4000-8000-000000000001',
       'verhinderung_39', '2026-02-01', 'Dr. Test Muc', 'beantragt', NULL, NULL,
       'bbbbbbbb-0000-4000-8000-000000000001')
    ON CONFLICT (id) DO UPDATE SET organization_id = EXCLUDED.organization_id;
  END IF;

  -- Einsätze / Leistungsnachweise (echte Tabelle: service_records — der
  -- Auftrag sprach von 'service_visits', diese Tabelle existiert nicht,
  -- siehe Report Abschnitt "Namensabweichung").
  IF pg_temp.tbl_exists('service_records') THEN
    INSERT INTO public.service_records (
      id, client_id, date, start_time, end_time, duration_minutes,
      service_type, budget_type, amount, status, organization_id
    ) VALUES
      ('aaaaaaaa-0004-4000-8000-000000000001', 'aaaaaaaa-0002-4000-8000-000000000001',
       '2026-07-10', '09:00', '10:00', 60, 'haushaltshilfe', 'entlastung', 30.00, 'signed',
       'aaaaaaaa-0000-4000-8000-000000000001'),
      ('bbbbbbbb-0004-4000-8000-000000000001', 'bbbbbbbb-0002-4000-8000-000000000001',
       '2026-07-11', '14:00', '15:30', 90, 'betreuung', 'entlastung', 45.00, 'complete',
       'bbbbbbbb-0000-4000-8000-000000000001')
    ON CONFLICT (id) DO UPDATE SET organization_id = EXCLUDED.organization_id;
  END IF;

  -- Abrechnungsdatensätze
  IF pg_temp.tbl_exists('invoices') THEN
    INSERT INTO public.invoices (id, client_id, status, organization_id)
    SELECT 'aaaaaaaa-0005-4000-8000-000000000001', 'aaaaaaaa-0002-4000-8000-000000000001',
           'draft', 'aaaaaaaa-0000-4000-8000-000000000001'
    WHERE pg_temp.col_exists('invoices', 'client_id') AND pg_temp.col_exists('invoices', 'status')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.invoices (id, client_id, status, organization_id)
    SELECT 'bbbbbbbb-0005-4000-8000-000000000001', 'bbbbbbbb-0002-4000-8000-000000000001',
           'draft', 'bbbbbbbb-0000-4000-8000-000000000001'
    WHERE pg_temp.col_exists('invoices', 'client_id') AND pg_temp.col_exists('invoices', 'status')
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- 4) Fahrzeuge (Tabelle 'fahrzeuge' — ebenfalls nur live vorhanden)
-- ─────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT pg_temp.tbl_exists('fahrzeuge') THEN
    RAISE NOTICE 'Tabelle fahrzeuge existiert nicht in dieser Shadow-DB — übersprungen.';
    RETURN;
  END IF;

  INSERT INTO public.fahrzeuge (id, kennzeichen, organization_id)
  SELECT 'aaaaaaaa-0006-4000-8000-000000000001', 'F-AE 1001', 'aaaaaaaa-0000-4000-8000-000000000001'
  WHERE pg_temp.col_exists('fahrzeuge', 'kennzeichen')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.fahrzeuge (id, kennzeichen, organization_id)
  SELECT 'bbbbbbbb-0006-4000-8000-000000000001', 'M-AE 2001', 'bbbbbbbb-0000-4000-8000-000000000001'
  WHERE pg_temp.col_exists('fahrzeuge', 'kennzeichen')
  ON CONFLICT (id) DO NOTHING;

  RAISE NOTICE 'Hinweis: Eine dedizierte "Touren"-Tabelle existiert weder live noch in den Migrationen — nicht geseedet, siehe Report.';
END $$;

DROP FUNCTION IF EXISTS pg_temp.tbl_exists(text);
DROP FUNCTION IF EXISTS pg_temp.col_exists(text, text);

COMMIT;

-- ════════════════════════════════════════════════════════════════════
-- VERIFIKATION NACH SEED:
--   select organization_id, count(*) from public.clients
--     where organization_id in (
--       'aaaaaaaa-0000-4000-8000-000000000001',
--       'bbbbbbbb-0000-4000-8000-000000000001')
--     group by organization_id;                        -- 2 und 1
--   select id, email from auth.users where email like '%@shadow-test.invalid';
-- ════════════════════════════════════════════════════════════════════
