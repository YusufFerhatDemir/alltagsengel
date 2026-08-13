-- ════════════════════════════════════════════════════════════════════════════
-- Rollback zu 20260906000000_view_invoker_systemisch.sql
--
-- WARNUNG: Dieses Rollback stellt einen Zustand wieder her, in dem
-- Gesundheits- und Personaldaten OHNE Login ueber PostgREST lesbar waren.
-- Nur ausfuehren, wenn die Invoker-Umstellung nachweislich einen Admin-Pfad
-- bricht — und dann NUR fuer die betroffene einzelne View, nicht pauschal.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v record;
BEGIN
  FOR v IN
    SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind = 'v'
       AND c.relname <> 'state_settings_public'
  LOOP
    EXECUTE format('ALTER VIEW public.%I SET (security_invoker = false)', v.relname);
  END LOOP;
END $$;

-- Die anon-GRANTS werden BEWUSST NICHT wiederhergestellt.
-- Es gab keinen fachlichen Grund fuer sie; ihre Wiederherstellung waere die
-- Wiederherstellung des Datenlecks.
