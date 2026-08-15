-- ═══════════════════════════════════════════════════════════════
-- Fix 12 verbleibende RLS-Policies: caregivers-JOIN durch
-- eigene_caregiver_ids() / engel_hat_aktiven_klienten() ersetzen
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. akten_dokumente: engel_akten_dokumente_select ───
DROP POLICY IF EXISTS engel_akten_dokumente_select ON public.akten_dokumente;
CREATE POLICY engel_akten_dokumente_select ON public.akten_dokumente
  FOR SELECT
  USING (
    (sichtbarkeit = ANY (ARRAY['engel'::text, 'alle'::text]))
    AND deleted_at IS NULL
    AND caregiver_id IN (SELECT public.eigene_caregiver_ids())
  );

-- ─── 2. akten_vertraege: engel_akten_vertraege_select ───
DROP POLICY IF EXISTS engel_akten_vertraege_select ON public.akten_vertraege;
CREATE POLICY engel_akten_vertraege_select ON public.akten_vertraege
  FOR SELECT
  USING (
    deleted_at IS NULL
    AND caregiver_id IN (SELECT public.eigene_caregiver_ids())
  );

-- ─── 3. care_notes: care_notes_caregiver_read ───
DROP POLICY IF EXISTS care_notes_caregiver_read ON public.care_notes;
CREATE POLICY care_notes_caregiver_read ON public.care_notes
  FOR SELECT
  USING (
    author_id = auth.uid()
    OR (
      is_internal = false
      AND client_id IS NOT NULL
      AND public.engel_hat_aktiven_klienten(client_id)
    )
  );

-- ─── 4. ops_aufgaben: ops_aufgaben_engel_select ───
DROP POLICY IF EXISTS ops_aufgaben_engel_select ON public.ops_aufgaben;
CREATE POLICY ops_aufgaben_engel_select ON public.ops_aufgaben
  FOR SELECT
  USING (
    verantwortlich_id = auth.uid()
    OR stellvertreter_id = auth.uid()
    OR erstellt_von = auth.uid()
    OR caregiver_id IN (SELECT public.eigene_caregiver_ids())
  );

-- ─── 5. pflege_anamnesen: engel_pflege_anamnesen_select ───
DROP POLICY IF EXISTS engel_pflege_anamnesen_select ON public.pflege_anamnesen;
CREATE POLICY engel_pflege_anamnesen_select ON public.pflege_anamnesen
  FOR SELECT TO authenticated
  USING (
    client_id IS NOT NULL
    AND public.engel_hat_aktiven_klienten(client_id)
  );

-- ─── 6. pflege_aufnahmen: engel_pflege_aufnahmen_select ───
DROP POLICY IF EXISTS engel_pflege_aufnahmen_select ON public.pflege_aufnahmen;
CREATE POLICY engel_pflege_aufnahmen_select ON public.pflege_aufnahmen
  FOR SELECT TO authenticated
  USING (
    client_id IS NOT NULL
    AND public.engel_hat_aktiven_klienten(client_id)
  );

-- ─── 7. pflege_diagnosen: engel_pflege_diagnosen_select ───
DROP POLICY IF EXISTS engel_pflege_diagnosen_select ON public.pflege_diagnosen;
CREATE POLICY engel_pflege_diagnosen_select ON public.pflege_diagnosen
  FOR SELECT TO authenticated
  USING (
    betreuungsrelevant = true
    AND aktiv = true
    AND client_id IS NOT NULL
    AND public.engel_hat_aktiven_klienten(client_id)
  );

-- ─── 8. pflege_massnahmenplaene: engel_pflege_massnahmenplaene_select ───
DROP POLICY IF EXISTS engel_pflege_massnahmenplaene_select ON public.pflege_massnahmenplaene;
CREATE POLICY engel_pflege_massnahmenplaene_select ON public.pflege_massnahmenplaene
  FOR SELECT TO authenticated
  USING (
    status = ANY (ARRAY['aktiv'::text, 'abgelaufen'::text])
    AND client_id IS NOT NULL
    AND public.engel_hat_aktiven_klienten(client_id)
  );

-- ─── 9. pflege_risiken: engel_pflege_risiken_select ───
DROP POLICY IF EXISTS engel_pflege_risiken_select ON public.pflege_risiken;
CREATE POLICY engel_pflege_risiken_select ON public.pflege_risiken
  FOR SELECT TO authenticated
  USING (
    aktiv = true
    AND client_id IS NOT NULL
    AND public.engel_hat_aktiven_klienten(client_id)
  );

-- ─── 10. pflege_verlauf: engel_pflege_verlauf_select ───
DROP POLICY IF EXISTS engel_pflege_verlauf_select ON public.pflege_verlauf;
CREATE POLICY engel_pflege_verlauf_select ON public.pflege_verlauf
  FOR SELECT TO authenticated
  USING (
    sichtbarkeit = ANY (ARRAY['engel'::text, 'alle'::text])
    AND client_id IS NOT NULL
    AND public.engel_hat_aktiven_klienten(client_id)
  );

-- ─── 11. service_records: service_records_caregiver_read ───
DROP POLICY IF EXISTS service_records_caregiver_read ON public.service_records;
CREATE POLICY service_records_caregiver_read ON public.service_records
  FOR SELECT
  USING (
    caregiver_id IN (SELECT public.eigene_caregiver_ids())
  );

-- ─── 12. service_records: service_records_caregiver_update ───
DROP POLICY IF EXISTS service_records_caregiver_update ON public.service_records;
CREATE POLICY service_records_caregiver_update ON public.service_records
  FOR UPDATE
  USING (
    caregiver_id IN (SELECT public.eigene_caregiver_ids())
    AND status = ANY (ARRAY['draft'::text, 'incomplete'::text])
  );
