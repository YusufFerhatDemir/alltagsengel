-- ═══════════════════════════════════════════════════════════════════════
-- Rollback zu 20260928000000_push_geraete_token.sql
-- ═══════════════════════════════════════════════════════════════════════
--
-- WAS NICHT ZURUECKGEDREHT WIRD UND WARUM
-- Die Dubletten in fcm_tokens, die die Vorwaertsmigration entfernt hat,
-- kommen nicht zurueck — sie waren Muell aus einem Upsert, dem der
-- passende Index fehlte. Ein Rollback, der sie wiederherstellt, gibt es
-- nicht und soll es nicht geben.
--
-- fcm_tokens.organization_id wird NICHT entfernt: sie ist die
-- Mandantengrenze. Faellt sie weg, waeren Geraete-Token wieder
-- org-blind, und Zeilen, die zwischenzeitlich mit ihr angelegt wurden,
-- verloeren ihre Zuordnung unwiederbringlich. Entfernt werden nur die
-- Policies und die neuen Constraints.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

DROP POLICY IF EXISTS fcm_tokens_admin_lesen ON public.fcm_tokens;
DROP POLICY IF EXISTS fcm_tokens_org_fence   ON public.fcm_tokens;

ALTER TABLE public.fcm_tokens
  DROP CONSTRAINT IF EXISTS fcm_tokens_platform_check;

DROP INDEX IF EXISTS public.fcm_tokens_user_token_uniq;
DROP INDEX IF EXISTS public.idx_fcm_tokens_org;
DROP INDEX IF EXISTS public.idx_fcm_tokens_user;

DROP TABLE IF EXISTS public.notification_preferences;

-- Provider-Katalog auf den Stand von 20260923000000 zuruecksetzen.
-- Zeilen mit provider='fcm' wuerden den alten CHECK verletzen; sie
-- werden vorher auf NULL gesetzt, damit das Rollback nicht am eigenen
-- Protokoll scheitert.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'notification_delivery_log'
  ) THEN
    UPDATE public.notification_delivery_log SET provider = NULL WHERE provider = 'fcm';
    ALTER TABLE public.notification_delivery_log
      DROP CONSTRAINT IF EXISTS notification_delivery_log_provider_check;
    ALTER TABLE public.notification_delivery_log
      ADD CONSTRAINT notification_delivery_log_provider_check
      CHECK (provider IS NULL OR provider IN
        ('resend', 'web_push', 'supabase', 'whatsapp_api'));
  END IF;
END $$;

COMMIT;
