-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Abgesetzte Medikamente auch DB-seitig gegen Bearbeitung sperren
-- Datum:     2026-10-10
-- Projekt:   Alltagsengel UG
-- ═══════════════════════════════════════════════════════════════════════════
-- BEFUND: lib/medikamente/medikamente.ts:aktualisiereMedikament() verweigert
-- seit Commit df0d24e jede Bearbeitung eines Medikaments mit
-- status = 'abgesetzt' — aber nur, wenn der Schreibzugriff durch dieses
-- Modul laeuft. Die Tabelle medikamente hatte bislang GAR KEINEN Trigger.
-- Ein direkter PostgREST-/service_role-Zugriff unter Umgehung von
-- lib/medikamente/medikamente.ts konnte Name, Dosierung, Einnahmezeiten etc.
-- eines bereits abgesetzten Medikaments bislang unveraendert durchschreiben —
-- bei einem sicherheitskritischen Datensatz (Medikation) besonders riskant.
--
-- ABGRENZUNG ZU DEN ANDEREN SPERR-HAERTUNGEN (SIS/Anamnese):
-- setzeMedikamentStatus() darf ausdruecklich AUCH ein bereits abgesetztes
-- Medikament erneut auf 'abgesetzt' setzen (Korrektur von abgesetzt_grund/
-- -datum) — anders als bei SIS/Anamnese gibt es hier also einen legitimen
-- Schreibpfad, der NEW.status = OLD.status = 'abgesetzt' erzeugt. Der
-- Trigger blockt deshalb nicht jede Zeilenaenderung bei unveraendertem
-- Status, sondern gezielt nur die Aenderung der klinischen/administrativen
-- Felder (alles ausser status/abgesetzt_am/abgesetzt_grund/updated_at).
-- IDEMPOTENT: CREATE OR REPLACE FUNCTION, keine Datenaenderung.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION prevent_locked_medikament_edit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'abgesetzt' AND NEW.status = 'abgesetzt' THEN
    IF NEW.medikament_name    IS DISTINCT FROM OLD.medikament_name
       OR NEW.wirkstoff       IS DISTINCT FROM OLD.wirkstoff
       OR NEW.pzn             IS DISTINCT FROM OLD.pzn
       OR NEW.kategorie       IS DISTINCT FROM OLD.kategorie
       OR NEW.darreichungsform IS DISTINCT FROM OLD.darreichungsform
       OR NEW.dosierung       IS DISTINCT FROM OLD.dosierung
       OR NEW.einheit         IS DISTINCT FROM OLD.einheit
       OR NEW.einnahme_morgens IS DISTINCT FROM OLD.einnahme_morgens
       OR NEW.einnahme_mittags IS DISTINCT FROM OLD.einnahme_mittags
       OR NEW.einnahme_abends  IS DISTINCT FROM OLD.einnahme_abends
       OR NEW.einnahme_nachts  IS DISTINCT FROM OLD.einnahme_nachts
       OR NEW.einnahme_hinweis IS DISTINCT FROM OLD.einnahme_hinweis
       OR NEW.verordnet_von   IS DISTINCT FROM OLD.verordnet_von
       OR NEW.beginn_datum    IS DISTINCT FROM OLD.beginn_datum
       OR NEW.end_datum       IS DISTINCT FROM OLD.end_datum
       OR NEW.dauermedikation IS DISTINCT FROM OLD.dauermedikation
       OR NEW.notizen         IS DISTINCT FROM OLD.notizen
    THEN
      RAISE EXCEPTION 'Abgesetztes Medikament kann nicht mehr bearbeitet werden.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_locked_medikament ON public.medikamente;
CREATE TRIGGER trg_locked_medikament BEFORE UPDATE ON public.medikamente
  FOR EACH ROW EXECUTE FUNCTION prevent_locked_medikament_edit();

COMMENT ON FUNCTION prevent_locked_medikament_edit() IS
  'Blockt Aenderungen an klinischen/administrativen Feldern eines abgesetzten Medikaments. '
  'Erlaubt bleibt: Reaktivierung/Pausierung (status aendert sich) sowie die Korrektur von '
  'abgesetzt_am/abgesetzt_grund bei unveraendertem Status (setzeMedikamentStatus).';
