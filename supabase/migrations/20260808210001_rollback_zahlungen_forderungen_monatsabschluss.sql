-- Rollback: 20260808210000_zahlungen_forderungen_monatsabschluss.sql
BEGIN;

DROP TABLE IF EXISTS public.payment_differences CASCADE;
DROP TABLE IF EXISTS public.dunning_entries CASCADE;
DROP TABLE IF EXISTS public.payment_allocations CASCADE;
DROP TABLE IF EXISTS public.payments CASCADE;

ALTER TABLE public.invoices DROP COLUMN IF EXISTS due_date;
ALTER TABLE public.invoices DROP COLUMN IF EXISTS payment_terms_days;
ALTER TABLE public.invoices DROP COLUMN IF EXISTS dunning_level;
ALTER TABLE public.invoices DROP COLUMN IF EXISTS billing_type;
ALTER TABLE public.invoices DROP COLUMN IF EXISTS kostentraeger_name;
ALTER TABLE public.invoices DROP COLUMN IF EXISTS kostentraeger_ik;
ALTER TABLE public.invoices DROP COLUMN IF EXISTS bundesland;

ALTER TABLE public.monthly_closings DROP COLUMN IF EXISTS total_invoiced;
ALTER TABLE public.monthly_closings DROP COLUMN IF EXISTS total_paid;
ALTER TABLE public.monthly_closings DROP COLUMN IF EXISTS total_open;
ALTER TABLE public.monthly_closings DROP COLUMN IF EXISTS missing_signatures;
ALTER TABLE public.monthly_closings DROP COLUMN IF EXISTS blocked_records;
ALTER TABLE public.monthly_closings DROP COLUMN IF EXISTS finalized_at;
ALTER TABLE public.monthly_closings DROP COLUMN IF EXISTS finalized_by;

COMMIT;
