-- ══════════════════════════════════════════════════════════════════════
-- 70_coach_freigaben_tests.sql — Datenfreigabe (coach_shares) end-to-end
-- ══════════════════════════════════════════════════════════════════════
-- Prüft die beiden Funktionen aus 20260916000000_coach_shares_email_
-- funktionen.sql GEMEINSAM mit den RLS-Regeln aus 20260819010000: Freigabe
-- erstellen → anzeigen → widerrufen → Zugriff danach wirklich blockiert →
-- Audit-Spur. Genau die Kette, die die Oberfläche
-- /pflegecoach/einstellungen/freigaben abbildet.
--
-- Aufruf (Shadow-DB muss vorher stehen: ./scripts/shadow-db.sh reset):
--   psql -h 127.0.0.1 -p 55432 -U postgres -d shadow -f supabase/shadow/70_coach_freigaben_tests.sql
--
-- Läuft in einer Transaktion und endet mit ROLLBACK — hinterlässt keine
-- Daten. Berührt NIE ein Supabase-Projekt.
-- ══════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP on
\pset pager off

BEGIN;

-- ── Fixtures: zwei Konten ────────────────────────────────────────────
INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-4111-8111-111111111111', 'owner@smoke.test'),
  ('22222222-2222-4222-8222-222222222222', 'empfaenger@smoke.test')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, email, role) VALUES
  ('11111111-1111-4111-8111-111111111111', 'Owner@Smoke.Test', 'kunde'),
  ('22222222-2222-4222-8222-222222222222', 'empfaenger@smoke.test', 'kunde')
ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;

INSERT INTO public.coach_users (id, user_id, rolle) VALUES
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'pflegebeduerftig'),
  ('aaaaaaaa-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', 'angehoerig')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.coach_consents (coach_user_id, consent_typ, text_version, erteilt)
VALUES ('aaaaaaaa-0000-4000-8000-000000000001', 'datenfreigabe', 'v1', true);

-- Eine Datenzeile des Owners, an der die Freigabewirkung messbar ist
INSERT INTO public.coach_assessments (coach_user_id, assessment_typ, erhoben_am)
VALUES ('aaaaaaaa-0000-4000-8000-000000000001', 'erstassessment', current_date);

