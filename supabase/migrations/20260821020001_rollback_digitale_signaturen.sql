-- Rollback: Digitale Signaturen
BEGIN;

DROP TABLE IF EXISTS public.qes_hooks CASCADE;
DROP TABLE IF EXISTS public.signatur_audit_log CASCADE;
DROP TABLE IF EXISTS public.signaturen CASCADE;
DROP TABLE IF EXISTS public.signatur_dokumente CASCADE;

COMMIT;
