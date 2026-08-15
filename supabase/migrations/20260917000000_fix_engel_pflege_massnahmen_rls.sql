-- Fix: engel_pflege_massnahmen_select hat caregivers-Join-Falle
-- Der JOIN auf caregivers wird von caregivers' eigener RLS blockiert
-- und liefert still 0 Zeilen zurück. Ersetzen durch eigene_caregiver_ids().
-- Gleicher Fix wie in Commit 6b6dc33 für die anderen 8 Policies.
DROP POLICY IF EXISTS engel_pflege_massnahmen_select ON pflege_massnahmen;
CREATE POLICY engel_pflege_massnahmen_select ON pflege_massnahmen FOR SELECT
  USING (plan_id IN (
    SELECT mp.id FROM pflege_massnahmenplaene mp
    JOIN assignments a ON a.client_id = mp.client_id
    WHERE a.caregiver_id IN (SELECT eigene_caregiver_ids())
      AND a.status IN ('active','GEPLANT','BESTAETIGT','UNTERWEGS','GESTARTET')
      AND mp.status IN ('aktiv','abgelaufen')
  ));
