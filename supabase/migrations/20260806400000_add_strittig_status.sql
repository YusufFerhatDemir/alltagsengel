-- ============================================================================
-- Status 'strittig' ergaenzen
-- PR #35 Final Closeout — 2026-08-06
-- ============================================================================
--
-- KONTEXT:
-- 'strittig' ist ein neuer Zwischenstatus fuer fachlich ungeklaerte
-- Rechnungen/Kassenentscheidungen. Er darf NICHT automatisch mit
-- gekuerzt, korrektur_erforderlich oder abgelehnt gleichgesetzt werden.
-- Diese drei Werte sind moegliche spaetere Ergebnisse einer manuellen
-- Pruefung.
--
-- IDEMPOTENZ:
-- DROP IF EXISTS + ADD Pattern.
-- ============================================================================

-- 1. CHECK-Constraint um 'strittig' erweitern (jetzt 20 Werte)
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_status_check CHECK (
  status IN (
    -- Legacy englische Statuswerte (Bestandsdaten)
    'draft', 'sent', 'paid', 'partial', 'rejected', 'disputed',
    -- Deutsche Statuswerte (PR #35 Statusmaschine)
    'entwurf', 'geprueft', 'freigegeben', 'uebermittelt',
    'quittiert', 'abgelehnt', 'bezahlt', 'teilweise_bezahlt',
    'gekuerzt', 'korrektur_erforderlich', 'erneut_eingereicht',
    'akzeptiert', 'storniert',
    -- Neuer Zwischenstatus (fachlich ungeklaert)
    'strittig'
  )
);

-- 2. Trigger-Funktion um 'strittig' erweitern
--    BUGFIX: frozen_at-Pruefung VOR Transition-Check, damit nicht-Status-Updates
--    auf nicht-terminale Rechnungen nicht blockiert werden.
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

  -- Skip transition checks if status didn't change (allows non-status column updates)
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  -- Terminal status protection
  IF OLD.status IN ('bezahlt', 'storniert', 'akzeptiert') THEN
    RAISE EXCEPTION 'Rechnung im Status % kann nicht mehr geaendert werden', OLD.status;
  END IF;

  -- Status transition validation
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
  IF OLD.status = 'quittiert' AND NEW.status NOT IN ('bezahlt', 'teilweise_bezahlt', 'gekuerzt', 'strittig', 'storniert') THEN
    RAISE EXCEPTION 'Ungueltiger Statusuebergang: % -> %', OLD.status, NEW.status;
  END IF;
  IF OLD.status = 'teilweise_bezahlt' AND NEW.status NOT IN ('bezahlt', 'storniert', 'korrektur_erforderlich', 'strittig') THEN
    RAISE EXCEPTION 'Ungueltiger Statusuebergang: % -> %', OLD.status, NEW.status;
  END IF;
  IF OLD.status = 'gekuerzt' AND NEW.status NOT IN ('korrektur_erforderlich', 'akzeptiert', 'storniert', 'strittig') THEN
    RAISE EXCEPTION 'Ungueltiger Statusuebergang: % -> %', OLD.status, NEW.status;
  END IF;
  IF OLD.status = 'abgelehnt' AND NEW.status NOT IN ('erneut_eingereicht', 'storniert') THEN
    RAISE EXCEPTION 'Ungueltiger Statusuebergang: % -> %', OLD.status, NEW.status;
  END IF;
  IF OLD.status = 'korrektur_erforderlich' AND NEW.status NOT IN ('entwurf', 'storniert') THEN
    RAISE EXCEPTION 'Ungueltiger Statusuebergang: % -> %', OLD.status, NEW.status;
  END IF;
  IF OLD.status = 'strittig' AND NEW.status NOT IN ('gekuerzt', 'korrektur_erforderlich', 'abgelehnt', 'akzeptiert', 'bezahlt', 'storniert') THEN
    RAISE EXCEPTION 'Ungueltiger Statusuebergang: % -> %', OLD.status, NEW.status;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
