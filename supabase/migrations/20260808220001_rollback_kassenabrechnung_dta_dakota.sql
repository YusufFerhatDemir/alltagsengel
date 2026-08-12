-- Rollback: 20260808220000_kassenabrechnung_dta_dakota.sql
BEGIN;

DROP VIEW IF EXISTS public.dta_fehler_dashboard;
DROP VIEW IF EXISTS public.dta_dashboard;

DROP TRIGGER IF EXISTS trg_lauf_status ON public.abrechnungslaeufe;
DROP FUNCTION IF EXISTS public.validate_lauf_status_transition();
DROP FUNCTION IF EXISTS public.prevent_modify_dta_audit();

DROP TABLE IF EXISTS public.dta_validierungen CASCADE;
DROP TABLE IF EXISTS public.dta_korrekturlaeufe CASCADE;
DROP TABLE IF EXISTS public.dta_fehlerprotokoll CASCADE;
DROP TABLE IF EXISTS public.dta_ruecklaeufer_positionen CASCADE;
DROP TABLE IF EXISTS public.dta_ruecklaeufer CASCADE;
DROP TABLE IF EXISTS public.dta_dakota_auftraege CASCADE;
DROP TABLE IF EXISTS public.dta_kostentraeger CASCADE;
DROP TABLE IF EXISTS public.dta_lauf_rechnungen CASCADE;

ALTER TABLE public.abrechnungslaeufe
  DROP COLUMN IF EXISTS organization_id,
  DROP COLUMN IF EXISTS bundesland,
  DROP COLUMN IF EXISTS lauf_typ,
  DROP COLUMN IF EXISTS korrektur_von,
  DROP COLUMN IF EXISTS anzahl_positionen,
  DROP COLUMN IF EXISTS pruefsumme,
  DROP COLUMN IF EXISTS validierung_bestanden,
  DROP COLUMN IF EXISTS validierung_ergebnis,
  DROP COLUMN IF EXISTS export_datei_hash,
  DROP COLUMN IF EXISTS technische_version,
  DROP COLUMN IF EXISTS edifact_version,
  DROP COLUMN IF EXISTS freigegeben_von,
  DROP COLUMN IF EXISTS freigegeben_am,
  DROP COLUMN IF EXISTS dakota_auftrag_id,
  DROP COLUMN IF EXISTS antwort_datei_url,
  DROP COLUMN IF EXISTS antwort_status,
  DROP COLUMN IF EXISTS storniert_am,
  DROP COLUMN IF EXISTS storniert_von,
  DROP COLUMN IF EXISTS storno_grund,
  DROP COLUMN IF EXISTS updated_at,
  DROP COLUMN IF EXISTS deleted_at;

ALTER TABLE public.datenannahmestellen
  DROP COLUMN IF EXISTS organization_id,
  DROP COLUMN IF EXISTS bundesland,
  DROP COLUMN IF EXISTS kassenart,
  DROP COLUMN IF EXISTS leistungsarten,
  DROP COLUMN IF EXISTS dateiformat,
  DROP COLUMN IF EXISTS max_dateigroesse_kb,
  DROP COLUMN IF EXISTS gueltig_ab,
  DROP COLUMN IF EXISTS gueltig_bis,
  DROP COLUMN IF EXISTS letzte_verbindung_am,
  DROP COLUMN IF EXISTS verbindung_status,
  DROP COLUMN IF EXISTS deleted_at;

COMMIT;
