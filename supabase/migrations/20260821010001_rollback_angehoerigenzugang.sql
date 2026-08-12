-- Rollback: Angehörigenzugang
BEGIN;

DROP TABLE IF EXISTS public.angehoerigen_benachrichtigungen CASCADE;
DROP TABLE IF EXISTS public.angehoerigen_audit_log CASCADE;
DROP TABLE IF EXISTS public.angehoerigen_nachrichten CASCADE;
DROP TABLE IF EXISTS public.angehoerigen_zugaenge CASCADE;

COMMIT;
