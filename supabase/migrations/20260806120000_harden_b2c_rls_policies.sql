-- =============================================================================
-- Migration: Harden B2C RLS Policies
-- Tabellen: chat_messages, messages, notifications
-- Zweck: Beziehungsbasierte RLS-Policies vollstaendig haerten (Option B)
-- Datum: 2026-08-06
-- PR: #34 (feature/org-fence-chat-messages-notifications)
-- =============================================================================
-- WICHTIG: Keine organization_id wird zu B2C-Tabellen hinzugefuegt.
--          Absicherung erfolgt ueber Benutzer- und Beziehungspruefungen.
-- =============================================================================

BEGIN;

-- ============================================================
-- 1. CHAT_MESSAGES — Fahrt-basierter Chat (Krankenfahrten)
-- ============================================================
-- Beziehungsquelle: ride_id -> krankenfahrten (customer_id, provider_id via krankenfahrt_providers)
-- Schreibpfade: INSERT nur Client-seitig (Fahrer + Kunde), DELETE nur via service_role (DSGVO)
-- Kein UPDATE im App-Code, kein Client-DELETE

-- 1a. Alte Policies entfernen
DROP POLICY IF EXISTS "Users can read their ride messages" ON chat_messages;
DROP POLICY IF EXISTS "Users can send messages to their rides" ON chat_messages;

-- 1b. SELECT: Nur authentifizierte Teilnehmer der Fahrt + Soft-Delete-Check
DROP POLICY IF EXISTS "chat_messages_select_ride_participant" ON chat_messages;
CREATE POLICY "chat_messages_select_ride_participant"
  ON chat_messages FOR SELECT
  TO authenticated
  USING (
    (NOT is_profile_soft_deleted(auth.uid()))
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

-- 1c. INSERT: sender_id = auth.uid() UND Fahrt-Teilnehmer-Check
DROP POLICY IF EXISTS "chat_messages_insert_ride_participant" ON chat_messages;
CREATE POLICY "chat_messages_insert_ride_participant"
  ON chat_messages FOR INSERT
  TO authenticated
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

-- 1d. UPDATE: Kein UPDATE im App-Code -> implizit gesperrt (keine Policy)
-- 1e. DELETE: Kein Client-DELETE -> implizit gesperrt (nur service_role via Edge Function)


-- ============================================================
-- 2. MESSAGES — Buchungs-basierter Chat (Engel <-> Kunde)
-- ============================================================
-- Beziehungsquelle: booking_id -> bookings (customer_id, angel_id)
-- Schreibpfade: INSERT Client-seitig (Engel + Kunde), UPDATE Client-seitig (nur read-Flag)
-- DELETE nur via service_role (DSGVO)
--
-- GEHAERTETE SCHWACHSTELLEN:
-- - INSERT hatte keine Buchungs-Validierung (beliebige booking_id/receiver_id moeglich)
-- - UPDATE hatte kein WITH CHECK (Empfaenger konnte jedes Feld aendern)

-- 2a. Alte Policies entfernen
DROP POLICY IF EXISTS "Users can view own messages" ON messages;
DROP POLICY IF EXISTS "Users can send messages" ON messages;
DROP POLICY IF EXISTS "Receiver can mark as read" ON messages;

-- 2b. SELECT: Nur Sender oder Empfaenger + Soft-Delete-Check
DROP POLICY IF EXISTS "messages_select_sender_or_receiver" ON messages;
CREATE POLICY "messages_select_sender_or_receiver"
  ON messages FOR SELECT
  TO authenticated
  USING (
    (auth.uid() = sender_id OR auth.uid() = receiver_id)
    AND (NOT is_profile_soft_deleted(auth.uid()))
  );

-- 2c. INSERT: sender_id = auth.uid() UND Buchungs-Validierung
--     Stellt sicher:
--     - Kein Sender-Spoofing (sender_id muss auth.uid() sein)
--     - Kein Receiver-Spoofing (receiver_id muss die Gegenseite der Buchung sein)
--     - Keine Fremd-Buchung (booking_id muss eine Buchung sein, an der der User beteiligt ist)
DROP POLICY IF EXISTS "messages_insert_booking_participant" ON messages;
CREATE POLICY "messages_insert_booking_participant"
  ON messages FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM bookings b
      WHERE b.id = messages.booking_id
      AND (
        -- Kunde sendet an Engel
        (b.customer_id = auth.uid() AND b.angel_id = messages.receiver_id)
        OR
        -- Engel sendet an Kunde
        (b.angel_id = auth.uid() AND b.customer_id = messages.receiver_id)
      )
    )
  );

-- 2d. UPDATE: Nur Empfaenger darf read-Flag setzen
--     USING: Nur der Empfaenger darf updaten
--     WITH CHECK: receiver_id darf nicht geaendert werden
DROP POLICY IF EXISTS "messages_update_receiver_read_only" ON messages;
CREATE POLICY "messages_update_receiver_read_only"
  ON messages FOR UPDATE
  TO authenticated
  USING (auth.uid() = receiver_id)
  WITH CHECK (auth.uid() = receiver_id);

