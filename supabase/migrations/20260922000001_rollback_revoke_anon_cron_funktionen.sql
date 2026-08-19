-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK zu 20260922000000_revoke_anon_cron_funktionen.sql
--
-- ACHTUNG: Stellt bewusst den unsicheren Zustand wieder her —
--   * cron_check_ueberfaellige_aufgaben() wird wieder fuer anon aufrufbar
--     (schreibender Pfad ohne Anmeldung, Security-Audit 2026-08-19 MITTEL-5)
--   * coach_finde_nutzer_id(text) wird wieder zum Mitgliedschafts-Orakel
--     fuer jeden angemeldeten Nutzer (NIEDRIG-7)
-- Nur ausfuehren, wenn ein konkreter Aufrufer nachweislich haengt.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
DECLARE
  sig text;
BEGIN
  FOR sig IN
    SELECT p.oid::regprocedure::text
    FROM pg_proc p
    JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
    WHERE nsp.nspname = 'public'
      AND p.proname = 'cron_check_ueberfaellige_aufgaben'
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO PUBLIC', sig);
  END LOOP;

  FOR sig IN
    SELECT p.oid::regprocedure::text
    FROM pg_proc p
    JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
    WHERE nsp.nspname = 'public'
      AND p.proname = 'coach_finde_nutzer_id'
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', sig);
  END LOOP;
END $$;

COMMIT;
