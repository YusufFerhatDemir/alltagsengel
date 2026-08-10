-- ════════════════════════════════════════════════════════════════════════════
-- Rollback: 20260817030002_zusaetzliche_secdef_haertung
--
-- Stellt den Zustand VOR der Härtung wieder her:
--   - GRANT EXECUTE auf kassenabrechnung_erlaubt(uuid, text) für anon + PUBLIC
--   - GRANT EXECUTE auf bundesland_fuer_plz(text) für anon + PUBLIC
--
-- Die Forward-Migration hatte REVOKE ALL für anon/PUBLIC ausgeführt und
-- EXECUTE nur an authenticated + service_role vergeben.
-- Dieser Rollback gibt anon und PUBLIC die EXECUTE-Rechte zurück.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
DECLARE
  sig text;
  n   integer := 0;
BEGIN
  FOR sig IN
    SELECT p.oid::regprocedure::text
    FROM pg_proc p
    JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
    WHERE nsp.nspname = 'public'
      AND p.proname IN ('kassenabrechnung_erlaubt', 'bundesland_fuer_plz')
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO PUBLIC', sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon', sig);
    n := n + 1;
    RAISE NOTICE 'rollback — EXECUTE restored: %', sig;
  END LOOP;

  IF n = 0 THEN
    RAISE WARNING 'Keine der zwei Zielfunktionen gefunden — nichts zu tun.';
  ELSE
    RAISE NOTICE '% Funktion(en) rollback abgeschlossen', n;
  END IF;
END $$;

COMMIT;
