-- ════════════════════════════════════════════════════════════════════
-- ROLLBACK zu 20260910030000_service_record_service_type_schutz.sql
-- ════════════════════════════════════════════════════════════════════
-- Stellt den Stand von 20260908020000 wieder her: alle dortigen
-- Korrekturen bleiben, nur der Schutz von service_type faellt weg.
-- Danach ist die Leistungsart eines unterschriebenen oder bereits
-- abgerechneten Nachweises wieder aenderbar — und damit die
-- Tarifgrundlage. Nur ausfuehren, wenn der Schutz nachweislich einen
-- Produktionsweg bricht.
-- ════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION public.prevent_finalized_service_record_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.status NOT IN ('signed', 'invoiced') THEN
    RETURN NEW;
  END IF;

  IF NEW.proof_status = 'STORNIERT' AND OLD.proof_status IS DISTINCT FROM 'STORNIERT' THEN
    RETURN NEW;
  END IF;

  IF (
    NEW.client_id        IS DISTINCT FROM OLD.client_id        OR
    NEW.caregiver_id     IS DISTINCT FROM OLD.caregiver_id     OR
    NEW.date             IS DISTINCT FROM OLD.date             OR
    NEW.start_time       IS DISTINCT FROM OLD.start_time       OR
    NEW.end_time         IS DISTINCT FROM OLD.end_time         OR
    NEW.amount           IS DISTINCT FROM OLD.amount           OR
    NEW.budget_type      IS DISTINCT FROM OLD.budget_type      OR
    NEW.organization_id  IS DISTINCT FROM OLD.organization_id
  ) THEN
    RAISE EXCEPTION
      'Leistungsnachweis im Status "%" ist unveraenderlich. Korrektur nur '
      'ueber Stornierung (proof_status = ''STORNIERT'') und Neuerfassung.',
      OLD.status;
  END IF;

  IF OLD.status = 'invoiced' AND NEW.status IS DISTINCT FROM 'invoiced' THEN
    RAISE EXCEPTION
      'Abgerechneter Leistungsnachweis kann nicht in den Status "%" '
      'zurueckgesetzt werden.', NEW.status;
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;
