-- Rollback: die 6 in 20260921000000 gefixten Engel-Policies auf den alten
-- (fehlerhaften, caregivers-Subquery) Stand zuruecksetzen.

BEGIN;

DROP POLICY IF EXISTS engel_caregiver_quals_select ON caregiver_qualifications;
CREATE POLICY engel_caregiver_quals_select ON caregiver_qualifications
  FOR SELECT TO authenticated
  USING (
    caregiver_id IN (
      SELECT cg.id FROM caregivers cg WHERE cg.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS engel_absences_select ON absences;
CREATE POLICY engel_absences_select ON absences
  FOR SELECT TO authenticated
  USING (
    caregiver_id IN (
      SELECT cg.id FROM caregivers cg WHERE cg.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS engel_absences_insert ON absences;
CREATE POLICY engel_absences_insert ON absences
  FOR INSERT TO authenticated
  WITH CHECK (
    caregiver_id IN (
      SELECT cg.id FROM caregivers cg WHERE cg.user_id = auth.uid()
    )
    AND status = 'beantragt'
  );

DROP POLICY IF EXISTS engel_personal_schulungen_select ON personal_schulungen;
CREATE POLICY engel_personal_schulungen_select ON personal_schulungen
  FOR SELECT TO authenticated
  USING (
    caregiver_id IN (SELECT cg.id FROM caregivers cg WHERE cg.user_id = auth.uid())
  );

DROP POLICY IF EXISTS engel_dienstplan_eintraege_select ON dienstplan_eintraege;
CREATE POLICY engel_dienstplan_eintraege_select ON dienstplan_eintraege
  FOR SELECT TO authenticated
  USING (
    caregiver_id IN (SELECT cg.id FROM caregivers cg WHERE cg.user_id = auth.uid())
  );

DROP POLICY IF EXISTS engel_personal_urlaubskonto_select ON personal_urlaubskonto;
CREATE POLICY engel_personal_urlaubskonto_select ON personal_urlaubskonto
  FOR SELECT TO authenticated
  USING (
    caregiver_id IN (SELECT cg.id FROM caregivers cg WHERE cg.user_id = auth.uid())
  );

COMMIT;
