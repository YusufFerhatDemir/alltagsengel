-- ════════════════════════════════════════════════════════════════════
-- Rollback: Block 20 — Sync-Server-Persistenz (sync_audit_log,
-- sync_konflikte). Reihenfolge unkritisch (keine FK zwischen beiden).
-- ════════════════════════════════════════════════════════════════════

BEGIN;

DROP TABLE IF EXISTS public.sync_konflikte;
DROP TABLE IF EXISTS public.sync_audit_log;

COMMIT;
