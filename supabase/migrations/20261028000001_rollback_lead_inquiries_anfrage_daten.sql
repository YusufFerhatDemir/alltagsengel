-- Rollback zu 20261028000000_lead_inquiries_anfrage_daten.sql
BEGIN;
ALTER TABLE public.lead_inquiries DROP COLUMN IF EXISTS anfrage_daten;
COMMIT;
