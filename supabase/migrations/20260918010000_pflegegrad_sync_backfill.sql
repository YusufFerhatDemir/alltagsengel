-- ═══════════════════════════════════════════════════════════════
-- Pflegegradmanagement: Backfill + Sync-Trigger
-- ═══════════════════════════════════════════════════════════════
--
-- PROBLEM: clients hat care_level (führend) und pflegegrad (Kopie).
-- Bei Bestandskunden ist pflegegrad NULL, obwohl care_level gesetzt.
-- pflegegradVon() löst das im Code, aber DB-Views und Trigger sehen
-- nur eine Spalte.
--
-- FIX:
--   1. Backfill: pflegegrad ← care_level wo pflegegrad NULL
--   2. Trigger: hält beide Spalten bei INSERT/UPDATE synchron
-- ═══════════════════════════════════════════════════════════════

-- 1) Backfill: Bestandskunden synchronisieren
UPDATE public.clients
SET pflegegrad = care_level
WHERE care_level IS NOT NULL
  AND pflegegrad IS NULL;

-- 2) Sync-Trigger: bei jedem Schreibzugriff beide Spalten abgleichen
CREATE OR REPLACE FUNCTION public.sync_pflegegrad_care_level()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- care_level wurde geändert → pflegegrad nachziehen
  IF NEW.care_level IS DISTINCT FROM OLD.care_level THEN
    NEW.pflegegrad := NEW.care_level;
  -- pflegegrad wurde geändert (aber care_level nicht) → care_level nachziehen
  ELSIF NEW.pflegegrad IS DISTINCT FROM OLD.pflegegrad THEN
    NEW.care_level := NEW.pflegegrad;
  END IF;

  -- Bei INSERT: fehlende Spalte aus der anderen ableiten
  IF TG_OP = 'INSERT' THEN
    IF NEW.care_level IS NOT NULL AND NEW.pflegegrad IS NULL THEN
      NEW.pflegegrad := NEW.care_level;
    ELSIF NEW.pflegegrad IS NOT NULL AND NEW.care_level IS NULL THEN
      NEW.care_level := NEW.pflegegrad;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_pflegegrad ON public.clients;
CREATE TRIGGER trg_sync_pflegegrad
  BEFORE INSERT OR UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.sync_pflegegrad_care_level();
