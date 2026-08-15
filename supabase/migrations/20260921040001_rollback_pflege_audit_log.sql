-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK zu 20260921040000_pflege_audit_log.sql
-- ═══════════════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_pflege_audit_log_immutable_update ON public.pflege_audit_log;
DROP TRIGGER IF EXISTS trg_pflege_audit_log_immutable_delete ON public.pflege_audit_log;
DROP FUNCTION IF EXISTS public.prevent_pflege_audit_log_update();
DROP FUNCTION IF EXISTS public.prevent_pflege_audit_log_delete();

DROP TABLE IF EXISTS public.pflege_audit_log;
