-- ════════════════════════════════════════════════════════════════════
-- ROLLBACK zu 20260910010000_audit_logs_unveraenderlich.sql
-- ════════════════════════════════════════════════════════════════════
-- ACHTUNG: Danach sind assignment_audit_log und service_record_audit_log
-- wieder ueber jeden RLS-freien Weg (Service-Role, SECURITY DEFINER,
-- direkter DB-Zugriff) aenderbar und loeschbar. Die RLS-Seite bleibt
-- unberuehrt — authenticated hat weiterhin keine UPDATE/DELETE-Policy.
-- Nur ausfuehren, wenn die Haertung nachweislich einen Produktionsweg bricht.
-- ════════════════════════════════════════════════════════════════════

BEGIN;

DROP TRIGGER IF EXISTS trg_immutable_sr_audit_update ON public.service_record_audit_log;
DROP TRIGGER IF EXISTS trg_immutable_sr_audit_delete ON public.service_record_audit_log;
DROP FUNCTION IF EXISTS public.prevent_service_record_audit_edit();

DROP TRIGGER IF EXISTS trg_immutable_as_audit_update ON public.assignment_audit_log;
DROP TRIGGER IF EXISTS trg_immutable_as_audit_delete ON public.assignment_audit_log;
DROP FUNCTION IF EXISTS public.prevent_assignment_audit_edit();

COMMIT;
