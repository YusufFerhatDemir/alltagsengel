-- Rollback zu 20261021000002_secdef_trigger_revoke.sql
--
-- ACHTUNG: dieses Rollback stellt die VORGABE von Postgres wieder her —
-- EXECUTE fuer PUBLIC. Es macht die Funktionen damit wieder fuer anon
-- ausfuehrbar und laesst verify:perimeter N2 erneut rot werden.
--
-- Es gibt praktisch keinen Grund, das zu wollen. Die Datei existiert nur,
-- damit zu jeder Migration eine Umkehrung liegt (Regel aus
-- docs/MIGRATION_LEDGER.md). Wer sie einspielt, sollte wissen, warum.
--
-- `authenticated` und `anon` bekommen ihr Recht NICHT einzeln zurueck:
-- sie hatten es ueber PUBLIC, nicht als eigene Zuweisung.

DO $$
DECLARE
  f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND p.prorettype = 'pg_catalog.trigger'::regtype
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO PUBLIC', f.sig);
  END LOOP;
END $$;
