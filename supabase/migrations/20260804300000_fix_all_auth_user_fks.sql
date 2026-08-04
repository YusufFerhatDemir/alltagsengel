-- ============================================================================
-- Migration: Alle blockierenden auth.users FKs auf ON DELETE SET NULL
-- Datum:     2026-08-04
-- Grund:     DSGVO Art. 17 — Benutzerlöschung wird durch NO ACTION FKs blockiert
-- Scope:     5 FKs (caregivers, clients, chat_messages, app_settings, kf_pricing_audit)
-- Hinweis:   mis_auth_log_user_id_fkey wird separat in PR #29 behandelt
-- Rollback:  audit/rollback/ROLLBACK_ALL_AUTH_USER_FKS.sql
-- ============================================================================

-- ──────────────────────────────────────────────────────────────────────
-- 1) caregivers.user_id → SET NULL
--    Begründung: Mitarbeiterdaten (Qualifikationen, Einsatzhistorie,
--    IK-Nummer) müssen für Betriebsfortführung und Abrechnungs-
--    nachweise erhalten bleiben. user_id ist bereits NULLABLE.
-- ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.caregivers DROP CONSTRAINT IF EXISTS caregivers_user_id_fkey;
ALTER TABLE public.caregivers
  ADD CONSTRAINT caregivers_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- ──────────────────────────────────────────────────────────────────────
-- 2) clients.user_id → SET NULL
--    Begründung: Kundendaten (Pflegegrad, Versicherung, Kundennummer,
--    medizinische Daten) unterliegen Aufbewahrungspflichten (§630f BGB,
--    HGB §257). Datensatz muss erhalten bleiben. user_id ist bereits
--    NULLABLE.
-- ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_user_id_fkey;
ALTER TABLE public.clients
  ADD CONSTRAINT clients_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- ──────────────────────────────────────────────────────────────────────
-- 3) chat_messages.sender_id → SET NULL
--    Begründung: Nachrichten gehören zu Fahrten (ride_id) und können
--    für Streitfälle/Dokumentation relevant sein. Sender wird anony-
--    misiert (NULL), Nachricht bleibt erhalten.
--    sender_id ist aktuell NOT NULL → muss erst NULLABLE werden.
-- ──────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='chat_messages'
    AND column_name='sender_id' AND is_nullable='NO'
  ) THEN
    ALTER TABLE public.chat_messages ALTER COLUMN sender_id DROP NOT NULL;
  END IF;
END $$;

ALTER TABLE public.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_sender_id_fkey;
ALTER TABLE public.chat_messages
  ADD CONSTRAINT chat_messages_sender_id_fkey
  FOREIGN KEY (sender_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- ──────────────────────────────────────────────────────────────────────
-- 4) app_settings.updated_by → SET NULL
--    Begründung: App-Konfiguration muss bestehen bleiben. "Wer hat
--    zuletzt geändert" ist nice-to-have, nicht geschäftskritisch.
--    updated_by ist bereits NULLABLE.
-- ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.app_settings DROP CONSTRAINT IF EXISTS app_settings_updated_by_fkey;
ALTER TABLE public.app_settings
  ADD CONSTRAINT app_settings_updated_by_fkey
  FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- ──────────────────────────────────────────────────────────────────────
-- 5) kf_pricing_audit.actor_id → SET NULL
--    Begründung: Preisänderungshistorie ist Audit-Trail und muss für
--    Compliance erhalten bleiben. Actor-Referenz kann anonymisiert
--    werden. actor_id ist bereits NULLABLE.
-- ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.kf_pricing_audit DROP CONSTRAINT IF EXISTS kf_pricing_audit_actor_id_fkey;
ALTER TABLE public.kf_pricing_audit
  ADD CONSTRAINT kf_pricing_audit_actor_id_fkey
  FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE SET NULL;
