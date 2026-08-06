-- ============================================================================
-- Pre-Backfill Sicherheit: Schutz festgeschriebener Rechnungen korrigieren
-- Branch: fix/pre-backfill-security
-- ============================================================================
--
-- PROBLEM:
-- trg_invoices_no_finalized_edit prueft auf 'versendet', das NICHT im
-- invoices_status_check Constraint enthalten ist. Dadurch ist der Schutz
-- fuer uebermittelte Rechnungen unwirksam.
--
-- LOESUNG:
-- Ersetzt die Trigger-Funktion mit korrekter, aus der Statusmaschine
-- abgeleiteter Schutzliste. Schuetzt alle fachlichen Rechnungsdaten
-- ab Status 'freigegeben' aufwaerts.
--
-- GESCHUETZTE STATUS (inhaltlich festgeschrieben):
-- Ableitung aus lib/billing/core/status-machine.ts:
-- - freigegeben          (zur Uebermittlung freigegeben)
-- - uebermittelt         (an Kasse uebermittelt)
-- - quittiert            (Empfang bestaetigt)
-- - teilweise_bezahlt    (Teilzahlung eingegangen)
-- - bezahlt              (Terminal: vollstaendig bezahlt)
-- - gekuerzt             (Kasse hat gekuerzt)
-- - strittig             (fachlich ungeklaert)
-- - abgelehnt            (von Kasse abgelehnt)
-- - korrektur_erforderlich (Korrektur noetig)
-- - erneut_eingereicht   (erneut uebermittelt)
-- - akzeptiert            (Terminal: Kuerzung akzeptiert)
-- - storniert             (Terminal: storniert)
-- Legacy-EN-Aequivalente:
-- - sent, paid, partial, rejected, disputed
--
-- NICHT GESCHUETZT (Inhalt editierbar):
-- - entwurf   (Entwurf, aktiv bearbeitet)
-- - geprueft  (geprueft, kann zurueck zu entwurf)
-- - draft     (Legacy-Entwurf)
--
-- GESCHUETZTE FELDER:
-- - total_amount, budget_amount, private_amount, soll_betrag_cent
-- - period_start, period_end
-- - organization_id, client_id
-- - insurance_name, insurance_number
-- - invoice_number, invoice_number_formatted
-- - correction_of, correction_type, idempotency_key
--
-- ERLAUBTE WORKFLOW-FELDER (auch bei festgeschriebenen Rechnungen):
-- - status (Workflow-Fortschritt)
-- - paid_amount, paid_at (Zahlungseingang)
-- - transmission_status, sent_at (Uebermittlung)
-- - bezahlt, bezahlt_am (Zahlungsflags)
-- - versand_elektronisch, versand_post (Versandflags)
-- - kuerzung_cent, kuerzung_grund (Kuerzungsergebnis)
-- - ist_betrag_cent (Ist-Betrag nach Kassenantwort)
-- - rejection_reason (Ablehnungsgrund der Kasse)
-- - notes (administrative Notizen)
-- - frozen_at, version, updated_at, deleted_at
--
-- IDEMPOTENZ: CREATE OR REPLACE FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.prevent_finalized_invoice_mutation()
RETURNS TRIGGER AS $$
BEGIN
  -- Nur fuer festgeschriebene Status pruefen
  -- (entwurf, geprueft, draft sind NICHT geschuetzt)
  IF OLD.status NOT IN (
    -- Deutsche Status (ab freigegeben aufwaerts)
    'freigegeben', 'uebermittelt', 'quittiert',
    'teilweise_bezahlt', 'bezahlt', 'gekuerzt', 'strittig',
    'abgelehnt', 'korrektur_erforderlich', 'erneut_eingereicht',
    'akzeptiert', 'storniert',
    -- Legacy-EN-Aequivalente
    'sent', 'paid', 'partial', 'rejected', 'disputed'
  ) THEN
    -- Nicht geschuetzter Status → alles erlaubt
    RETURN NEW;
  END IF;

  -- Fachliche Felder pruefen
  IF (
    NEW.total_amount IS DISTINCT FROM OLD.total_amount OR
    NEW.budget_amount IS DISTINCT FROM OLD.budget_amount OR
    NEW.private_amount IS DISTINCT FROM OLD.private_amount OR
    NEW.soll_betrag_cent IS DISTINCT FROM OLD.soll_betrag_cent OR
    NEW.period_start IS DISTINCT FROM OLD.period_start OR
    NEW.period_end IS DISTINCT FROM OLD.period_end OR
    NEW.organization_id IS DISTINCT FROM OLD.organization_id OR
    NEW.client_id IS DISTINCT FROM OLD.client_id OR
    NEW.insurance_name IS DISTINCT FROM OLD.insurance_name OR
    NEW.insurance_number IS DISTINCT FROM OLD.insurance_number OR
    NEW.invoice_number IS DISTINCT FROM OLD.invoice_number OR
    NEW.invoice_number_formatted IS DISTINCT FROM OLD.invoice_number_formatted OR
    NEW.correction_of IS DISTINCT FROM OLD.correction_of OR
    NEW.correction_type IS DISTINCT FROM OLD.correction_type OR
    NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
  ) THEN
    RAISE EXCEPTION
      'Festgeschriebene Rechnung (Status: %) darf inhaltlich nicht veraendert werden. '
      'Aenderungen an Betrag, Zeitraum, Kunde, Kostentraeger oder Rechnungsnummer '
      'erfordern eine Korrekturrechnung.',
      OLD.status;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger existiert bereits — Funktion wird durch CREATE OR REPLACE ersetzt.
-- Sicherheitshalber: Trigger neu anlegen falls er fehlt.
DROP TRIGGER IF EXISTS trg_invoices_no_finalized_edit ON public.invoices;
CREATE TRIGGER trg_invoices_no_finalized_edit
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_finalized_invoice_mutation();
