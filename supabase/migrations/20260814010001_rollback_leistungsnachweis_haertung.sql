-- ============================================================================
-- ROLLBACK: Leistungsnachweis & Monatsabschluss — DB-Härtung
-- Undoes:   20260814010000_leistungsnachweis_haertung.sql
-- Drops the restored objects (audit table, triggers, functions, columns,
-- indexes) that the forward migration re-created after a prior rollback.
-- All statements in REVERSE order with IF EXISTS.
-- ============================================================================

BEGIN;

-- ═══════════════════════════════════════════════════════════════════
-- 7 (reverse): RPC get_monthly_closing_overview — revoke + drop
-- ═══════════════════════════════════════════════════════════════════

REVOKE ALL ON FUNCTION public.get_monthly_closing_overview(date) FROM authenticated;
DROP FUNCTION IF EXISTS public.get_monthly_closing_overview(date);

-- ═══════════════════════════════════════════════════════════════════
-- 6 (reverse): Locked-record-protection trigger + function
-- ═══════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_prevent_locked_record ON public.service_records;
DROP FUNCTION IF EXISTS public.prevent_locked_record_change();

-- ═══════════════════════════════════════════════════════════════════
-- 5 (reverse): Signature-hash trigger + function
-- ═══════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_compute_signature_hash ON public.service_records;
DROP FUNCTION IF EXISTS public.compute_signature_hash();

-- ═══════════════════════════════════════════════════════════════════
-- 4 (reverse): Audit trigger + function
-- ═══════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_audit_service_record ON public.service_records;
DROP FUNCTION IF EXISTS public.audit_service_record_change();

-- ═══════════════════════════════════════════════════════════════════
-- 3 (reverse): service_record_audit_log table + policies + index
-- ═══════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "service_record_audit_log_org_fence" ON public.service_record_audit_log;
DROP POLICY IF EXISTS sr_audit_insert ON public.service_record_audit_log;
DROP POLICY IF EXISTS sr_audit_admin_read ON public.service_record_audit_log;

DROP INDEX IF EXISTS public.idx_sr_audit_record;

DROP TABLE IF EXISTS public.service_record_audit_log CASCADE;

-- ═══════════════════════════════════════════════════════════════════
-- 2 (reverse): Indexes on service_records
-- ═══════════════════════════════════════════════════════════════════

DROP INDEX IF EXISTS public.idx_service_records_date_caregiver;
DROP INDEX IF EXISTS public.idx_service_records_billing_status;
DROP INDEX IF EXISTS public.idx_service_records_proof_status;

-- ═══════════════════════════════════════════════════════════════════
-- 1 (reverse): Columns added to service_records
-- Drop in reverse order of addition.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.service_records DROP COLUMN IF EXISTS bundesland;
ALTER TABLE public.service_records DROP COLUMN IF EXISTS assignment_id;
ALTER TABLE public.service_records DROP COLUMN IF EXISTS leistung_beschreibung;
ALTER TABLE public.service_records DROP COLUMN IF EXISTS gps_end_lng;
ALTER TABLE public.service_records DROP COLUMN IF EXISTS gps_end_lat;
ALTER TABLE public.service_records DROP COLUMN IF EXISTS gps_start_lng;
ALTER TABLE public.service_records DROP COLUMN IF EXISTS gps_start_lat;
ALTER TABLE public.service_records DROP COLUMN IF EXISTS is_locked;
ALTER TABLE public.service_records DROP COLUMN IF EXISTS signature_hash;
ALTER TABLE public.service_records DROP COLUMN IF EXISTS client_signer_role;
ALTER TABLE public.service_records DROP COLUMN IF EXISTS client_signer_name;
ALTER TABLE public.service_records DROP COLUMN IF EXISTS client_signed_at;
ALTER TABLE public.service_records DROP COLUMN IF EXISTS caregiver_confirmed_at;
ALTER TABLE public.service_records DROP COLUMN IF EXISTS billing_type;
ALTER TABLE public.service_records DROP COLUMN IF EXISTS billing_status;
ALTER TABLE public.service_records DROP COLUMN IF EXISTS proof_status;

COMMIT;
