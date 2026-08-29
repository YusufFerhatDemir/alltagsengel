-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK zu 20260829184500_arbzg_ist_arbeitszeit.sql
--
-- Stellt den Stand von `20260920060000_arbeitszeit_verstoesse.sql` wieder her:
-- ArbZG-Pruefung nur auf dem Dienstplan, nur § 3 und § 5.
--
-- ACHTUNG — DATENVERLUST MIT ANSAGE: die Ist-Verstoesse (`basis = 'ist'`)
-- und alle `pflichtpause`-Zeilen werden geloescht. Sie muessen weg, BEVOR
-- die alten Constraints wieder gelten: `eintrag_id` wird gleich wieder
-- NOT NULL, und `azv_verstoss_art_check` kennt `pflichtpause` dann nicht
-- mehr. Ein Rollback, der das den Constraints ueberlaesst, scheitert
-- mittendrin und laesst die Tabelle in einem Zustand zurueck, den weder die
-- alte noch die neue Fassung beschreibt.
--
-- Datum:   2026-08-29
-- IDEMPOTENT.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

DROP TRIGGER IF EXISTS trg_arbzg_pruefung_ist ON public.personal_arbeitszeiten;
DROP FUNCTION IF EXISTS public.arbzg_pruefung_ist();

DELETE FROM public.arbeitszeit_verstoesse
  WHERE arbeitszeit_id IS NOT NULL OR verstoss_art = 'pflichtpause';

DROP INDEX IF EXISTS public.uq_azv_arbeitszeit_art;
DROP INDEX IF EXISTS public.uq_azv_eintrag_art;
DROP INDEX IF EXISTS public.idx_azv_arbeitszeit;

ALTER TABLE public.arbeitszeit_verstoesse
  DROP CONSTRAINT IF EXISTS azv_genau_eine_herkunft;
ALTER TABLE public.arbeitszeit_verstoesse
  DROP CONSTRAINT IF EXISTS azv_basis_check;
ALTER TABLE public.arbeitszeit_verstoesse
  DROP COLUMN IF EXISTS basis;
ALTER TABLE public.arbeitszeit_verstoesse
  DROP COLUMN IF EXISTS arbeitszeit_id;

ALTER TABLE public.arbeitszeit_verstoesse
  ALTER COLUMN eintrag_id SET NOT NULL;

ALTER TABLE public.arbeitszeit_verstoesse
  DROP CONSTRAINT IF EXISTS azv_verstoss_art_check;
ALTER TABLE public.arbeitszeit_verstoesse
  ADD CONSTRAINT azv_verstoss_art_check
  CHECK (verstoss_art IN ('max_tagesarbeitszeit','mindestruhezeit'));

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'azv_eintrag_art_unique'
      AND conrelid = 'public.arbeitszeit_verstoesse'::regclass
  ) THEN
    ALTER TABLE public.arbeitszeit_verstoesse
      ADD CONSTRAINT azv_eintrag_art_unique UNIQUE (eintrag_id, verstoss_art);
  END IF;
END $$;

-- Plan-Pruefung auf den Stand VOR der Weitung: ohne § 4, ohne `basis`,
-- mit dem ON CONFLICT auf der wiederhergestellten UNIQUE-Bedingung.
CREATE OR REPLACE FUNCTION public.arbzg_pruefung()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_start  timestamptz;
  v_end    timestamptz;
  v_dauer_minuten int;
  v_grenzwert_tag  CONSTANT int := 600;
  v_grenzwert_ruhe CONSTANT int := 660;
  v_vor_ende   timestamptz;
  v_nach_start timestamptz;
  v_gap_vor  int;
  v_gap_nach int;