-- ── Rollenwechsel-Helfer ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION pg_temp.als(p_uid uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
END $$;

CREATE OR REPLACE FUNCTION pg_temp.pruefe(p_name text, p_ist anyelement, p_soll anyelement) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF p_ist IS NOT DISTINCT FROM p_soll THEN
    RAISE NOTICE 'PASS  %  (= %)', p_name, p_ist;
  ELSE
    RAISE EXCEPTION 'FAIL  %  ist=% soll=%', p_name, p_ist, p_soll;
  END IF;
END $$;

-- ══ TEST 1: E-Mail-Lookup (Groß/Kleinschreibung egal) ════════════════
SELECT pg_temp.als('11111111-1111-4111-8111-111111111111');
SELECT pg_temp.pruefe('1a Lookup findet Empfänger (case-insensitiv)',
  coach_finde_nutzer_id('EMPFAENGER@Smoke.Test'), '22222222-2222-4222-8222-222222222222'::uuid);
SELECT pg_temp.pruefe('1b Lookup ohne Konto → NULL',
  coach_finde_nutzer_id('gibtsnicht@smoke.test'), NULL::uuid);

-- ══ TEST 2: Freigabe erstellen ═══════════════════════════════════════
INSERT INTO public.coach_shares (owner_coach_user_id, grantee_user_id, empfaenger_rolle)
VALUES ('aaaaaaaa-0000-4000-8000-000000000001', coach_finde_nutzer_id('empfaenger@smoke.test'), 'angehoerig');
SELECT pg_temp.pruefe('2  Freigabe angelegt', (SELECT count(*)::int FROM public.coach_shares), 1);

-- ══ TEST 3: Freigabe anzeigen (RPC der Migration) ════════════════════
SELECT pg_temp.pruefe('3a Liste zeigt genau 1 Zeile', (SELECT count(*)::int FROM coach_freigaben_liste()), 1);
SELECT pg_temp.pruefe('3b Liste zeigt E-Mail des Empfängers',
  (SELECT empfaenger_email FROM coach_freigaben_liste()), 'empfaenger@smoke.test');
SELECT pg_temp.pruefe('3c Liste zeigt Rolle',
  (SELECT empfaenger_rolle FROM coach_freigaben_liste()), 'angehoerig');
SELECT pg_temp.pruefe('3d Liste noch nicht widerrufen',
  (SELECT widerrufen_am FROM coach_freigaben_liste()), NULL::timestamptz);

-- Fremde Sicht: Empfänger darf NICHT die Freigabenliste des Owners sehen
SELECT pg_temp.als('22222222-2222-4222-8222-222222222222');
SELECT pg_temp.pruefe('3e Empfänger sieht KEINE fremde Freigabenliste',
  (SELECT count(*)::int FROM coach_freigaben_liste()), 0);

-- ══ TEST 4: Zugriffswirkung VOR Widerruf ═════════════════════════════
SELECT pg_temp.pruefe('4  Empfänger sieht freigegebene Assessments',
  (SELECT count(*)::int FROM public.coach_assessments), 1);

-- ══ TEST 5: Widerruf ═════════════════════════════════════════════════
SELECT pg_temp.als('11111111-1111-4111-8111-111111111111');
UPDATE public.coach_shares SET widerrufen_am = now()
WHERE owner_coach_user_id = 'aaaaaaaa-0000-4000-8000-000000000001';
SELECT pg_temp.pruefe('5a Liste zeigt Widerruf-Zeitpunkt',
  (SELECT widerrufen_am IS NOT NULL FROM coach_freigaben_liste()), true);
SELECT pg_temp.pruefe('5b widerrufene Zeile bleibt sichtbar (Historie)',
  (SELECT count(*)::int FROM coach_freigaben_liste()), 1);

-- ══ TEST 6: Zugriff NACH Widerruf tatsächlich blockiert ══════════════
SELECT pg_temp.als('22222222-2222-4222-8222-222222222222');
SELECT pg_temp.pruefe('6a Assessments nach Widerruf blockiert',
  (SELECT count(*)::int FROM public.coach_assessments), 0);
SELECT pg_temp.pruefe('6b Goals nach Widerruf blockiert',
  (SELECT count(*)::int FROM public.coach_goals), 0);
SELECT pg_temp.pruefe('6c Measurements nach Widerruf blockiert',
  (SELECT count(*)::int FROM public.coach_measurements), 0);

-- ══ TEST 7: Audit-Log ════════════════════════════════════════════════
RESET ROLE;
SELECT pg_temp.pruefe('7a Audit: INSERT der Freigabe protokolliert',
  (SELECT count(*)::int FROM public.coach_audit_log WHERE tabelle='coach_shares' AND aktion='INSERT'), 1);
SELECT pg_temp.pruefe('7b Audit: Widerruf (UPDATE) protokolliert',
  (SELECT count(*)::int FROM public.coach_audit_log WHERE tabelle='coach_shares' AND aktion='UPDATE'), 1);
SELECT pg_temp.pruefe('7c Audit: geänderte Felder beim Widerruf erfasst',
  (SELECT 'widerrufen_am' = ANY(geaenderte_felder) FROM public.coach_audit_log
    WHERE tabelle='coach_shares' AND aktion='UPDATE' LIMIT 1), true);

-- ══ TEST 8: Rechte-Härtung der neuen Funktionen ══════════════════════
SELECT pg_temp.pruefe('8a anon darf coach_finde_nutzer_id NICHT ausführen',
  has_function_privilege('anon', 'public.coach_finde_nutzer_id(text)', 'EXECUTE'), false);
SELECT pg_temp.pruefe('8b anon darf coach_freigaben_liste NICHT ausführen',
  has_function_privilege('anon', 'public.coach_freigaben_liste()', 'EXECUTE'), false);
SELECT pg_temp.pruefe('8c authenticated DARF coach_finde_nutzer_id ausführen',
  has_function_privilege('authenticated', 'public.coach_finde_nutzer_id(text)', 'EXECUTE'), true);
SELECT pg_temp.pruefe('8d authenticated DARF coach_freigaben_liste ausführen',
  has_function_privilege('authenticated', 'public.coach_freigaben_liste()', 'EXECUTE'), true);
SELECT pg_temp.pruefe('8e beide Funktionen sind SECURITY DEFINER mit fixem search_path',
  (SELECT bool_and(prosecdef AND proconfig::text LIKE '%search_path%') FROM pg_proc p
     JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN ('coach_finde_nutzer_id','coach_freigaben_liste')), true);

-- ══ TEST 9: Reaktivierung (Weg der API-Route) ════════════════════════
SELECT pg_temp.als('11111111-1111-4111-8111-111111111111');
UPDATE public.coach_shares SET widerrufen_am = NULL, erstellt_am = now()
WHERE owner_coach_user_id = 'aaaaaaaa-0000-4000-8000-000000000001';
SELECT pg_temp.als('22222222-2222-4222-8222-222222222222');
SELECT pg_temp.pruefe('9  Zugriff nach Reaktivierung wieder möglich',
  (SELECT count(*)::int FROM public.coach_assessments), 1);

RESET ROLE;
ROLLBACK;
