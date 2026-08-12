-- Rollback: 20260819020000_billing_org_fence_haertung.sql
-- Die org_fence Policies zuruecknehmen.
-- ACHTUNG: Phase-3-Migration hat diese Policies initial erstellt;
-- dieser Rollback entfernt NUR die in 20260819020000 angelegten.

DROP POLICY IF EXISTS "invoices_org_fence" ON public.invoices;
DROP POLICY IF EXISTS "invoices_anon_deny" ON public.invoices;

DROP POLICY IF EXISTS "invoice_items_org_fence" ON public.invoice_items;
DROP POLICY IF EXISTS "invoice_items_anon_deny" ON public.invoice_items;

DROP POLICY IF EXISTS "invoice_disputes_org_fence" ON public.invoice_disputes;
