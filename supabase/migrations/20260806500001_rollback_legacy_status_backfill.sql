-- ============================================================================
-- ROLLBACK: Legacy Status Backfill
-- ============================================================================
--
-- Stellt die englischen Statuswerte wieder her.
-- ============================================================================

ALTER TABLE public.invoices DISABLE TRIGGER trg_invoices_no_finalized_edit;
ALTER TABLE public.invoices DISABLE TRIGGER trg_validate_invoice_status;

UPDATE public.invoices SET status = 'draft'     WHERE status = 'entwurf';
UPDATE public.invoices SET status = 'sent'      WHERE status = 'uebermittelt';
UPDATE public.invoices SET status = 'paid'      WHERE status = 'bezahlt';
UPDATE public.invoices SET status = 'partial'   WHERE status = 'teilweise_bezahlt';
UPDATE public.invoices SET status = 'rejected'  WHERE status = 'abgelehnt';
UPDATE public.invoices SET status = 'disputed'  WHERE status = 'strittig';

ALTER TABLE public.invoices ENABLE TRIGGER trg_invoices_no_finalized_edit;
ALTER TABLE public.invoices ENABLE TRIGGER trg_validate_invoice_status;
