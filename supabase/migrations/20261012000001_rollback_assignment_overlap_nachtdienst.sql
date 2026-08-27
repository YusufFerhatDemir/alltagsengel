-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK zu 20261012000000_assignment_overlap_nachtdienst.sql
--
-- Stellt `check_assignment_overlap()` im Stand von
-- 20260808200000_einsatzplanung_leistungsnachweise.sql wieder her.
--
-- ACHTUNG: Danach ist die Doppelbelegungspruefung fuer Einsaetze ueber
-- Mitternacht wieder blind (siehe Befund in der Vorwaerts-Migration).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.check_assignment_overlap()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_conflict_id uuid;
BEGIN
  IF NEW.status IN ('STORNIERT', 'cancelled', 'NO_SHOW') THEN
    RETURN NEW;
  END IF;

  IF NEW.assignment_date IS NULL AND NEW.weekday IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_conflict_id
  FROM public.assignments
  WHERE id != NEW.id
    AND caregiver_id = NEW.caregiver_id
    AND status NOT IN ('STORNIERT', 'cancelled', 'NO_SHOW')
    AND (
      (NEW.assignment_date IS NOT NULL
        AND assignment_date = NEW.assignment_date
        AND start_time < NEW.end_time
        AND end_time > NEW.start_time)
      OR
      (NEW.assignment_date IS NULL
        AND NEW.weekday IS NOT NULL
        AND assignment_date IS NULL
        AND weekday = NEW.weekday
        AND start_time < NEW.end_time
        AND end_time > NEW.start_time
        AND (valid_until IS NULL OR valid_until >= COALESCE(NEW.valid_from, CURRENT_DATE))
        AND COALESCE(valid_from, CURRENT_DATE) <= COALESCE(NEW.valid_until, '9999-12-31'::date))
    )
  LIMIT 1;

  IF v_conflict_id IS NOT NULL THEN
    RAISE EXCEPTION 'DOPPELBELEGUNG: Mitarbeiter % hat bereits einen Einsatz zur gleichen Zeit (Konflikt: %)',
      NEW.caregiver_id, v_conflict_id
      USING ERRCODE = 'unique_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_assignment_overlap ON public.assignments;
CREATE TRIGGER trg_check_assignment_overlap
  BEFORE INSERT OR UPDATE ON public.assignments
  FOR EACH ROW EXECUTE FUNCTION public.check_assignment_overlap();
