-- =============================================================================
-- Rollback: Notifications INSERT-Policy Haertung rueckgaengig machen
-- Stellt die alte Policy "notifications_insert_own" wieder her
-- =============================================================================

BEGIN;

DROP POLICY IF EXISTS "notifications_insert_blocked" ON notifications;

CREATE POLICY "notifications_insert_own"
  ON notifications FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

COMMIT;
