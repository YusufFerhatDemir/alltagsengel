-- Rollback zu 20260926000000_vpkzp_zeitraum_budget.sql
BEGIN;

DROP TRIGGER IF EXISTS trg_vpkzp_audit_unveraenderlich ON public.vpkzp_audit_log;
DROP TRIGGER IF EXISTS trg_vpkzp_usage_abgeleitet ON public.client_vpkzp_usage;
DROP TRIGGER IF EXISTS trg_vpkzp_audit ON public.vpkzp_buchungen;
DROP TRIGGER IF EXISTS trg_vpkzp_fortschreibung ON public.vpkzp_buchungen;

DROP FUNCTION IF EXISTS public.trg_vpkzp_audit_unveraenderlich();
DROP FUNCTION IF EXISTS public.trg_vpkzp_usage_abgeleitet();
DROP FUNCTION IF EXISTS public.trg_vpkzp_audit();
DROP FUNCTION IF EXISTS public.trg_vpkzp_fortschreibung();
DROP FUNCTION IF EXISTS public.vpkzp_fortschreiben(uuid, uuid, integer, boolean);
DROP FUNCTION IF EXISTS public.vpkzp_max_tage(text, integer);

DROP POLICY IF EXISTS org_fence_vpkzp_audit_log ON public.vpkzp_audit_log;
DROP POLICY IF EXISTS vpkzp_audit_log_admin ON public.vpkzp_audit_log;
DROP POLICY IF EXISTS org_fence_client_vpkzp_usage ON public.client_vpkzp_usage;
DROP POLICY IF EXISTS client_vpkzp_usage_admin ON public.client_vpkzp_usage;
DROP POLICY IF EXISTS org_fence_vpkzp_buchungen ON public.vpkzp_buchungen;
DROP POLICY IF EXISTS vpkzp_buchungen_admin ON public.vpkzp_buchungen;

DROP TABLE IF EXISTS public.vpkzp_audit_log;
DROP TABLE IF EXISTS public.client_vpkzp_usage;
DROP TABLE IF EXISTS public.vpkzp_buchungen;

COMMIT;
