-- ════════════════════════════════════════════════════════════════════
-- BASELINE: Fehlende Produktions-Funktionen und Trigger
-- ════════════════════════════════════════════════════════════════════
--
-- Diese Funktionen und Trigger existierten nur in Produktion, ohne
-- versionierte Migration. Definitionen per pg_get_functiondef()
-- aus der Produktions-Datenbank read-only exportiert (nur Struktur).
--
-- Enthält:
--   1) set_updated_at()                          — generischer updated_at-Trigger
--   2) prevent_closed_month_mutation()            — Monatsabschluss-Sperre
--   3) prevent_finalized_invoice_mutation()       — Rechnungs-Schutz
--   4) prevent_finalized_service_record_mutation() — Leistungsnachweis-Schutz
--   5) update_budget_used_amount()                — Budget-Neuberechnung
--   6) Zugehörige Trigger (6 Stück)
-- ════════════════════════════════════════════════════════════════════

-- ── 1) set_updated_at ───────────────────────────────────────────────
-- Setzt updated_at = now() bei jeder Zeilen-Änderung.
-- Variante von update_updated_at() — beide existieren in Produktion,
-- unterschiedliche Tabellen referenzieren unterschiedliche Funktionen.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ── 2) prevent_closed_month_mutation ────────────────────────────────
-- Verhindert Änderungen an bereits abgeschlossenen Monatsabschlüssen.
CREATE OR REPLACE FUNCTION public.prevent_closed_month_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'abgeschlossen' THEN
    RAISE EXCEPTION 'Monatsabschluss ist bereits abgeschlossen und kann nicht mehr geändert werden.';
  END IF;
  RETURN NEW;
END;
$$;

-- ── 3) prevent_finalized_invoice_mutation ───────────────────────────
-- Verhindert direkte Änderungen an finalisierten Rechnungen.
CREATE OR REPLACE FUNCTION public.prevent_finalized_invoice_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status IN ('versendet', 'bezahlt', 'storniert') THEN
    RAISE EXCEPTION 'Finalisierte Rechnung (Status: %) darf nicht direkt geändert werden. Nutze Storno/Korrekturrechnung.', OLD.status;
  END IF;
  RETURN NEW;
END;
$$;

-- ── 4) prevent_finalized_service_record_mutation ────────────────────
-- Verhindert Änderungen an freigegebenen Leistungsnachweisen.
CREATE OR REPLACE FUNCTION public.prevent_finalized_service_record_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'freigegeben' AND NEW.status != 'korrektur' THEN
    RAISE EXCEPTION 'Freigegebene Leistungsnachweise können nur über Korrektur geändert werden.';
  END IF;
  RETURN NEW;
END;
$$;

-- ── 5) update_budget_used_amount ────────────────────────────────────
-- Berechnet das verwendete Entlastungsbudget bei jeder Änderung
-- an service_records neu.
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


-- ════════════════════════════════════════════════════════════════════
-- TRIGGER
-- ════════════════════════════════════════════════════════════════════
-- Hinweis: Die Tabellen, auf die diese Trigger referenzieren, werden
-- durch spätere Migrationen erzeugt. Die Trigger werden deshalb
-- BEDINGT erstellt — nur wenn die Tabelle bereits existiert.
-- Bei sequenzieller Migration auf einem leeren Schema werden diese
-- Trigger übersprungen und müssen nach Erzeugung der Tabellen
-- nachgeholt werden (siehe Phase-2-Remediation).

DO $$
BEGIN
  -- trg_abrechnung_zertifikate_updated
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='abrechnung_zertifikate') THEN
    DROP TRIGGER IF EXISTS trg_abrechnung_zertifikate_updated ON public.abrechnung_zertifikate;
    CREATE TRIGGER trg_abrechnung_zertifikate_updated
      BEFORE UPDATE ON public.abrechnung_zertifikate
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;

  -- trg_datenannahmestellen_updated
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='datenannahmestellen') THEN
    DROP TRIGGER IF EXISTS trg_datenannahmestellen_updated ON public.datenannahmestellen;
    CREATE TRIGGER trg_datenannahmestellen_updated
      BEFORE UPDATE ON public.datenannahmestellen
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;

  -- trg_invoices_no_finalized_edit
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='invoices') THEN
    DROP TRIGGER IF EXISTS trg_invoices_no_finalized_edit ON public.invoices;
    CREATE TRIGGER trg_invoices_no_finalized_edit
      BEFORE UPDATE ON public.invoices
      FOR EACH ROW EXECUTE FUNCTION public.prevent_finalized_invoice_mutation();
  END IF;

  -- trg_monthly_closings_no_reopen
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='monthly_closings') THEN
    DROP TRIGGER IF EXISTS trg_monthly_closings_no_reopen ON public.monthly_closings;
    CREATE TRIGGER trg_monthly_closings_no_reopen
      BEFORE UPDATE ON public.monthly_closings
      FOR EACH ROW EXECUTE FUNCTION public.prevent_closed_month_mutation();
  END IF;

  -- trg_service_records_no_finalized_edit
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='service_records') THEN
    DROP TRIGGER IF EXISTS trg_service_records_no_finalized_edit ON public.service_records;
    CREATE TRIGGER trg_service_records_no_finalized_edit
      BEFORE UPDATE ON public.service_records
      FOR EACH ROW EXECUTE FUNCTION public.prevent_finalized_service_record_mutation();
  END IF;

  -- trg_update_budget_on_service_record (INSERT, UPDATE, DELETE)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='service_records') THEN
    DROP TRIGGER IF EXISTS trg_update_budget_on_service_record ON public.service_records;
    CREATE TRIGGER trg_update_budget_on_service_record
      AFTER INSERT OR UPDATE OR DELETE ON public.service_records
      FOR EACH ROW EXECUTE FUNCTION public.update_budget_used_amount();
  END IF;
END $$;
