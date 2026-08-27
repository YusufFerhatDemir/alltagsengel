-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Neue Wund-Verlaufsdaten bei abgeheilter Wunde auch DB-seitig sperren
-- Datum:     2026-10-10
-- Projekt:   Alltagsengel UG
-- ═══════════════════════════════════════════════════════════════════════════
-- BEFUND: lib/wunden/{assessments,behandlungen,fotos}.ts verweigern seit
-- Commit 2a3ebb2 das Anlegen eines neuen Assessments/Verbandwechsels/Fotos
-- für eine bereits als 'abgeheilt' markierte Wunde — aber nur, wenn der
-- Schreibzugriff durch diese Module läuft (der Aufrufer übergibt den
-- Wund-Status als Parameter, den die Route vorher selbst nachschlägt).
-- Die Tabellen wound_assessments/wound_treatments/wound_photos hatten
-- bislang KEINEN Trigger, der das auf DB-Ebene erzwingt. Ein direkter
-- PostgREST-/service_role-Zugriff unter Umgehung dieser Module konnte
-- bislang unveraendert neue Verlaufsdaten fuer eine abgeheilte Wunde anlegen.
-- Analog zu prevent_locked_sis_child_edit() (20260818010000).
-- IDEMPOTENT: CREATE OR REPLACE FUNCTION, keine Datenaenderung.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION prevent_wound_child_edit_when_healed()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_wound_id uuid;
  v_status   text;
BEGIN
  v_wound_id := COALESCE(NEW.wound_id, OLD.wound_id);
  SELECT status INTO v_status FROM wounds WHERE id = v_wound_id;

  IF v_status = 'abgeheilt' THEN
    RAISE EXCEPTION 'Wunde ist als abgeheilt markiert — keine neuen Verlaufsdaten mehr möglich.';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_locked_wound_assessment ON public.wound_assessments;
CREATE TRIGGER trg_locked_wound_assessment
  BEFORE INSERT OR UPDATE OR DELETE ON public.wound_assessments
  FOR EACH ROW EXECUTE FUNCTION prevent_wound_child_edit_when_healed();

DROP TRIGGER IF EXISTS trg_locked_wound_treatment ON public.wound_treatments;
CREATE TRIGGER trg_locked_wound_treatment
  BEFORE INSERT OR UPDATE OR DELETE ON public.wound_treatments
  FOR EACH ROW EXECUTE FUNCTION prevent_wound_child_edit_when_healed();

DROP TRIGGER IF EXISTS trg_locked_wound_photo ON public.wound_photos;
CREATE TRIGGER trg_locked_wound_photo
  BEFORE INSERT OR UPDATE OR DELETE ON public.wound_photos
  FOR EACH ROW EXECUTE FUNCTION prevent_wound_child_edit_when_healed();

COMMENT ON FUNCTION prevent_wound_child_edit_when_healed() IS
  'Blockt INSERT/UPDATE/DELETE auf wound_assessments/wound_treatments/wound_photos, '
  'sobald die zugehörige Wunde status=abgeheilt hat. Reaktivierung der Wunde '
  '(status zurück auf aktiv/in_abheilung/...) macht die Kindzeilen wieder beschreibbar.';
