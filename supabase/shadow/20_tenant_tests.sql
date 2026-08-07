-- ════════════════════════════════════════════════════════════════════
-- SHADOW-TESTS: Mandantentrennung, CRUD, RLS, Storage
-- ════════════════════════════════════════════════════════════════════
--
-- Setzt 00_supabase_bootstrap.sql + alle Migrationen + 10_seed_two_orgs.sql
-- voraus. Läuft NUR gegen eine Shadow-DB (./scripts/shadow-db.sh).
--
-- Wie getestet wird: `SET LOCAL ROLE authenticated` + `SET LOCAL
-- request.jwt.claims` bilden exakt nach, was PostgREST bei einem echten
-- Request tut. Als Superuser (postgres) würde RLS umgangen — dann wären
-- alle Tests wertlos falsch-grün.
--
-- Jeder Test schreibt eine Zeile in shadow_test_results. Am Ende steht
-- die Auswertung; bei mindestens einem FAIL bricht das Skript ab.
-- ════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on
\set ORG_A '''aaaaaaaa-0000-4000-8000-000000000001'''
\set ORG_B '''bbbbbbbb-0000-4000-8000-000000000002'''
\set ADMIN_A '''a0000000-0000-4000-8000-0000000000a1'''
\set ADMIN_B '''b0000000-0000-4000-8000-0000000000b1'''
\set FREMD '''f0000000-0000-4000-8000-0000000000f1'''

CREATE TEMP TABLE shadow_test_results (
  nr       serial,
  bereich  text,
  test     text,
  erwartet text,
  gemessen text,
  status   text
);

-- SECURITY DEFINER: die Testfunktion läuft auch, wenn wir per SET ROLE
-- gerade als anon/authenticated unterwegs sind — diese Rollen haben auf
-- der Ergebnistabelle sonst kein INSERT-Recht.
CREATE OR REPLACE FUNCTION pg_temp.check_test(
  p_bereich text, p_test text, p_erwartet anyelement, p_gemessen anyelement
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO shadow_test_results (bereich, test, erwartet, gemessen, status)
  VALUES (p_bereich, p_test, p_erwartet::text, p_gemessen::text,
          CASE WHEN p_erwartet::text IS NOT DISTINCT FROM p_gemessen::text
               THEN 'PASS' ELSE 'FAIL' END);
END $$;

-- Zählt Zeilen, fängt aber Rechtefehler ab. Nötig, weil anon auf
-- is_admin() bewusst kein EXECUTE hat (20260502): eine SELECT-Policy,
-- die is_admin() aufruft, wirft für anon "permission denied for function"
-- statt leer zurückzugeben. Beides ist eine Verweigerung — der Test soll
-- an dieser Stelle nicht abbrechen, sondern sie als solche protokollieren.
CREATE OR REPLACE FUNCTION pg_temp.zaehle(p_sql text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
  EXECUTE p_sql INTO n;
  RETURN n::text;
EXCEPTION WHEN insufficient_privilege THEN
  RETURN 'verweigert';
END $$;

-- Hilfsfunktion: als bestimmter User agieren
CREATE OR REPLACE FUNCTION pg_temp.als_user(p_uid text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
END $$;


-- ════════════════════════════════════════════════════════════════════
-- 1) SELECT — sieht Admin A nur Org-A-Daten?
-- ════════════════════════════════════════════════════════════════════
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_temp.als_user(:ADMIN_A);

SELECT pg_temp.check_test('SELECT', 'current_org_id() für Admin A',
       :ORG_A::uuid, public.current_org_id());

SELECT pg_temp.check_test('SELECT', 'Admin A sieht 2 clients (nur Org A)',
       2::bigint, (SELECT count(*) FROM public.clients));

SELECT pg_temp.check_test('SELECT', 'Admin A sieht 0 Org-B-clients',
       0::bigint, (SELECT count(*) FROM public.clients WHERE organization_id = :ORG_B::uuid));

SELECT pg_temp.check_test('SELECT', 'Admin A sieht 1 service_record',
       1::bigint, (SELECT count(*) FROM public.service_records));

SELECT pg_temp.check_test('SELECT', 'Admin A sieht 1 invoice',
       1::bigint, (SELECT count(*) FROM public.invoices));

SELECT pg_temp.check_test('SELECT', 'Direktzugriff auf Org-B-Klient per ID',
       0::bigint, (SELECT count(*) FROM public.clients
                   WHERE id = 'c1b00000-0000-4000-8000-000000000003'));
COMMIT;

-- ── Gegenprobe Admin B ───────────────────────────────────────────────
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_temp.als_user(:ADMIN_B);

SELECT pg_temp.check_test('SELECT', 'current_org_id() für Admin B',
       :ORG_B::uuid, public.current_org_id());

SELECT pg_temp.check_test('SELECT', 'Admin B sieht 1 client (nur Org B)',
       1::bigint, (SELECT count(*) FROM public.clients));
COMMIT;


-- ════════════════════════════════════════════════════════════════════
-- 2) INSERT — Fence muss WITH CHECK durchsetzen
-- ════════════════════════════════════════════════════════════════════
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_temp.als_user(:ADMIN_A);

-- 2a) INSERT ohne organization_id → Default current_org_id() = Org A
INSERT INTO public.clients (customer_number, first_name, last_name)
VALUES ('A-9001', 'Neu', 'OhneOrg');

