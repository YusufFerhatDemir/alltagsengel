-- ═══════════════════════════════════════════════════════════════
-- DSGVO Hard-Delete: pg_cron Schedule
-- ═══════════════════════════════════════════════════════════════
--
-- Die Edge Function supabase/functions/account-hard-delete existiert
-- bereits. Dieser Schedule stellt sicher, dass sie täglich um 03:00
-- UTC aufgerufen wird.
--
-- Falls pg_cron nicht verfügbar ist, bleibt die Edge Function per
-- HTTP-Aufruf manuell aufrufbar — kein Ausfall, nur kein Automatismus.
-- ═══════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_project_ref text;
  v_service_key text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron nicht verfuegbar — Hard-Delete-Cron nicht eingeplant. Edge Function per HTTP aufrufbar.';
    RETURN;
  END IF;

  -- pg_net für HTTP-Aufrufe
  CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

  -- Bestehenden Job entfernen (idempotent)
  BEGIN
    PERFORM cron.unschedule('account-hard-delete-daily');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- Neuen Job einplanen: täglich 03:00 UTC
  -- Der HTTP-Aufruf geht an die eigene Edge Function.
  -- SUPABASE_URL und service_role_key kommen aus app.settings.
  PERFORM cron.schedule(
    'account-hard-delete-daily',
    '0 3 * * *',
    $$
    SELECT net.http_post(
      url := current_setting('app.settings.supabase_url', true) || '/functions/v1/account-hard-delete',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true),
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    );
    $$
  );

  RAISE NOTICE 'pg_cron Job "account-hard-delete-daily" eingeplant (03:00 UTC)';

EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron Scheduling fehlgeschlagen: % — Edge Function bleibt manuell aufrufbar', SQLERRM;
END;
$$;
