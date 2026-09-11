-- Rollback: state_waitlist Kunden-Funnel-Spalten (20261102000000)
--
-- ACHTUNG: Die Spalten tragen Daten aus dem /warteliste-Formular
-- (Pflegegrad, gewuenschte Leistungen, Nachricht, Bearbeitungsstand).
-- Vor dem Ausfuehren sichern:
--   COPY (SELECT id, pflegegrad, gewuenschte_leistungen, nachricht, status,
--                utm_medium, utm_campaign
--           FROM public.state_waitlist)
--     TO '/tmp/state_waitlist_kundenfunnel.csv' CSV HEADER;

BEGIN;

DROP INDEX IF EXISTS public.idx_state_waitlist_status;

ALTER TABLE public.state_waitlist
  DROP CONSTRAINT IF EXISTS state_waitlist_status_check,
  DROP CONSTRAINT IF EXISTS state_waitlist_pflegegrad_check;

ALTER TABLE public.state_waitlist
  DROP COLUMN IF EXISTS pflegegrad,
  DROP COLUMN IF EXISTS gewuenschte_leistungen,
  DROP COLUMN IF EXISTS nachricht,
  DROP COLUMN IF EXISTS status,
  DROP COLUMN IF EXISTS utm_medium,
  DROP COLUMN IF EXISTS utm_campaign;

COMMIT;
