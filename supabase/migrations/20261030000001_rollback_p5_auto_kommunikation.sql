-- Rollback: P5 Auto-Kommunikation
DROP FUNCTION IF EXISTS public.safe_link_clients_user_id(uuid);
ALTER TABLE public.profiles DROP COLUMN IF EXISTS welcome_email_sent_at;
