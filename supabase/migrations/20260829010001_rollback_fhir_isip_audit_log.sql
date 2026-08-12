-- ════════════════════════════════════════════════════════════════════
-- Rollback: Block 21 — FHIR / ISiP Interoperabilität (fhir_audit_log)
-- ════════════════════════════════════════════════════════════════════

BEGIN;

DROP TABLE IF EXISTS public.fhir_audit_log;

COMMIT;
