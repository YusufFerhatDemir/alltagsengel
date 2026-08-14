-- ════════════════════════════════════════════════════════════════════════════
-- Migration: service_type in die Unveraenderlichkeit des Leistungsnachweises
-- Datum:     2026-08-14  (M-4 aus dem Abschlussbericht)
--
-- BEFUND:
--   prevent_finalized_service_record_mutation() (zuletzt 20260908020000)
--   sperrt ab Status 'signed'/'invoiced' die Felder
--     client_id, caregiver_id, date, start_time, end_time,
--     amount, budget_type, organization_id
--   NICHT gesperrt ist service_type — die Leistungsart. Nach der Unterschrift
--   des Kunden liess sich damit aus einer „hauswirtschaft" eine
--   „grosse_koerperpflege" machen.
--
--   Das ist keine Kosmetik: service_type ist die Tarifgrundlage. Es geht ueber
--   tarifLeistungsart() (lib/billing/leistungsarten.ts) in die Tarifaufloesung
--   und bestimmt in resolvePrice() bzw. create_invoice_draft_atomic(), welcher
--   Preis gezogen wird. Der Kunde unterschreibt also eine Leistung und
--   abgerechnet werden kann eine andere — mit anderem Preis und anderer
--   Rechtsgrundlage. Genau das soll die Unveraenderlichkeit verhindern;
--   amount allein reicht dafuer nicht, weil der Betrag bei Kassenleistungen
--   erst aus dem Tarif entsteht.
--
-- FIX: service_type in die geschuetzte Feldliste.
--
--   Die Funktion wird vollstaendig neu geschrieben (nicht nur ergaenzt), damit
--   diese Migration allein den richtigen Zustand herstellt — auch dann, wenn
--   20260908020000 auf der Zielumgebung noch nicht angewendet wurde. Alle
--   dortigen Korrekturen (Statusleiter signed/invoiced statt des nicht
--   existierenden 'freigegeben', Storno-Ausweg ueber proof_status, Verbot der
--   Statusruecknahme) sind hier unveraendert enthalten.
--
-- BEWUSST NICHT mit aufgenommen:
--   leistung_beschreibung (Freitext, keine Abrechnungsgrundlage) und
--   notes. Beide duerfen nachtraeglich praezisiert werden.
--   duration_minutes braucht keinen eigenen Eintrag — die Spalte ist GENERATED
--   aus start_time/end_time, die bereits gesperrt sind.
--
-- Der Rueckweg bleibt unveraendert: stornieren (proof_status = 'STORNIERT')
-- und neu erfassen.
--
-- KEINE Datenaenderung. Rollback: 20260910030001_rollback_service_record_service_type_schutz.sql
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION public.prevent_finalized_service_record_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Ab 'signed' ist der Nachweis unterschrieben, ab 'invoiced' abgerechnet.
  -- Statusleiter: draft → incomplete → complete → signed → invoiced.
  IF OLD.status NOT IN ('signed', 'invoiced') THEN
    RETURN NEW;
  END IF;

  -- Der Rueckweg ist die Stornierung, nicht die stille Aenderung.
  IF NEW.proof_status = 'STORNIERT' AND OLD.proof_status IS DISTINCT FROM 'STORNIERT' THEN
    RETURN NEW;
  END IF;

  IF (
    NEW.client_id        IS DISTINCT FROM OLD.client_id        OR
    NEW.caregiver_id     IS DISTINCT FROM OLD.caregiver_id     OR
    NEW.date             IS DISTINCT FROM OLD.date             OR
    NEW.start_time       IS DISTINCT FROM OLD.start_time       OR
    NEW.end_time         IS DISTINCT FROM OLD.end_time         OR
    NEW.service_type     IS DISTINCT FROM OLD.service_type     OR
    NEW.amount           IS DISTINCT FROM OLD.amount           OR
    NEW.budget_type      IS DISTINCT FROM OLD.budget_type      OR
    NEW.organization_id  IS DISTINCT FROM OLD.organization_id
  ) THEN
    RAISE EXCEPTION
      'Leistungsnachweis im Status "%" ist unveraenderlich. Korrektur nur '
      'ueber Stornierung (proof_status = ''STORNIERT'') und Neuerfassung.',
      OLD.status;
  END IF;

  -- Statusruecknahme (z.B. invoiced → signed) ebenfalls unterbinden.
  IF OLD.status = 'invoiced' AND NEW.status IS DISTINCT FROM 'invoiced' THEN
    RAISE EXCEPTION
      'Abgerechneter Leistungsnachweis kann nicht in den Status "%" '
      'zurueckgesetzt werden.', NEW.status;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.prevent_finalized_service_record_mutation() IS
  'BEFORE UPDATE auf service_records: sperrt ab Status signed/invoiced die '
  'abrechnungsrelevanten Felder — inkl. service_type, der Tarifgrundlage. '
  'Rueckweg ausschliesslich ueber proof_status = ''STORNIERT''.';

COMMIT;

-- ════════════════════════════════════════════════════════════════════
-- VERIFIKATION nach dem Apply (manuell, mit SERVICE-ROLE-Key):
--
--   UPDATE service_records SET service_type = 'grosse_koerperpflege'
--    WHERE id = '<ein Nachweis mit status = ''invoiced''>';
--   → erwartet: "Leistungsnachweis im Status "invoiced" ist unveraenderlich"
--
--   Gegenprobe (muss weiterhin gehen):
--   UPDATE service_records SET notes = 'Nachtrag' WHERE id = '<derselbe>';
--   → erwartet: erfolgreich
--
--   Achtung: der Trigger trg_prevent_finalized_service_record_mutation muss
--   auf service_records existieren (20260804100000 legt ihn an). Pruefen mit:
--   SELECT tgname FROM pg_trigger
--    WHERE tgrelid = 'public.service_records'::regclass AND NOT tgisinternal;
-- ════════════════════════════════════════════════════════════════════
