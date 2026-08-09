-- ════════════════════════════════════════════════════════════════════
-- ROLLBACK für 20260809120000_tourenplanung.sql
-- ════════════════════════════════════════════════════════════════════
-- NICHT automatisch anwenden — nur manuell im Fehlerfall.
-- Entfernt ausschließlich die in der Tourenplanung-Migration neu
-- angelegten Objekte. assignments/service_records bleiben unberührt.
-- Kein BEGIN/COMMIT: _run_sql läuft bereits transaktional.
-- ════════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_tour_recalc_totals ON public.tour_stops;
DROP TRIGGER IF EXISTS trg_tour_stop_sync_assignment ON public.tour_stops;
DROP TRIGGER IF EXISTS trg_tours_updated_at ON public.tours;
DROP TRIGGER IF EXISTS trg_tour_stops_updated_at ON public.tour_stops;
DROP TRIGGER IF EXISTS trg_tour_templates_updated_at ON public.tour_templates;

DROP FUNCTION IF EXISTS public.tour_recalc_totals();
DROP FUNCTION IF EXISTS public.tour_stop_sync_assignment();
-- erst nach den Policies droppen, die ihn nutzen (Tabellen-Drop unten
-- entfernt die Policies mit) — daher CASCADE-frei ganz am Ende:
-- eigene_caregiver_ids siehe unten.

DROP TABLE IF EXISTS public.tour_stops;
DROP TABLE IF EXISTS public.tours;
DROP TABLE IF EXISTS public.tour_templates;

-- assignments-Policies auf den Stand von 20260808200000 zurücksetzen
-- (Original-Subquery-Form), bevor der Helper fällt.
DROP POLICY IF EXISTS assignments_engel_read ON public.assignments;
CREATE POLICY assignments_engel_read ON public.assignments
  FOR SELECT TO authenticated
  USING (
    caregiver_id IN (SELECT id FROM public.caregivers WHERE user_id = auth.uid())
    OR client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','superadmin'))
  );

DROP POLICY IF EXISTS assignments_engel_update ON public.assignments;
CREATE POLICY assignments_engel_update ON public.assignments
  FOR UPDATE TO authenticated
  USING (
    caregiver_id IN (SELECT id FROM public.caregivers WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','superadmin'))
  )
  WITH CHECK (
    caregiver_id IN (SELECT id FROM public.caregivers WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','superadmin'))
  );

DROP FUNCTION IF EXISTS public.eigene_caregiver_ids();
DROP FUNCTION IF EXISTS public.eigene_client_ids();
