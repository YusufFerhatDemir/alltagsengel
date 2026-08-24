-- Rollback zu 20261003000000_camt_buchungsdublette.sql
BEGIN;
DROP INDEX IF EXISTS public.uq_zahlungseingaenge_org_buchungshash;
COMMIT;
