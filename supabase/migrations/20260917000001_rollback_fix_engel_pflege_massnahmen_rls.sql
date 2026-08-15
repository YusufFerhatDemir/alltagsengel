-- Rollback: engel_pflege_massnahmen_select auf alten (fehlerhaften) Stand
DROP POLICY IF EXISTS engel_pflege_massnahmen_select ON pflege_massnahmen;
CREATE POLICY engel_pflege_massnahmen_select ON pflege_massnahmen FOR SELECT
  USING (plan_id IN (
    SELECT mp.id FROM pflege_massnahmenplaene mp
    JOIN assignments a ON a.client_id = mp.client_id
    JOIN caregivers cg ON cg.id = a.caregiver_id
    WHERE cg.user_id = auth.uid() AND a.status IN ('active','GEPLANT','BESTAETIGT','UNTERWEGS','GESTARTET')
    AND mp.status IN ('aktiv','abgelaufen')
  ));
