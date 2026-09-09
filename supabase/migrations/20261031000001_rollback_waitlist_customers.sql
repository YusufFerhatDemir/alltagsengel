-- Rollback: Kunden-Warteliste (20261031000000)
--
-- ACHTUNG: DROP TABLE loescht die eingegangenen Vormerkungen. Vor dem
-- Ausfuehren sichern:
--   COPY public.waitlist_customers TO '/tmp/warteliste.csv' CSV HEADER;

BEGIN;

DROP TRIGGER IF EXISTS trg_waitlist_customers_updated_at ON public.waitlist_customers;
DROP FUNCTION IF EXISTS public.tg_waitlist_customers_updated_at();

DROP POLICY IF EXISTS "Admin full access waitlist_customers" ON public.waitlist_customers;

DROP INDEX IF EXISTS public.uq_waitlist_customers_email;
DROP INDEX IF EXISTS public.uq_waitlist_customers_phone;
DROP INDEX IF EXISTS public.idx_waitlist_customers_eingang;
DROP INDEX IF EXISTS public.idx_waitlist_customers_status;

DROP TABLE IF EXISTS public.waitlist_customers;

COMMIT;
