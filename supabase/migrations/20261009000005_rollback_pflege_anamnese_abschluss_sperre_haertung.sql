-- Rollback zu 20261009000004_pflege_anamnese_abschluss_sperre_haertung.sql
--
-- ACHTUNG: nach dem Rollback ist eine abgeschlossene (aber nicht gesperrte)
-- Anamnese auf DB-Ebene wieder frei beschreibbar — nur lib/pflege/
-- anamnesen.ts:updateAnamnese() verweigert das noch app-seitig.
CREATE OR REPLACE FUNCTION prevent_locked_anamnese_edit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.gesperrt = true AND NEW.gesperrt = true THEN
    RAISE EXCEPTION 'Gesperrte Anamnese kann nicht bearbeitet werden.';
  END IF;
  RETURN NEW;
END;
$$;
