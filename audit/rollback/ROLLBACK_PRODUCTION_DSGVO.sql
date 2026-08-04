-- ============================================================
-- ROLLBACK: DSGVO FK-Migration (PR #29 + PR #30)
-- Erstellt: 2026-08-04
-- BACKUP_PRE_ROLLOUT Timestamp: 2026-08-04T~UTC
--
-- Setzt alle 6 FK-Constraints auf den exakten Vorher-Zustand
-- (NO ACTION, default) zurück.
-- ============================================================

-- WICHTIG: Vor dem Rollback prüfen ob die Constraints existieren!

BEGIN;

-- ============================================================
-- 1. mis_auth_log_user_id_fkey (PR #29)
-- Vorher: FOREIGN KEY (user_id) REFERENCES auth.users(id)  [NO ACTION, NULLABLE]
-- ============================================================
ALTER TABLE public.mis_auth_log
  DROP CONSTRAINT IF EXISTS mis_auth_log_user_id_fkey;

ALTER TABLE public.mis_auth_log
  ADD CONSTRAINT mis_auth_log_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id);

-- ============================================================
-- 2. caregivers_user_id_fkey (PR #30)
-- Vorher: FOREIGN KEY (user_id) REFERENCES auth.users(id)  [NO ACTION, NULLABLE]
-- ============================================================
ALTER TABLE public.caregivers
  DROP CONSTRAINT IF EXISTS caregivers_user_id_fkey;

ALTER TABLE public.caregivers
  ADD CONSTRAINT caregivers_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id);

-- ============================================================
-- 3. clients_user_id_fkey (PR #30)
-- Vorher: FOREIGN KEY (user_id) REFERENCES auth.users(id)  [NO ACTION, NULLABLE]
-- ============================================================
ALTER TABLE public.clients
  DROP CONSTRAINT IF EXISTS clients_user_id_fkey;

ALTER TABLE public.clients
  ADD CONSTRAINT clients_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id);

-- ============================================================
-- 4. chat_messages_sender_id_fkey (PR #30)
-- Vorher: FOREIGN KEY (sender_id) REFERENCES auth.users(id)  [NO ACTION, NOT NULL]
-- ACHTUNG: sender_id war NOT NULL — muss zurückgesetzt werden!
-- ============================================================
ALTER TABLE public.chat_messages
  DROP CONSTRAINT IF EXISTS chat_messages_sender_id_fkey;

-- NOT NULL zurücksetzen (PR #30 hat es auf NULLABLE geändert)
ALTER TABLE public.chat_messages
  ALTER COLUMN sender_id SET NOT NULL;

ALTER TABLE public.chat_messages
  ADD CONSTRAINT chat_messages_sender_id_fkey
  FOREIGN KEY (sender_id) REFERENCES auth.users(id);

-- ============================================================
-- 5. app_settings_updated_by_fkey (PR #30)
-- Vorher: FOREIGN KEY (updated_by) REFERENCES auth.users(id)  [NO ACTION, NULLABLE]
-- ============================================================
ALTER TABLE public.app_settings
  DROP CONSTRAINT IF EXISTS app_settings_updated_by_fkey;

ALTER TABLE public.app_settings
  ADD CONSTRAINT app_settings_updated_by_fkey
  FOREIGN KEY (updated_by) REFERENCES auth.users(id);

-- ============================================================
-- 6. kf_pricing_audit_actor_id_fkey (PR #30)
-- Vorher: FOREIGN KEY (actor_id) REFERENCES auth.users(id)  [NO ACTION, NULLABLE]
-- ============================================================
ALTER TABLE public.kf_pricing_audit
  DROP CONSTRAINT IF EXISTS kf_pricing_audit_actor_id_fkey;

ALTER TABLE public.kf_pricing_audit
  ADD CONSTRAINT kf_pricing_audit_actor_id_fkey
  FOREIGN KEY (actor_id) REFERENCES auth.users(id);

COMMIT;

-- ============================================================
-- BACKUP-METADATEN (Vorher-Zustand 2026-08-04)
-- ============================================================
-- Zeilenanzahlen:
--   mis_auth_log:    229
--   caregivers:        2
--   clients:           4
--   chat_messages:     0
--   app_settings:      3
--   kf_pricing_audit:  0
--
-- RLS: Alle 6 Tabellen = true (aktiv)
--
-- FK delete_rule (alle 6): NO ACTION
-- Nullability:
--   mis_auth_log.user_id      = NULLABLE
--   caregivers.user_id        = NULLABLE
--   clients.user_id           = NULLABLE
--   chat_messages.sender_id   = NOT NULL  ← wichtig für Rollback!
--   app_settings.updated_by   = NULLABLE
--   kf_pricing_audit.actor_id = NULLABLE
-- ============================================================
