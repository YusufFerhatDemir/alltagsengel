-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK zu 20260817010000_sql_exec_rpc_absichern.sql
--
-- WARNUNG — dieser Rollback stellt eine SICHERHEITSLUECKE WIEDER HER.
-- Er existiert nur, damit die Migration die Rollback-Konvention des Repos
-- erfuellt. Es gibt keinen fachlichen Grund, ihn auszufuehren: kein
-- Anwendungscode ruft public._run_sql oder public._sql_parts auf
-- (geprueft ueber app/**, lib/**, scripts/** — 0 Treffer).
--
-- Nach dem Rollback kann jeder Besitzer des oeffentlichen anon-Keys wieder
-- beliebiges SQL mit den Rechten der Rolle `anon` gegen die Produktions-
-- datenbank absetzen.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
DECLARE
  sig text;
BEGIN
  FOR sig IN
    SELECT p.oid::regprocedure::text
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = '_run_sql'
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated', sig);
  END LOOP;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = '_sql_parts' AND c.relkind = 'r'
  ) THEN
    EXECUTE 'ALTER TABLE public._sql_parts DISABLE ROW LEVEL SECURITY';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public._sql_parts TO anon, authenticated';
  END IF;
END $$;

COMMIT;
