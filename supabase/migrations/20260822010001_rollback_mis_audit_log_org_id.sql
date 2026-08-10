-- Rollback: 20260822010000_mis_audit_log_org_id.sql

DROP INDEX IF EXISTS public.idx_mis_audit_log_org;
DROP POLICY IF EXISTS "mis_audit_log_anon_deny" ON public.mis_audit_log;
DROP POLICY IF EXISTS "mis_audit_log_org_fence" ON public.mis_audit_log;
ALTER TABLE public.mis_audit_log ALTER COLUMN organization_id DROP DEFAULT;
ALTER TABLE public.mis_audit_log DROP COLUMN IF EXISTS organization_id;