SELECT pg_temp.check_test('INSERT', 'INSERT ohne org_id landet in Org A',
       :ORG_A::uuid, (SELECT organization_id FROM public.clients
                      WHERE customer_number = 'A-9001'));

-- 2b) INSERT mit fremder organization_id → muss scheitern
DO $$
DECLARE ok boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.clients (customer_number, first_name, last_name, organization_id)
    VALUES ('X-9002', 'Fremd', 'Einschmuggeln',
            'bbbbbbbb-0000-4000-8000-000000000002');
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    ok := true;
  END;
  PERFORM pg_temp.check_test('INSERT',
    'INSERT mit fremder org_id wird blockiert', true, ok);
END $$;
-- COMMIT statt ROLLBACK: shadow_test_results ist eine TEMP-Tabelle und
-- damit transaktional — ein ROLLBACK würde die Testergebnisse dieses
-- Blocks mit verwerfen. Die hier entstehenden Testzeilen bleiben in der
-- Shadow-DB; `./scripts/shadow-db.sh reset` räumt sie wieder weg.
COMMIT;


-- ════════════════════════════════════════════════════════════════════
-- 3) UPDATE / DELETE — dürfen fremde Zeilen nicht treffen
-- ════════════════════════════════════════════════════════════════════
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_temp.als_user(:ADMIN_A);

WITH upd AS (
  UPDATE public.clients SET last_name = 'Gekapert'
  WHERE id = 'c1b00000-0000-4000-8000-000000000003'
  RETURNING 1
)
SELECT pg_temp.check_test('UPDATE', 'UPDATE auf Org-B-Klient trifft 0 Zeilen',
       0::bigint, (SELECT count(*) FROM upd));

WITH del AS (
  DELETE FROM public.clients
  WHERE id = 'c1b00000-0000-4000-8000-000000000003'
  RETURNING 1
)
SELECT pg_temp.check_test('DELETE', 'DELETE auf Org-B-Klient trifft 0 Zeilen',
       0::bigint, (SELECT count(*) FROM del));

-- Eigene Zeile darf dagegen geändert werden
WITH upd2 AS (
  UPDATE public.clients SET last_name = 'GeaendertA'
  WHERE id = 'c1a00000-0000-4000-8000-000000000001'
  RETURNING 1
)
SELECT pg_temp.check_test('UPDATE', 'UPDATE auf eigenen Klienten trifft 1 Zeile',
       1::bigint, (SELECT count(*) FROM upd2));

-- 3c) Org-Umhängen der eigenen Zeile nach Org B → muss scheitern
DO $$
DECLARE ok boolean := false;
BEGIN
  BEGIN
    UPDATE public.clients
       SET organization_id = 'bbbbbbbb-0000-4000-8000-000000000002'
     WHERE id = 'c1a00000-0000-4000-8000-000000000001';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    ok := true;
  END;
  PERFORM pg_temp.check_test('UPDATE',
    'Umhängen der eigenen Zeile nach Org B wird blockiert', true, ok);
END $$;
COMMIT;


-- ════════════════════════════════════════════════════════════════════
-- 4) Rollen — Kunde, anonym, Nicht-Mitglied
-- ════════════════════════════════════════════════════════════════════
BEGIN;
SET LOCAL ROLE anon;
SELECT pg_temp.als_user('00000000-0000-0000-0000-000000000000');

-- Geprueft wird das ERGEBNIS, nicht der Mechanismus: anon darf keine Zeile
-- sehen. Wie das zustande kommt, hat sich geaendert und darf sich aendern:
--   bis 20260804210000  → 'verweigert' (anon fehlte EXECUTE auf is_admin(),
--                          die Policy-Auswertung brach ab)
--   seit 20260804210000 → '0' (anon darf is_admin() aufrufen, bekommt false,
--                          die Policy filtert sauber alles weg)
-- Beides ist dicht. Die alte Erwartung 'verweigert' liess den Test seit dem
-- 04.08. rot laufen, ohne dass etwas undicht war. Rot werden muss er, sobald
-- anon auch nur EINE Zeile sieht.
SELECT pg_temp.check_test('ROLLE', 'anon bekommt keine clients',
       TRUE, pg_temp.zaehle('SELECT count(*) FROM public.clients') IN ('0', 'verweigert'));
SELECT pg_temp.check_test('ROLLE', 'anon bekommt keine service_records',
       TRUE, pg_temp.zaehle('SELECT count(*) FROM public.service_records') IN ('0', 'verweigert'));
SELECT pg_temp.check_test('ROLLE', 'anon bekommt keine invoices',
       TRUE, pg_temp.zaehle('SELECT count(*) FROM public.invoices') IN ('0', 'verweigert'));
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_temp.als_user(:ADMIN_A);
-- Kunde A (role='kunde', kein is_admin) — nur der eigene Klient
SELECT pg_temp.als_user('a0000000-0000-4000-8000-0000000000a2');
SELECT pg_temp.check_test('ROLLE', 'Kunde A ohne Adminrechte sieht 0 clients',
       '0', pg_temp.zaehle('SELECT count(*) FROM public.clients'));
