-- ROLLBACK: 20260808200000_einsatzplanung_leistungsnachweise.sql
BEGIN;

DROP TRIGGER IF EXISTS trg_check_billing_gate ON public.service_records;
DROP FUNCTION IF EXISTS public.check_billing_gate();
DROP TRIGGER IF EXISTS trg_sr_bundesland ON public.service_records;
DROP FUNCTION IF EXISTS public.service_record_set_bundesland();
DROP TRIGGER IF EXISTS trg_audit_service_record ON public.service_records;
DROP FUNCTION IF EXISTS public.audit_service_record_change();
DROP TRIGGER IF EXISTS trg_compute_signature_hash ON public.service_records;
DROP FUNCTION IF EXISTS public.compute_signature_hash();
DROP TRIGGER IF EXISTS trg_prevent_locked_record ON public.service_records;
DROP FUNCTION IF EXISTS public.prevent_locked_record_change();
DROP TRIGGER IF EXISTS trg_assignment_bundesland ON public.assignments;
DROP FUNCTION IF EXISTS public.assignment_set_bundesland();
DROP TRIGGER IF EXISTS trg_check_assignment_overlap ON public.assignments;
DROP FUNCTION IF EXISTS public.check_assignment_overlap();
DROP FUNCTION IF EXISTS public.get_monthly_closing_overview(date);
DROP FUNCTION IF EXISTS public.get_calendar_assignments(date,date,uuid,uuid,text,text);

DROP TABLE IF EXISTS public.budget_reservations CASCADE;
DROP TABLE IF EXISTS public.assignment_audit_log CASCADE;
DROP TABLE IF EXISTS public.service_record_audit_log CASCADE;

COMMIT;
