-- ═══════════════════════════════════════════════════════════════════════════
-- Rollback: 20261007000000_sis_abschluss_sperre_haertung.sql
-- Stellt die Trigger-Funktionen auf den Stand von
-- 20260818010000_sis_strukturierte_informationssammlung.sql zurueck
-- (Sperre nur ueber `gesperrt`, `abgeschlossen` wieder frei beschreibbar).
-- ⚠ Reduziert den Schutz — nur im Notfall verwenden.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION prevent_locked_sis_edit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.gesperrt = true AND NEW.gesperrt = true THEN
    RAISE EXCEPTION 'Gesperrte Informationssammlung kann nicht bearbeitet werden.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION prevent_locked_sis_child_edit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_assessment_id uuid;
  v_gesperrt boolean;
BEGIN
  v_assessment_id := COALESCE(NEW.assessment_id, OLD.assessment_id);
  SELECT gesperrt INTO v_gesperrt FROM sis_assessments WHERE id = v_assessment_id;
  IF v_gesperrt = true THEN
    RAISE EXCEPTION 'Informationssammlung ist gesperrt — Änderung nicht möglich.';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION prevent_locked_sis_edit() IS
  'Sperr-Schutz fuer sis_assessments: gesperrte Zeilen bleiben unveraenderlich.';
COMMENT ON FUNCTION prevent_locked_sis_child_edit() IS
  'Schreibschutz fuer sis_themenfelder/sis_risikomatrix, wenn der Kopfsatz gesperrt ist.';