COMMIT;

-- Nicht-Mitglied: current_org_id() fällt auf die Stamm-Organisation zurück.
-- Dieser Test dokumentiert das Verhalten — er ist bewusst KEIN PASS/FAIL
-- über "richtig oder falsch", sondern hält den Ist-Zustand fest.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_temp.als_user(:FREMD);
SELECT pg_temp.check_test('FALLBACK',
       'User ohne Mitgliedschaft -> Stamm-Org (fail-open, siehe Report T-1)',
       '00000000-0000-4000-8000-000460629986'::uuid, public.current_org_id());
COMMIT;


-- ════════════════════════════════════════════════════════════════════
-- 5) Storage
-- ════════════════════════════════════════════════════════════════════
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_temp.als_user(:ADMIN_A);

-- storage.buckets hat RLS an und im Repo keine Policy → auch die
-- Bucket-Liste ist für authenticated leer.
SELECT pg_temp.check_test('STORAGE', 'Admin A sieht 0 Buckets (keine Policy im Repo)',
       0::bigint, (SELECT count(*) FROM storage.buckets));

-- storage.objects hat RLS an, aber im Repo keine einzige Policy →
-- niemand sieht etwas. Sicherer Default, aber die App käme so an keine
-- Datei. Siehe Report Gap G-6.
SELECT pg_temp.check_test('STORAGE', 'Admin A sieht 0 Objekte (keine Policy im Repo)',
       0::bigint, (SELECT count(*) FROM storage.objects));
COMMIT;

-- Service-Role umgeht RLS — muss beide Objekte sehen
BEGIN;
SET LOCAL ROLE service_role;
SELECT pg_temp.check_test('STORAGE', 'Bucket shadow-documents ist privat',
       false, (SELECT public FROM storage.buckets WHERE id = 'shadow-documents'));
SELECT pg_temp.check_test('STORAGE', 'service_role sieht beide Objekte',
       2::bigint, (SELECT count(*) FROM storage.objects));
-- 4 = 3 aus dem Seed + 1 aus Test 9 (INSERT ohne org_id), der bewusst
-- nicht zurückgerollt wird.
SELECT pg_temp.check_test('SERVICE_ROLE', 'service_role sieht ALLE clients beider Orgs (RLS-Bypass)',
       4::bigint, (SELECT count(*) FROM public.clients));
COMMIT;


-- ════════════════════════════════════════════════════════════════════
-- 6) Strukturprüfungen
-- ════════════════════════════════════════════════════════════════════
-- Untergrenze statt Momentaufnahme: jede neue mandantengebundene Tabelle
-- bringt eine weitere org_fence-Policy mit. Eine feste Zahl (frueher 65)
-- macht den Test bei jeder Erweiterung rot, ohne dass etwas kaputt waere.
-- Was hier zaehlt: es duerfen nie WENIGER werden.
SELECT pg_temp.check_test('STRUKTUR', 'org_fence-Policies vorhanden (>= 65)',
       TRUE, (SELECT count(*) >= 65 FROM pg_policies
              WHERE schemaname='public' AND policyname LIKE '%\_org\_fence'));

SELECT pg_temp.check_test('STRUKTUR', 'alle org_fence sind RESTRICTIVE',
       0::bigint, (SELECT count(*) FROM pg_policies
                   WHERE schemaname='public' AND policyname LIKE '%\_org\_fence'
                     AND permissive <> 'RESTRICTIVE'));

SELECT pg_temp.check_test('STRUKTUR', 'Tabellen mit organization_id ohne RLS',
       0::bigint, (SELECT count(*) FROM information_schema.columns c
                   JOIN pg_class pc ON pc.relname = c.table_name
                   JOIN pg_namespace n ON n.oid = pc.relnamespace AND n.nspname='public'
                   WHERE c.table_schema='public' AND c.column_name='organization_id'
                     AND pc.relkind='r' AND NOT pc.relrowsecurity));

SELECT pg_temp.check_test('STRUKTUR', 'public-Tabellen ohne RLS',
       0::bigint, (SELECT count(*) FROM pg_class c
                   JOIN pg_namespace n ON n.oid=c.relnamespace
                   WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity));


-- ════════════════════════════════════════════════════════════════════
-- Auswertung
-- ════════════════════════════════════════════════════════════════════
\echo ''
\echo '── Ergebnis ─────────────────────────────────────────────────────'
SELECT nr, bereich, test, erwartet, gemessen, status
FROM shadow_test_results ORDER BY nr;

SELECT status, count(*) FROM shadow_test_results GROUP BY status ORDER BY status;

DO $$
DECLARE f integer;
BEGIN
  SELECT count(*) INTO f FROM shadow_test_results WHERE status = 'FAIL';
  IF f > 0 THEN
    RAISE EXCEPTION '% Test(s) fehlgeschlagen', f;
  END IF;
  RAISE NOTICE 'Alle Tenant-Tests bestanden.';
END $$;