BEGIN
  IF NEW.caregiver_id IS NULL OR NEW.status = 'ausgefallen' OR NEW.typ IN ('bereitschaft','notdienst') THEN
    DELETE FROM arbeitszeit_verstoesse WHERE eintrag_id = NEW.id;
    RETURN NEW;
  END IF;

  v_start := (NEW.datum + NEW.start_zeit)::timestamptz;
  v_end   := CASE WHEN NEW.end_zeit > NEW.start_zeit
                  THEN (NEW.datum + NEW.end_zeit)::timestamptz
                  ELSE (NEW.datum + 1 + NEW.end_zeit)::timestamptz END;
  v_dauer_minuten := (EXTRACT(EPOCH FROM (v_end - v_start))::int / 60) - COALESCE(NEW.pause_minuten, 0);

  IF v_dauer_minuten > v_grenzwert_tag THEN
    INSERT INTO arbeitszeit_verstoesse
      (organization_id, caregiver_id, eintrag_id, verstoss_art, datum, gemessener_wert_minuten, grenzwert_minuten)
    VALUES
      (NEW.organization_id, NEW.caregiver_id, NEW.id, 'max_tagesarbeitszeit', NEW.datum, v_dauer_minuten, v_grenzwert_tag)
    ON CONFLICT (eintrag_id, verstoss_art) DO UPDATE
      SET gemessener_wert_minuten = EXCLUDED.gemessener_wert_minuten,
          erkannt_am = now(), quittiert = false, quittiert_von = NULL, quittiert_am = NULL;
  ELSE
    DELETE FROM arbeitszeit_verstoesse WHERE eintrag_id = NEW.id AND verstoss_art = 'max_tagesarbeitszeit';
  END IF;

  SELECT MAX(CASE WHEN d.end_zeit > d.start_zeit
                  THEN (d.datum + d.end_zeit)::timestamptz
                  ELSE (d.datum + 1 + d.end_zeit)::timestamptz END)
    INTO v_vor_ende
    FROM dienstplan_eintraege d
    WHERE d.id != NEW.id AND d.organization_id = NEW.organization_id AND d.caregiver_id = NEW.caregiver_id
      AND d.status != 'ausgefallen' AND d.typ NOT IN ('bereitschaft','notdienst')
      AND d.datum BETWEEN NEW.datum - 1 AND NEW.datum
      AND (d.datum + d.start_zeit)::timestamptz < v_start;

  SELECT MIN((d.datum + d.start_zeit)::timestamptz)
    INTO v_nach_start
    FROM dienstplan_eintraege d
    WHERE d.id != NEW.id AND d.organization_id = NEW.organization_id AND d.caregiver_id = NEW.caregiver_id
      AND d.status != 'ausgefallen' AND d.typ NOT IN ('bereitschaft','notdienst')
      AND d.datum BETWEEN NEW.datum AND NEW.datum + 1
      AND (d.datum + d.start_zeit)::timestamptz > v_end;

  v_gap_vor  := CASE WHEN v_vor_ende IS NOT NULL THEN EXTRACT(EPOCH FROM (v_start - v_vor_ende))::int / 60 END;
  v_gap_nach := CASE WHEN v_nach_start IS NOT NULL THEN EXTRACT(EPOCH FROM (v_nach_start - v_end))::int / 60 END;

  IF (v_gap_vor IS NOT NULL AND v_gap_vor < v_grenzwert_ruhe)
     OR (v_gap_nach IS NOT NULL AND v_gap_nach < v_grenzwert_ruhe) THEN
    INSERT INTO arbeitszeit_verstoesse
      (organization_id, caregiver_id, eintrag_id, verstoss_art, datum, gemessener_wert_minuten, grenzwert_minuten)
    VALUES
      (NEW.organization_id, NEW.caregiver_id, NEW.id, 'mindestruhezeit', NEW.datum,
       LEAST(COALESCE(v_gap_vor, v_grenzwert_ruhe), COALESCE(v_gap_nach, v_grenzwert_ruhe)), v_grenzwert_ruhe)
    ON CONFLICT (eintrag_id, verstoss_art) DO UPDATE
      SET gemessener_wert_minuten = EXCLUDED.gemessener_wert_minuten,
          erkannt_am = now(), quittiert = false, quittiert_von = NULL, quittiert_am = NULL;
  ELSE
    DELETE FROM arbeitszeit_verstoesse WHERE eintrag_id = NEW.id AND verstoss_art = 'mindestruhezeit';
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;
