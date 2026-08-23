-- Rollback zu 20260823000000_invoice_email_log.sql
DROP POLICY IF EXISTS org_fence_invoice_email_log ON public.invoice_email_log;
DROP POLICY IF EXISTS invoice_email_log_admin ON public.invoice_email_log;
DROP TABLE IF EXISTS public.invoice_email_log;
