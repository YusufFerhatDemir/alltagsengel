-- Rollback zu 20260923000000_notification_delivery_log.sql
BEGIN;
DROP FUNCTION IF EXISTS public.cleanup_notification_delivery_log();
DROP POLICY IF EXISTS org_fence_notification_delivery_log ON public.notification_delivery_log;
DROP POLICY IF EXISTS notification_delivery_log_admin ON public.notification_delivery_log;
DROP TABLE IF EXISTS public.notification_delivery_log;
COMMIT;
