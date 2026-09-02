-- ═══════════════════════════════════════════════════════════════════════════
-- Nachtrag: REVOKE fuer die drei neuen SECDEF-Triggerfunktionen
--
-- Die Migrationen rechnung_eingangsstatus und eingangsriegel_lauf_und_vpkzp
-- legten drei neue SECURITY-DEFINER-Triggerfunktionen an:
--   enforce_invoice_eingangsstatus()
--   enforce_lauf_eingangsstatus()
--   trg_vpkzp_usage_abgeleitet()
--
-- Durch die Postgres-Vorgabe (EXECUTE fuer PUBLIC bei jeder neuen Funktion)
-- waren sie fuer anon ausfuehrbar. secdef_trigger_revoke hatte das fuer die
-- damals bestehenden Funktionen bereinigt; diese drei kamen danach dazu.
--
-- Angewendet am 02.09.2026 via Supabase MCP.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  f record;
  anzahl integer := 0;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND p.prorettype = 'pg_catalog.trigger'::regtype
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', f.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', f.sig);
    anzahl := anzahl + 1;
  END LOOP;

  RAISE NOTICE 'SECDEF-Triggerfunktionen bereinigt: %', anzahl;
END $$;

DO $$
DECLARE
  rest integer;
BEGIN
  SELECT count(*) INTO rest
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prosecdef
    AND has_function_privilege('anon', p.oid, 'EXECUTE');

  IF rest > 0 THEN
    RAISE EXCEPTION
      'Nach dem REVOKE sind noch % SECURITY-DEFINER-Funktionen fuer anon ausfuehrbar.', rest;
  END IF;
END $$;
