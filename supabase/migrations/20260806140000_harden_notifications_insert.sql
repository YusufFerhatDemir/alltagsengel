-- =============================================================================
-- Migration: Notifications INSERT-Policy haerten
-- Zweck: Client-seitige INSERTs komplett blockieren
-- Begründung: Alle Notification-Inserts laufen über service_role/Admin-Clients
--   in API-Routen (/api/bookings/notify, /api/bookings/respond,
--   /api/visitor-alert, /api/notify-admin-registration, /api/referral/complete,
--   /api/notify). Kein Frontend-Code fuehrt Client-INSERTs aus.
--   Die alte Policy erlaubte Self-INSERTs mit beliebigem type/title/body/link/data.
-- Datum: 2026-08-06
-- PR: #34 (feature/org-fence-chat-messages-notifications)
-- =============================================================================

BEGIN;

-- Alte INSERT-Policy entfernen
DROP POLICY IF EXISTS "notifications_insert_own" ON notifications;
DROP POLICY IF EXISTS "Users can insert own notifications" ON notifications;

-- Neue INSERT-Policy: Blockiert alle Client-Inserts
-- Service-Role/Admin-Clients umgehen RLS und sind nicht betroffen
CREATE POLICY "notifications_insert_blocked"
  ON notifications FOR INSERT
  TO authenticated
  WITH CHECK (false);

COMMIT;
