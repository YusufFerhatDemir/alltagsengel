-- Rollback zu 20261001010000_vpkzp_mandantenpaarung.sql

BEGIN;

DROP TRIGGER IF EXISTS trg_vpkzp_mandantenpaarung ON public.vpkzp_buchungen;
DROP FUNCTION IF EXISTS public.trg_vpkzp_mandantenpaarung();

COMMIT;
