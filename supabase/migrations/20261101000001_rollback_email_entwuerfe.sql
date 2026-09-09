-- Rollback: E-Mail-Entwürfe (20261101000000)
--
-- ACHTUNG: DROP TABLE verwirft alle vorbereiteten Entwürfe samt der
-- Versandbelege (provider_id, gesendet_am). Vorher sichern:
--   COPY public.email_entwuerfe TO '/tmp/email_entwuerfe.csv' CSV HEADER;

BEGIN;

DROP TRIGGER IF EXISTS trg_email_entwuerfe_updated_at ON public.email_entwuerfe;
DROP FUNCTION IF EXISTS public.tg_email_entwuerfe_updated_at();
DROP POLICY IF EXISTS "Admin full access email_entwuerfe" ON public.email_entwuerfe;
DROP INDEX IF EXISTS public.uq_email_entwuerfe_bezug;
DROP INDEX IF EXISTS public.idx_email_entwuerfe_offen;
DROP TABLE IF EXISTS public.email_entwuerfe;

COMMIT;
