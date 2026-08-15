-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Self-Approval-Bypass in engel_absences_insert verhindern
-- Datum:     2026-08-15
-- ═══════════════════════════════════════════════════════════════════════════
-- GRUND: Die INSERT-Policy prüft nur caregiver_id-Zugehörigkeit, aber
--        nicht den Status. Ein Engel kann so direkt status='genehmigt'
--        einfügen und die eigene Abwesenheit selbst genehmigen.
--
-- LÖSUNG: WITH CHECK um status = 'beantragt' erweitern.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

DROP POLICY IF EXISTS engel_absences_insert ON absences;

CREATE POLICY engel_absences_insert ON absences
  FOR INSERT TO authenticated
  WITH CHECK (
    caregiver_id IN (
      SELECT cg.id FROM caregivers cg WHERE cg.user_id = auth.uid()
    )
    AND status = 'beantragt'
  );

COMMIT;
