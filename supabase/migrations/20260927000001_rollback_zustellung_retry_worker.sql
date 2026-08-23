-- ═══════════════════════════════════════════════════════════════════════
-- Rollback zu 20260927000000_zustellung_retry_worker.sql
-- ═══════════════════════════════════════════════════════════════════════
--
-- ACHTUNG: Das Entfernen der Vorgangsspalten macht bereits protokollierte
-- Zustellungen dauerhaft unwiederholbar — der Bezug zum fachlichen
-- Datensatz ist danach weg und laesst sich aus der correlation_id (UUID
-- v5) nicht zurueckrechnen. Der Anwendungscode kommt damit klar (er
-- prueft die Spalten und verweigert den Lauf), die Information ist aber
-- verloren.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

DROP FUNCTION IF EXISTS public.zustellung_retry_abschliessen(uuid, integer, integer, integer, integer, integer, text);
DROP FUNCTION IF EXISTS public.zustellung_retry_heartbeat(uuid);
DROP FUNCTION IF EXISTS public.zustellung_retry_beanspruchen(integer);

DROP TABLE IF EXISTS public.zustellung_retry_laeufe;

DROP INDEX IF EXISTS public.idx_notification_delivery_log_dead_letter;
DROP INDEX IF EXISTS public.idx_notification_delivery_log_wiederholbar;

ALTER TABLE public.notification_delivery_log
  DROP CONSTRAINT IF EXISTS notification_delivery_log_grund_check;
ALTER TABLE public.notification_delivery_log
  DROP CONSTRAINT IF EXISTS notification_delivery_log_vorgang_art_check;

ALTER TABLE public.notification_delivery_log
  DROP COLUMN IF EXISTS grund,
  DROP COLUMN IF EXISTS vorgang_empfaenger,
  DROP COLUMN IF EXISTS vorgang_ref,
  DROP COLUMN IF EXISTS vorgang_art;

COMMIT;