-- 2e. Trigger: Verhindert Aenderung von unveraenderlichen Feldern bei UPDATE
--     Schuetzt: sender_id, receiver_id, booking_id, content
CREATE OR REPLACE FUNCTION prevent_messages_field_tampering()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF NEW.sender_id IS DISTINCT FROM OLD.sender_id THEN
    RAISE EXCEPTION 'sender_id darf nicht geaendert werden';
  END IF;
  IF NEW.receiver_id IS DISTINCT FROM OLD.receiver_id THEN
    RAISE EXCEPTION 'receiver_id darf nicht geaendert werden';
  END IF;
  IF NEW.booking_id IS DISTINCT FROM OLD.booking_id THEN
    RAISE EXCEPTION 'booking_id darf nicht geaendert werden';
  END IF;
  IF NEW.content IS DISTINCT FROM OLD.content THEN
    RAISE EXCEPTION 'content darf nicht geaendert werden';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_messages_tampering ON messages;
CREATE TRIGGER trg_prevent_messages_tampering
  BEFORE UPDATE ON messages
  FOR EACH ROW
  EXECUTE FUNCTION prevent_messages_field_tampering();

-- 2f. DELETE: Kein Client-DELETE -> implizit gesperrt (nur service_role via Edge Function)


-- ============================================================
-- 3. NOTIFICATIONS — Benutzer-basiert
-- ============================================================
-- Beziehungsquelle: user_id (direkt, kein Beziehungs-Join noetig)
-- Schreibpfade:
--   INSERT: Teils Client-seitig (user-scoped Server-Route /api/notify),
--           teils service_role (admin-registration, visitor-alert, referral)
--   UPDATE: Client-seitig (is_read), Server-seitig user-scoped (email_sent via /api/notify)
--   DELETE: Nur service_role (DSGVO Edge Function)
--
-- GEHAERTETE SCHWACHSTELLEN:
-- - UPDATE war zu offen (User konnte type, title, body, data, link aendern)
-- - SELECT/UPDATE hatten {public} statt {authenticated} als Rolle

-- 3a. Alte Policies entfernen
DROP POLICY IF EXISTS "Users can view own notifications" ON notifications;
DROP POLICY IF EXISTS "Users can insert own notifications" ON notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON notifications;

-- 3b. SELECT: Nur eigene + Soft-Delete-Check
DROP POLICY IF EXISTS "notifications_select_own" ON notifications;
CREATE POLICY "notifications_select_own"
  ON notifications FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    AND (NOT is_profile_soft_deleted(auth.uid()))
  );

-- 3c. INSERT: Nur eigene (noetig fuer /api/notify user-scoped Route)
DROP POLICY IF EXISTS "notifications_insert_own" ON notifications;
CREATE POLICY "notifications_insert_own"
  ON notifications FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 3d. UPDATE: Nur eigene, user_id unveraenderlich
DROP POLICY IF EXISTS "notifications_update_own" ON notifications;
CREATE POLICY "notifications_update_own"
  ON notifications FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 3e. Trigger: Verhindert Aenderung von unveraenderlichen Feldern bei UPDATE
--     Erlaubt nur: is_read, email_sent
--     Schuetzt: user_id, type, title, body, data, link
CREATE OR REPLACE FUNCTION prevent_notifications_field_tampering()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'user_id darf nicht geaendert werden';
  END IF;
  IF NEW.type IS DISTINCT FROM OLD.type THEN
    RAISE EXCEPTION 'type darf nicht geaendert werden';
  END IF;
  IF NEW.title IS DISTINCT FROM OLD.title THEN
    RAISE EXCEPTION 'title darf nicht geaendert werden';
  END IF;
  IF NEW.body IS DISTINCT FROM OLD.body THEN
    RAISE EXCEPTION 'body darf nicht geaendert werden';
  END IF;
  IF NEW.data IS DISTINCT FROM OLD.data THEN
    RAISE EXCEPTION 'data darf nicht geaendert werden';
  END IF;
  IF NEW.link IS DISTINCT FROM OLD.link THEN
    RAISE EXCEPTION 'link darf nicht geaendert werden';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_notifications_tampering ON notifications;
CREATE TRIGGER trg_prevent_notifications_tampering
  BEFORE UPDATE ON notifications
  FOR EACH ROW
  EXECUTE FUNCTION prevent_notifications_field_tampering();

-- 3f. DELETE: Kein Client-DELETE -> implizit gesperrt (nur service_role via Edge Function)


-- ============================================================
-- ZUSAMMENFASSUNG
-- ============================================================
-- chat_messages: 2 Policies (SELECT + INSERT), 0 Trigger
-- messages:      3 Policies (SELECT + INSERT + UPDATE), 1 Trigger
-- notifications: 3 Policies (SELECT + INSERT + UPDATE), 1 Trigger
-- Gesamt:        8 Policies, 2 Trigger
-- Vorher:        8 Policies, 0 Trigger
-- =============================================================================

COMMIT;
