-- ════════════════════════════════════════════════════════════════════
-- ROLLBACK zu 20260829081149_loeschkette_toter_pg_cron_takt.sql
-- ════════════════════════════════════════════════════════════════════
--
-- Stellt den Zustand VOR der Migration wieder her: die Diagnosefunktion
-- verschwindet, und der pg_cron-Job wird wieder eingeplant — mit genau
-- demselben Befehl wie in 20260918020000, also weiterhin mit der
-- NULL-URL, solange `app.settings.supabase_url` nicht gesetzt ist.
--
-- Das ist ausdrücklich KEINE Wiederherstellung eines funktionierenden
-- Taktes, sondern die Rücknahme einer Aufräumung. Der Takt läuft über
-- vercel.json → /api/cron/konto-loeschung, mit und ohne diesen Job.
-- ════════════════════════════════════════════════════════════════════

BEGIN;

DROP FUNCTION IF EXISTS public.loeschkette_takt_diagnose();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'account-hard-delete-daily') THEN
    RETURN;
  END IF;

  PERFORM cron.schedule(
    'account-hard-delete-daily',
    '0 3 * * *',
    $CMD$
    SELECT net.http_post(
      url := current_setting('app.settings.supabase_url', true) || '/functions/v1/account-hard-delete',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true),
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    );
    $CMD$
  );
END $$;

COMMIT;
