-- Rollback zu 20260829213000: 'abgeschrieben' wieder aus der Schutzliste
-- nehmen. Danach ist eine abgeschriebene Rechnung inhaltlich wieder
-- veraenderbar — das ist der Zustand vor der Migration und ausdruecklich
-- der schlechtere. Dieses Rollback existiert der Vollstaendigkeit halber,
-- nicht als Empfehlung.

CREATE OR REPLACE FUNCTION public.prevent_finalized_invoice_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF OLD.status NOT IN (
    'freigegeben', 'uebermittelt', 'quittiert',
    'teilweise_bezahlt', 'bezahlt', 'gekuerzt', 'strittig',
    'abgelehnt', 'korrektur_erforderlich', 'erneut_eingereicht',
    'akzeptiert', 'storniert',
    'sent', 'paid', 'partial', 'rejected', 'disputed'
  ) THEN
    RETURN NEW;
  END IF;

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
$function$;
