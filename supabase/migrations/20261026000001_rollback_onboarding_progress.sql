-- Rollback zu 20261026000000_onboarding_progress.sql
BEGIN;
DROP TRIGGER IF EXISTS trg_onboarding_progress_updated_at ON public.onboarding_progress;
DROP FUNCTION IF EXISTS public.trg_onboarding_progress_updated_at();
DROP POLICY IF EXISTS org_fence_onboarding_progress ON public.onboarding_progress;
DROP POLICY IF EXISTS onboarding_progress_admin ON public.onboarding_progress;
DROP POLICY IF EXISTS onboarding_progress_eigene ON public.onboarding_progress;
DROP TABLE IF EXISTS public.onboarding_progress;
COMMIT;
