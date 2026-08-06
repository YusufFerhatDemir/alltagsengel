-- =============================================================================
-- ROLLBACK: Harden B2C RLS Policies
-- Stellt den urspruenglichen Zustand vor 20260806120000 wieder her
-- NUR MANUELL ANWENDEN BEI ROLLBACK-BEDARF
-- =============================================================================

BEGIN;

-- ============================================================
-- 1. CHAT_MESSAGES — Trigger entfernen (keine vorhanden), Policies zuruecksetzen
-- ============================================================

DROP POLICY IF EXISTS "chat_messages_select_ride_participant" ON chat_messages;
DROP POLICY IF EXISTS "chat_messages_insert_ride_participant" ON chat_messages;

-- Originale Policies wiederherstellen
CREATE POLICY "Users can read their ride messages"
  ON chat_messages FOR SELECT
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM krankenfahrten k
      WHERE k.id = chat_messages.ride_id
      AND (
        k.customer_id = auth.uid()
        OR k.provider_id IN (
          SELECT kp.id FROM krankenfahrt_providers kp
          WHERE kp.user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "Users can send messages to their rides"
  ON chat_messages FOR INSERT
  TO public
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM krankenfahrten k
      WHERE k.id = chat_messages.ride_id
      AND (
        k.customer_id = auth.uid()
        OR k.provider_id IN (
          SELECT kp.id FROM krankenfahrt_providers kp
          WHERE kp.user_id = auth.uid()
        )
      )
    )
  );


-- ============================================================
-- 2. MESSAGES — Trigger + Policies zuruecksetzen
-- ============================================================

DROP TRIGGER IF EXISTS trg_prevent_messages_tampering ON messages;
DROP FUNCTION IF EXISTS prevent_messages_field_tampering();

DROP POLICY IF EXISTS "messages_select_sender_or_receiver" ON messages;
DROP POLICY IF EXISTS "messages_insert_booking_participant" ON messages;
DROP POLICY IF EXISTS "messages_update_receiver_read_only" ON messages;

-- Originale Policies wiederherstellen
CREATE POLICY "Users can view own messages"
  ON messages FOR SELECT
  TO public
  USING (
    (auth.uid() = sender_id OR auth.uid() = receiver_id)
    AND (NOT is_profile_soft_deleted(auth.uid()))
  );

CREATE POLICY "Users can send messages"
  ON messages FOR INSERT
  TO public
  WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "Receiver can mark as read"
  ON messages FOR UPDATE
  TO public
  USING (auth.uid() = receiver_id);


-- ============================================================
-- 3. NOTIFICATIONS — Trigger + Policies zuruecksetzen
-- ============================================================

DROP TRIGGER IF EXISTS trg_prevent_notifications_tampering ON notifications;
DROP FUNCTION IF EXISTS prevent_notifications_field_tampering();

DROP POLICY IF EXISTS "notifications_select_own" ON notifications;
DROP POLICY IF EXISTS "notifications_insert_own" ON notifications;
DROP POLICY IF EXISTS "notifications_update_own" ON notifications;

-- Originale Policies wiederherstellen
CREATE POLICY "Users can view own notifications"
  ON notifications FOR SELECT
  TO public
  USING (
    auth.uid() = user_id
    AND (NOT is_profile_soft_deleted(auth.uid()))
  );

CREATE POLICY "Users can insert own notifications"
  ON notifications FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications"
  ON notifications FOR UPDATE
  TO public
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

COMMIT;
