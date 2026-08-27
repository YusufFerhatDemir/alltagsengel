-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Anamnese — Abschluss-Sperre haerten (Trigger deckte nur `gesperrt`)
-- Datum:     2026-10-09
-- Projekt:   Alltagsengel UG
-- ═══════════════════════════════════════════════════════════════════════════
-- BEFUND: prevent_locked_anamnese_edit() blockte Schreibzugriffe bisher nur,
-- wenn `gesperrt = true`. lib/pflege/anamnesen.ts:updateAnamnese() verweigert
-- zusaetzlich jede Bearbeitung ab `status = 'abgeschlossen'` (Commit a111471)
-- — aber nur, wenn der Schreibzugriff durch lib/pflege/anamnesen.ts laeuft.
-- Ein direkter PostgREST-/service_role-Zugriff unter Umgehung dieses Moduls
-- konnte eine abgeschlossene (aber noch nicht gesperrte) Anamnese bislang
-- unveraendert durchschreiben. Analog zur SIS-Haertung (20261007000002) wird
-- der Trigger jetzt fail-closed: `status = 'abgeschlossen'` ist auf DB-Ebene
-- ebenso unveraenderlich wie `gesperrt = true`, ausser fuer den vorgesehenen
-- Statuswechsel (abgeschlossen → gesperrt via sperreAnamnese), der den
-- Status selbst aendert.
-- IDEMPOTENT: CREATE OR REPLACE FUNCTION, keine Datenaenderung.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION prevent_locked_anamnese_edit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.gesperrt = true AND NEW.gesperrt = true THEN
    RAISE EXCEPTION 'Gesperrte Anamnese kann nicht bearbeitet werden.';
  END IF;
  -- Abgeschlossen bleibt abgeschlossen: nur ein Statuswechsel (→ gesperrt)
  -- darf die Zeile noch anfassen.
  IF OLD.status = 'abgeschlossen' AND NEW.status = 'abgeschlossen' THEN
    RAISE EXCEPTION 'Abgeschlossene Anamnese kann nicht bearbeitet werden.';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION prevent_locked_anamnese_edit() IS
  'Blockt Updates auf pflege_anamnesen, solange gesperrt=true bleibt ODER status=abgeschlossen bleibt (Statuswechsel selbst ist erlaubt).';
