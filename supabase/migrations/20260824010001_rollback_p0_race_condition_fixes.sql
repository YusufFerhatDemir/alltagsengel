-- Rollback: P0 Race Condition Fixes
-- Entfernt idempotency_key, stellt Original-RPCs wieder her

DROP INDEX IF EXISTS idx_abrechnungslaeufe_idempotency;
ALTER TABLE public.abrechnungslaeufe DROP COLUMN IF EXISTS idempotency_key;

-- Original wf_process_event und wf_execute_queue_item werden
-- durch erneutes Ausfuehren von 20260813010000_workflow_engine.sql
-- wiederhergestellt.
