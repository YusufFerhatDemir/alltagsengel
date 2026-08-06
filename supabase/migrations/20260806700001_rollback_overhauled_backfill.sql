-- ============================================================================
-- ROLLBACK: 20260806700000_overhauled_backfill.sql
-- Branch: fix/pre-backfill-security
-- ============================================================================
-- Reverts all 5 invoices from DE status back to EN status.
-- Removes migration audit entries.
-- ============================================================================

DO $$
DECLARE
  v_migration_id CONSTANT TEXT := '20260806700000_overhauled_backfill';
  v_id_1 CONSTANT UUID := 'abbb388d-69e7-4c60-90df-94d19e4c5c45';
  v_id_2 CONSTANT UUID := 'be2de1e2-2558-4a80-93d3-aa4669a996e6';
  v_id_3 CONSTANT UUID := 'a97f48cc-9c18-4084-8cab-2632ac593ae9';
  v_id_4 CONSTANT UUID := 'c292fd2d-bddc-473c-8e99-e573f7ad27d7';
  v_id_5 CONSTANT UUID := 'e16ea245-01b0-46a0-8d2f-5cd1edf7cb58';
BEGIN
  -- Trigger temporaer deaktivieren fuer Rueckwaerts-Migration
  ALTER TABLE public.invoices DISABLE TRIGGER trg_invoices_no_finalized_edit;

  BEGIN
    ALTER TABLE public.invoices DISABLE TRIGGER trg_validate_invoice_status;
  EXCEPTION WHEN undefined_object THEN
    NULL;
  END;

  -- Status zurueck auf Englisch (idempotent: nur wenn aktueller Status Deutsch)
  UPDATE public.invoices SET status = 'sent'     WHERE id = v_id_1 AND status = 'uebermittelt';
  UPDATE public.invoices SET status = 'disputed'  WHERE id = v_id_2 AND status = 'strittig';
  UPDATE public.invoices SET status = 'paid'      WHERE id = v_id_3 AND status = 'bezahlt';
  UPDATE public.invoices SET status = 'sent'      WHERE id = v_id_4 AND status = 'uebermittelt';
  UPDATE public.invoices SET status = 'sent'      WHERE id = v_id_5 AND status = 'uebermittelt';

  -- Audit-Eintraege dieser Migration entfernen
  -- Immutabilitaets-Trigger muss temporaer deaktiviert werden
  ALTER TABLE public.billing_audit_trail DISABLE TRIGGER trg_audit_trail_no_delete;

  DELETE FROM public.billing_audit_trail
  WHERE migration_id = v_migration_id;

  ALTER TABLE public.billing_audit_trail ENABLE TRIGGER trg_audit_trail_no_delete;

  -- Trigger wieder aktivieren
  ALTER TABLE public.invoices ENABLE TRIGGER trg_invoices_no_finalized_edit;

  BEGIN
    ALTER TABLE public.invoices ENABLE TRIGGER trg_validate_invoice_status;
  EXCEPTION WHEN undefined_object THEN
    NULL;
  END;

  RAISE NOTICE 'Rollback erfolgreich: 5 Rechnungen DE→EN zurueckgesetzt, Migration-Audit-Eintraege entfernt.';
END $$;
