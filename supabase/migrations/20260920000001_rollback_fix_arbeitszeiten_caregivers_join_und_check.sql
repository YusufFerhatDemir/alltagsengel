-- Rollback: personal_arbeitszeiten/personal_zeitkorrekturen auf alten
-- (fehlerhaften) Stand mit caregivers-Join-Falle sowie ohne CHECK-Constraints.

ALTER TABLE public.personal_arbeitszeiten
  DROP CONSTRAINT IF EXISTS personal_arbeitszeiten_pause_minuten_check;
ALTER TABLE public.personal_arbeitszeiten
  DROP CONSTRAINT IF EXISTS personal_arbeitszeiten_ist_minuten_check;

DROP POLICY IF EXISTS engel_personal_zeitkorrekturen_select ON public.personal_zeitkorrekturen;
CREATE POLICY engel_personal_zeitkorrekturen_select ON public.personal_zeitkorrekturen
  FOR SELECT TO authenticated
  USING (
    caregiver_id IN (SELECT cg.id FROM caregivers cg WHERE cg.user_id = auth.uid())
  );

DROP POLICY IF EXISTS engel_personal_arbeitszeiten_insert ON public.personal_arbeitszeiten;
CREATE POLICY engel_personal_arbeitszeiten_insert ON public.personal_arbeitszeiten
  FOR INSERT TO authenticated
  WITH CHECK (
    caregiver_id IN (SELECT cg.id FROM caregivers cg WHERE cg.user_id = auth.uid())
  );

DROP POLICY IF EXISTS engel_personal_arbeitszeiten_select ON public.personal_arbeitszeiten;
CREATE POLICY engel_personal_arbeitszeiten_select ON public.personal_arbeitszeiten
  FOR SELECT TO authenticated
  USING (
    caregiver_id IN (SELECT cg.id FROM caregivers cg WHERE cg.user_id = auth.uid())
  );
