-- Rollback: engel_absences_insert ohne Status-Prüfung wiederherstellen
BEGIN;

DROP POLICY IF EXISTS engel_absences_insert ON absences;

CREATE POLICY engel_absences_insert ON absences
  FOR INSERT TO authenticated
  WITH CHECK (
    caregiver_id IN (
      SELECT cg.id FROM caregivers cg WHERE cg.user_id = auth.uid()
    )
  );

COMMIT;
