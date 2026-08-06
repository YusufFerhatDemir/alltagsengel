-- ============================================================================
-- ROLLBACK: Status 'strittig' entfernen
-- ============================================================================
--
-- ACHTUNG: Vor Rollback muessen alle Rechnungen mit Status 'strittig'
-- in einen anderen Status uebergefuehrt werden.
-- ============================================================================

-- 1. CHECK-Constraint auf 19 Werte zuruecksetzen (ohne 'strittig')
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_status_check CHECK (
  status IN (
    'draft', 'sent', 'paid', 'partial', 'rejected', 'disputed',
    'entwurf', 'geprueft', 'freigegeben', 'uebermittelt',
    'quittiert', 'abgelehnt', 'bezahlt', 'teilweise_bezahlt',
    'gekuerzt', 'korrektur_erforderlich', 'erneut_eingereicht',
    'akzeptiert', 'storniert'
  )
);

-- 2. Trigger-Funktion ohne 'strittig' wiederherstellen (mit self-transition fix)
CREATE OR REPLACE FUNCTION public.validate_invoice_status_transition()
RETURNS TRIGGER AS $$
BEGIN
  -- Frozen invoice protection (always check, even without status change)
  IF OLD.frozen_at IS NOT NULL AND (
    NEW.total_amount IS DISTINCT FROM OLD.total_amount OR
    NEW.client_id IS DISTINCT FROM OLD.client_id OR
    NEW.period_start IS DISTINCT FROM OLD.period_start OR
    NEW.period_end IS DISTINCT FROM OLD.period_end
  ) THEN
    RAISE EXCEPTION 'Festgeschriebene Rechnung darf inhaltlich nicht veraendert werden. Erstellen Sie eine Korrekturrechnung.';
  END IF;

  -- Skip transition checks if status didn't change
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  -- Terminal status protection
  IF OLD.status IN ('bezahlt', 'storniert', 'akzeptiert') THEN
    RAISE EXCEPTION 'Rechnung im Status % kann nicht mehr geaendert werden', OLD.status;
  END IF;

  IF OLD.status = 'entwurf' AND NEW.status NOT IN ('geprueft', 'storniert') THEN
    RAISE EXCEPTION 'Ungueltiger Statusuebergang: % -> %', OLD.status, NEW.status;
  END IF;
  IF OLD.status = 'geprueft' AND NEW.status NOT IN ('freigegeben', 'entwurf', 'storniert') THEN
    RAISE EXCEPTION 'Ungueltiger Statusuebergang: % -> %', OLD.status, NEW.status;
  END IF;
  IF OLD.status = 'freigegeben' AND NEW.status NOT IN ('uebermittelt', 'storniert') THEN
    RAISE EXCEPTION 'Ungueltiger Statusuebergang: % -> %', OLD.status, NEW.status;
  END IF;
  IF OLD.status = 'uebermittelt' AND NEW.status NOT IN ('quittiert', 'abgelehnt', 'storniert') THEN
    RAISE EXCEPTION 'Ungueltiger Statusuebergang: % -> %', OLD.status, NEW.status;
  END IF;
  IF OLD.status = 'quittiert' AND NEW.status NOT IN ('bezahlt', 'teilweise_bezahlt', 'gekuerzt', 'storniert') THEN
    RAISE EXCEPTION 'Ungueltiger Statusuebergang: % -> %', OLD.status, NEW.status;
  END IF;
  IF OLD.status = 'teilweise_bezahlt' AND NEW.status NOT IN ('bezahlt', 'storniert', 'korrektur_erforderlich') THEN
    RAISE EXCEPTION 'Ungueltiger Statusuebergang: % -> %', OLD.status, NEW.status;
  END IF;
  IF OLD.status = 'gekuerzt' AND NEW.status NOT IN ('korrektur_erforderlich', 'akzeptiert', 'storniert') THEN
    RAISE EXCEPTION 'Ungueltiger Statusuebergang: % -> %', OLD.status, NEW.status;
  END IF;
  IF OLD.status = 'abgelehnt' AND NEW.status NOT IN ('erneut_eingereicht', 'storniert') THEN
    RAISE EXCEPTION 'Ungueltiger Statusuebergang: % -> %', OLD.status, NEW.status;
  END IF;
  IF OLD.status = 'korrektur_erforderlich' AND NEW.status NOT IN ('entwurf', 'storniert') THEN
    RAISE EXCEPTION 'Ungueltiger Statusuebergang: % -> %', OLD.status, NEW.status;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
