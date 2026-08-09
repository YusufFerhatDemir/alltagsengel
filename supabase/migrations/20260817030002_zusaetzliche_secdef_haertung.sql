-- ════════════════════════════════════════════════════════════════════════════
-- Migration: Zusätzliche Härtung — kassenabrechnung_erlaubt und
--            bundesland_fuer_plz: EXECUTE für anon entziehen.
-- Datum:     2026-08-09
-- Branch:    staging/expansion-abnahme
--
-- BEFUND (live gemessen gegen nnwyktkqibdjxgimjyuq am 09.08.2026)
--
--   Beide Funktionen sind SECURITY DEFINER und waren für anon aufrufbar.
--   Keine der beiden wird in RLS-Policies referenziert.
--
--   kassenabrechnung_erlaubt(uuid, text):
--     Prüft ob Kassenabrechnung für eine Organisation erlaubt ist.
--     SECURITY DEFINER mit Mandanten-ID als Parameter — anon könnte
--     Abrechnungsstatus beliebiger Organisationen abfragen.
--
--   bundesland_fuer_plz(text):
--     PLZ-Lookup, gibt Bundesland zurück. Öffentliche Referenzdaten,
--     aber als SECURITY DEFINER unnötig privilegiert für anon.
--     eindeutiges_bundesland_fuer_plz(text) existiert als INVOKER-Alternative.
--
-- FIX: REVOKE für anon, GRANT für authenticated + service_role.
-- Idempotent. Auf Production am 09.08.2026 bereits live angewendet.
-- ════════════════════════════════════════════════════════════════════════════

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
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', sig);
    n := n + 1;
    RAISE NOTICE 'abgesichert: %', sig;
  END LOOP;

  IF n = 0 THEN
    RAISE EXCEPTION 'Keine der zwei Zielfunktionen gefunden — Abbruch.';
  END IF;
  RAISE NOTICE '% Funktion(en) abgesichert', n;
END $$;

-- Rollback: GRANT EXECUTE ON FUNCTION kassenabrechnung_erlaubt(uuid,text) TO anon;
--           GRANT EXECUTE ON FUNCTION bundesland_fuer_plz(text) TO anon;
