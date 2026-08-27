-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK zu 20261013000002_budget_used_amount_statuswerte.sql
-- Stellt update_budget_used_amount() im Stand von 20250101000050 wieder her.
--
-- WARNUNG: mit dieser Fassung steht `client_budgets.used_amount` fuer JEDEN
-- Klienten wieder dauerhaft auf 0 — die IN-Liste ('completed','billed','paid')
-- enthaelt keinen Wert, den `service_records_status_check` seit 20260702 noch
-- erlaubt. Damit sind die 80-/95-/100-Prozent-Schwellen in pruefeBudget()
-- erneut wirkungslos und die Einsatzplanung kennt keine Budgetsperre mehr.
-- `combined_used_amount` (§ 42a) wird dann von gar keinem Trigger gepflegt.
--
-- Der bereits gelaufene Backfill wird NICHT rueckgaengig gemacht: die Werte
-- sind richtig. Sie frieren nur wieder ein und werden beim naechsten
-- Schreibvorgang auf service_records auf 0 zurueckgesetzt.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

DROP FUNCTION IF EXISTS public.rechne_budget_verbrauch_neu(UUID, UUID, INTEGER);

CREATE OR REPLACE FUNCTION public.update_budget_used_amount()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Bei DELETE: alten Client aktualisieren
  IF TG_OP = 'DELETE' THEN
    UPDATE client_budgets
    SET used_amount = COALESCE((
      SELECT SUM(amount) FROM service_records
      WHERE client_id = OLD.client_id
      AND budget_type = 'entlastung'
      AND status IN ('completed', 'billed', 'paid')
      AND EXTRACT(YEAR FROM date) = year
    ), 0),
    updated_at = now()
    WHERE client_id = OLD.client_id
    AND year = EXTRACT(YEAR FROM OLD.date);
    RETURN OLD;
  END IF;

  -- Bei INSERT oder UPDATE: neuen Client aktualisieren
  UPDATE client_budgets
  SET used_amount = COALESCE((
    SELECT SUM(amount) FROM service_records
    WHERE client_id = NEW.client_id
    AND budget_type = 'entlastung'
    AND status IN ('completed', 'billed', 'paid')
    AND EXTRACT(YEAR FROM date) = year
  ), 0),
  updated_at = now()
  WHERE client_id = NEW.client_id
  AND year = EXTRACT(YEAR FROM NEW.date);

  -- Bei UPDATE mit Client-Wechsel: auch alten Client aktualisieren
  IF TG_OP = 'UPDATE' AND OLD.client_id != NEW.client_id THEN
    UPDATE client_budgets
    SET used_amount = COALESCE((
      SELECT SUM(amount) FROM service_records
      WHERE client_id = OLD.client_id
      AND budget_type = 'entlastung'
      AND status IN ('completed', 'billed', 'paid')
      AND EXTRACT(YEAR FROM date) = year
    ), 0),
    updated_at = now()
    WHERE client_id = OLD.client_id
    AND year = EXTRACT(YEAR FROM OLD.date);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_budget_on_service_record ON public.service_records;
CREATE TRIGGER trg_update_budget_on_service_record
  AFTER INSERT OR UPDATE OR DELETE ON public.service_records
  FOR EACH ROW EXECUTE FUNCTION public.update_budget_used_amount();

COMMIT;
