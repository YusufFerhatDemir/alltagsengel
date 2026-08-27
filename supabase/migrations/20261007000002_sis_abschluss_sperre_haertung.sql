-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: SIS — Abschluss-Sperre haerten (Trigger deckte nur `gesperrt`)
-- Datum:     2026-10-07
-- Projekt:   Alltagsengel UG
-- ═══════════════════════════════════════════════════════════════════════════
-- BEFUND: prevent_locked_sis_edit()/prevent_locked_sis_child_edit() blockten
-- Schreibzugriffe bisher nur, wenn `gesperrt = true`. Der Zwischenstatus
-- `abgeschlossen` (gesperrt = false) war auf DB-Ebene weiterhin frei
-- beschreibbar — nur die App-Schicht (lib/sis/*) verweigerte dort Schreiben.
-- Die RLS-Policy `admin_sis_assessments` prueft ausschliesslich is_admin(),
-- nicht den Status: ein direkter PostgREST-Aufruf (service_role oder ein
-- Admin-JWT unter Umgehung von app/api/sis/*) konnte eine abgeschlossene
-- SIS bislang unveraendert durchschreiben. Analog zur Sperr-Logik im
-- Medikamentenmanagement (20260820010000) wird der Trigger jetzt
-- fail-closed: `status = 'abgeschlossen'` ist auf DB-Ebene ebenso
-- unveraenderlich wie `gesperrt = true`, ausser fuer die vorgesehenen
-- Statuswechsel (abschliessen → gesperrt / abschliessen → entwurf via
-- Wiedereroeffnung), die den Status selbst aendern.
-- IDEMPOTENT: CREATE OR REPLACE FUNCTION, keine Datenaenderung.
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
  -- Abgeschlossen bleibt abgeschlossen: nur ein Statuswechsel (→ gesperrt
  -- oder → entwurf per Wiedereroeffnung) darf die Zeile noch anfassen.
  IF OLD.status = 'abgeschlossen' AND NEW.status = 'abgeschlossen' THEN
    RAISE EXCEPTION 'Abgeschlossene Informationssammlung kann nicht bearbeitet werden — zuerst wiedereröffnen.';
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
  v_status text;
BEGIN
  v_assessment_id := COALESCE(NEW.assessment_id, OLD.assessment_id);
  SELECT gesperrt, status INTO v_gesperrt, v_status
    FROM sis_assessments WHERE id = v_assessment_id;

  IF v_gesperrt = true THEN
    RAISE EXCEPTION 'Informationssammlung ist gesperrt — Änderung nicht möglich.';
  END IF;
  IF v_status = 'abgeschlossen' THEN
    RAISE EXCEPTION 'Informationssammlung ist abgeschlossen — Änderung nicht möglich, zuerst wiedereröffnen.';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION prevent_locked_sis_edit() IS
  'Blockt Updates auf sis_assessments, solange gesperrt=true bleibt ODER status=abgeschlossen bleibt (Statuswechsel selbst ist erlaubt).';
COMMENT ON FUNCTION prevent_locked_sis_child_edit() IS
  'Blockt INSERT/UPDATE/DELETE auf sis_themenfelder/sis_risikomatrix, wenn der Kopfsatz gesperrt oder abgeschlossen ist.';
