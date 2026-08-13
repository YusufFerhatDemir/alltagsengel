-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK zu 20260905000000_fix_wf_trigger_zahlung.sql
-- ═══════════════════════════════════════════════════════════════════════════
-- WARNUNG: Dieser Rollback stellt den DEFEKTEN Stand aus
-- 20260813010000_workflow_engine.sql wieder her. Danach scheitert jeder
-- INSERT auf public.payments erneut mit 42703 (NEW.invoice_id existiert
-- nicht). Nur ausführen, wenn der Ursprungszustand bewusst gewünscht ist.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION public.wf_trigger_zahlung()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.wf_emit_event(
    NEW.organization_id,
    'zahlung_eingegangen',
    'forderungen',
    'payments',
    NEW.id,
    jsonb_build_object('amount_cents', NEW.amount_cents, 'invoice_id', NEW.invoice_id)
  );
  RETURN NEW;
END;
$$;

COMMIT;
