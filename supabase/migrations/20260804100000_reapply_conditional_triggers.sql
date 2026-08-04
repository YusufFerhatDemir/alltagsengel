-- ════════════════════════════════════════════════════════════════════
-- NACHHOL-MIGRATION: Bedingte Trigger aus Baseline (20250101000050)
-- ════════════════════════════════════════════════════════════════════
--
-- Bei sequenzieller Migration auf einem leeren Schema wurden die
-- 6 bedingten Trigger in 20250101000050_missing_production_functions.sql
-- uebersprungen, weil ihre Zieltabellen erst durch spaetere Migrationen
-- erzeugt werden. Diese Migration holt sie nach.
--
-- Alle 5 Zieltabellen existieren jetzt:
--   abrechnung_zertifikate, datenannahmestellen, invoices,
--   monthly_closings, service_records
-- ════════════════════════════════════════════════════════════════════

-- ── 1) trg_abrechnung_zertifikate_updated ──────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='abrechnung_zertifikate') THEN
    DROP TRIGGER IF EXISTS trg_abrechnung_zertifikate_updated ON public.abrechnung_zertifikate;
    CREATE TRIGGER trg_abrechnung_zertifikate_updated
      BEFORE UPDATE ON public.abrechnung_zertifikate
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- ── 2) trg_datenannahmestellen_updated ─────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='datenannahmestellen') THEN
    DROP TRIGGER IF EXISTS trg_datenannahmestellen_updated ON public.datenannahmestellen;
    CREATE TRIGGER trg_datenannahmestellen_updated
      BEFORE UPDATE ON public.datenannahmestellen
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- ── 3) trg_invoices_no_finalized_edit ──────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='invoices') THEN
    DROP TRIGGER IF EXISTS trg_invoices_no_finalized_edit ON public.invoices;
    CREATE TRIGGER trg_invoices_no_finalized_edit
      BEFORE UPDATE ON public.invoices
      FOR EACH ROW EXECUTE FUNCTION public.prevent_finalized_invoice_mutation();
  END IF;
END $$;

-- ── 4) trg_monthly_closings_no_reopen ──────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='monthly_closings') THEN
    DROP TRIGGER IF EXISTS trg_monthly_closings_no_reopen ON public.monthly_closings;
    CREATE TRIGGER trg_monthly_closings_no_reopen
      BEFORE UPDATE ON public.monthly_closings
      FOR EACH ROW EXECUTE FUNCTION public.prevent_closed_month_mutation();
  END IF;
END $$;

-- ── 5) trg_service_records_no_finalized_edit ───────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='service_records') THEN
    DROP TRIGGER IF EXISTS trg_service_records_no_finalized_edit ON public.service_records;
    CREATE TRIGGER trg_service_records_no_finalized_edit
      BEFORE UPDATE ON public.service_records
      FOR EACH ROW EXECUTE FUNCTION public.prevent_finalized_service_record_mutation();
  END IF;
END $$;

-- ── 6) trg_update_budget_on_service_record ─────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='service_records') THEN
    DROP TRIGGER IF EXISTS trg_update_budget_on_service_record ON public.service_records;
    CREATE TRIGGER trg_update_budget_on_service_record
      AFTER INSERT OR UPDATE OR DELETE ON public.service_records
      FOR EACH ROW EXECUTE FUNCTION public.update_budget_used_amount();
  END IF;
END $$;
