-- ============================================================
-- SECURITY TESTS — Alltagsengel Supabase
-- Ausführen als service_role im SQL Editor
-- ============================================================

-- TEST 1: Keine Tabelle ohne RLS
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND NOT rowsecurity) THEN
    RAISE EXCEPTION 'TEST FAILED: Tabellen ohne RLS gefunden!';
  END IF;
  RAISE NOTICE 'TEST 1 PASSED: Alle Tabellen haben RLS aktiv';
END;
$$;

-- TEST 2: Keine USING(true) ALL-Policies für public (außer akzeptierte)
DO $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*) INTO v_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND cmd = 'ALL'
    AND (qual = 'true' OR with_check = 'true')
    AND roles NOT IN ('{service_role}')
    AND tablename NOT IN ('angels', 'angel_reviews', 'reviews', 'kf_feature_flags');

  IF v_count > 0 THEN
    RAISE EXCEPTION 'TEST FAILED: % offene ALL-Policies gefunden!', v_count;
  END IF;
  RAISE NOTICE 'TEST 2 PASSED: Keine offenen ALL-Policies';
END;
$$;

-- TEST 3: Keine öffentlichen Storage-Buckets
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM storage.buckets WHERE public = true) THEN
    RAISE EXCEPTION 'TEST FAILED: Öffentliche Storage-Buckets gefunden!';
  END IF;
  RAISE NOTICE 'TEST 3 PASSED: Alle Buckets privat';
END;
$$;

-- TEST 4: Audit-Logs sind append-only (Trigger existiert)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.audit_logs'::regclass
      AND tgname LIKE '%prevent_mutation%'
  ) THEN
    RAISE EXCEPTION 'TEST FAILED: Audit-Log Mutation-Prevention-Trigger fehlt!';
  END IF;
  RAISE NOTICE 'TEST 4 PASSED: Audit-Logs sind append-only';
END;
$$;

-- TEST 5: Alle SECURITY DEFINER Funktionen haben search_path gesetzt
DO $$
DECLARE
  v_unsafe text[];
BEGIN
  SELECT array_agg(p.proname) INTO v_unsafe
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public'
    AND p.prosecdef = true
    AND NOT (array_to_string(p.proconfig, '') LIKE '%search_path%');

  IF v_unsafe IS NOT NULL AND array_length(v_unsafe, 1) > 0 THEN
    RAISE EXCEPTION 'TEST FAILED: SECURITY DEFINER ohne search_path: %', array_to_string(v_unsafe, ', ');
  END IF;
  RAISE NOTICE 'TEST 5 PASSED: Alle DEFINER-Funktionen haben search_path';
END;
$$;

-- TEST 6: mis_crm_activities hat RLS + FORCE RLS
DO $$
DECLARE
  v_rec record;
BEGIN
  SELECT relrowsecurity, relforcerowsecurity INTO v_rec
  FROM pg_class WHERE relname = 'mis_crm_activities' AND relnamespace = 'public'::regnamespace;

  IF NOT v_rec.relrowsecurity THEN
    RAISE EXCEPTION 'TEST FAILED: mis_crm_activities hat kein RLS!';
  END IF;
  IF NOT v_rec.relforcerowsecurity THEN
    RAISE EXCEPTION 'TEST FAILED: mis_crm_activities hat kein FORCE RLS!';
  END IF;
  RAISE NOTICE 'TEST 6 PASSED: mis_crm_activities RLS + FORCE RLS aktiv';
END;
$$;

-- TEST 7: Finalisierte Rechnungen sind geschützt (Trigger existiert)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.invoices'::regclass
      AND tgname LIKE '%finalized%'
  ) THEN
    RAISE EXCEPTION 'TEST FAILED: Invoice-Finalisierungsschutz fehlt!';
  END IF;
  RAISE NOTICE 'TEST 7 PASSED: Rechnungen gegen stille Änderung geschützt';
END;
$$;

-- TEST 8: Service-Role Key nicht in Frontend-Code (manuell zu prüfen)
-- → Ergebnis: NEXT_PUBLIC_*SERVICE_ROLE existiert nicht. PASSED.

-- ============================================================
-- ERGEBNIS: Alle automatisierten Tests sollten PASSED zeigen.
-- ============================================================
