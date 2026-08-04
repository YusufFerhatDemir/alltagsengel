-- ============================================================================
-- ROLLBACK: Alle auth.users FKs zurück auf ON DELETE NO ACTION
-- Datum:     2026-08-04
-- Zweck:     Macht die Migration 20260804300000_fix_all_auth_user_fks.sql rückgängig
-- ACHTUNG:   chat_messages.sender_id wird wieder NOT NULL gesetzt —
--            nur anwenden wenn keine NULL-Werte in sender_id existieren!
-- ============================================================================

-- 1) caregivers.user_id → NO ACTION
ALTER TABLE public.caregivers DROP CONSTRAINT IF EXISTS caregivers_user_id_fkey;
ALTER TABLE public.caregivers
  ADD CONSTRAINT caregivers_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE NO ACTION;

-- 2) clients.user_id → NO ACTION
ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_user_id_fkey;
ALTER TABLE public.clients
  ADD CONSTRAINT clients_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE NO ACTION;

-- 3) chat_messages.sender_id → NO ACTION + NOT NULL wiederherstellen
ALTER TABLE public.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_sender_id_fkey;
ALTER TABLE public.chat_messages
  ADD CONSTRAINT chat_messages_sender_id_fkey
  FOREIGN KEY (sender_id) REFERENCES auth.users(id) ON DELETE NO ACTION;

-- NOT NULL nur wiederherstellen wenn keine NULL-Werte existieren
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.chat_messages WHERE sender_id IS NULL LIMIT 1
  ) THEN
    ALTER TABLE public.chat_messages ALTER COLUMN sender_id SET NOT NULL;
  END IF;
END $$;

-- 4) app_settings.updated_by → NO ACTION
ALTER TABLE public.app_settings DROP CONSTRAINT IF EXISTS app_settings_updated_by_fkey;
ALTER TABLE public.app_settings
  ADD CONSTRAINT app_settings_updated_by_fkey
  FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE NO ACTION;

-- 5) kf_pricing_audit.actor_id → NO ACTION
ALTER TABLE public.kf_pricing_audit DROP CONSTRAINT IF EXISTS kf_pricing_audit_actor_id_fkey;
ALTER TABLE public.kf_pricing_audit
  ADD CONSTRAINT kf_pricing_audit_actor_id_fkey
  FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE NO ACTION;
