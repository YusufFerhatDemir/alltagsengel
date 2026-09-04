-- Rollback zu 20261027000000_lead_inquiries_bewerbung.sql
BEGIN;
DROP INDEX IF EXISTS public.idx_lead_inquiries_bewerbungen;
DROP INDEX IF EXISTS public.uq_lead_inquiries_bewerbung_je_ablauf;
ALTER TABLE public.lead_inquiries
  DROP CONSTRAINT IF EXISTS lead_inquiries_onboarding_progress_fkey,
  DROP CONSTRAINT IF EXISTS lead_inquiries_art_check;
ALTER TABLE public.lead_inquiries
  DROP COLUMN IF EXISTS eingereicht_am,
  DROP COLUMN IF EXISTS onboarding_progress_id,
  DROP COLUMN IF EXISTS bewerbung_daten,
  DROP COLUMN IF EXISTS art,
  DROP COLUMN IF EXISTS email;
COMMIT;
