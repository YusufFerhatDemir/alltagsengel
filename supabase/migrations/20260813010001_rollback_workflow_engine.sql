-- ============================================================================
-- ROLLBACK: Workflow-Engine + Automatisierungen
-- Undoes:   20260813010000_workflow_engine.sql
-- Drops all tables, views, functions, triggers, policies, indexes created
-- by the forward migration, in REVERSE order.
-- ============================================================================

BEGIN;

-- ═══════════════════════════════════════════════════════════════
-- TEIL 16 (reverse): Views
-- ═══════════════════════════════════════════════════════════════

DROP VIEW IF EXISTS public.wf_statistik;
DROP VIEW IF EXISTS public.wf_dead_letter_uebersicht;
DROP VIEW IF EXISTS public.wf_queue_status;
DROP VIEW IF EXISTS public.wf_events_dashboard;

-- ═══════════════════════════════════════════════════════════════
-- TEIL 15 (reverse): Source-Table Triggers + Functions
-- (triggers on external tables that emit workflow events)
-- ═══════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_wf_aufgabe_ueberfaellig ON public.ops_aufgaben;
DROP FUNCTION IF EXISTS public.wf_trigger_aufgabe_ueberfaellig();

DROP TRIGGER IF EXISTS trg_wf_dienstplan ON public.dienstplan_eintraege;
DROP FUNCTION IF EXISTS public.wf_trigger_dienstplan();

DROP TRIGGER IF EXISTS trg_wf_zahlung ON public.payments;
DROP FUNCTION IF EXISTS public.wf_trigger_zahlung();

DROP TRIGGER IF EXISTS trg_wf_dta_fehler ON public.dta_fehlerprotokoll;
DROP FUNCTION IF EXISTS public.wf_trigger_dta_fehler();

DROP TRIGGER IF EXISTS trg_wf_dta_ruecklaeufer ON public.dta_ruecklaeufer;
DROP FUNCTION IF EXISTS public.wf_trigger_dta_ruecklaeufer();

-- ═══════════════════════════════════════════════════════════════
-- TEIL 14 (reverse): Function wf_check_fristen
-- ═══════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.wf_check_fristen();

-- ═══════════════════════════════════════════════════════════════
-- TEIL 13 (reverse): Function wf_process_pending
-- ═══════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.wf_process_pending(integer);

-- ═══════════════════════════════════════════════════════════════
-- TEIL 12 (reverse): Function wf_execute_queue_item
-- ═══════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.wf_execute_queue_item(uuid);

-- ═══════════════════════════════════════════════════════════════
-- TEIL 11 (reverse): Function wf_evaluate_conditions
-- ═══════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.wf_evaluate_conditions(jsonb, jsonb);

-- ═══════════════════════════════════════════════════════════════
-- TEIL 10 (reverse): Function wf_process_event
-- ═══════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.wf_process_event(uuid);

-- ═══════════════════════════════════════════════════════════════
-- TEIL 9 (reverse): Function wf_emit_event
-- ═══════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.wf_emit_event(uuid, text, text, text, uuid, jsonb, text, text, uuid);

-- ═══════════════════════════════════════════════════════════════
-- TEIL 8 (reverse): updated_at Triggers on wf_regeln, wf_warteschlange
-- ═══════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_updated_at_wf_warteschlange ON public.wf_warteschlange;
DROP TRIGGER IF EXISTS trg_updated_at_wf_regeln ON public.wf_regeln;

-- ═══════════════════════════════════════════════════════════════
-- TEIL 7 (reverse): wf_audit_log (immutable triggers + functions + table)
-- ═══════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_wf_audit_immutable_delete ON public.wf_audit_log;
DROP TRIGGER IF EXISTS trg_wf_audit_immutable_update ON public.wf_audit_log;
DROP FUNCTION IF EXISTS public.prevent_wf_audit_delete();
DROP FUNCTION IF EXISTS public.prevent_wf_audit_update();

DROP POLICY IF EXISTS wf_audit_admin_all ON public.wf_audit_log;
DROP POLICY IF EXISTS wf_audit_org_fence ON public.wf_audit_log;

DROP INDEX IF EXISTS public.idx_wf_audit_org_created;

DROP TABLE IF EXISTS public.wf_audit_log CASCADE;

-- ═══════════════════════════════════════════════════════════════
-- TEIL 6 (reverse): wf_dead_letter
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS wf_dead_letter_admin_all ON public.wf_dead_letter;
DROP POLICY IF EXISTS wf_dead_letter_org_fence ON public.wf_dead_letter;

DROP TABLE IF EXISTS public.wf_dead_letter CASCADE;

-- ═══════════════════════════════════════════════════════════════
-- TEIL 5 (reverse): wf_warteschlange
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS wf_warteschlange_admin_all ON public.wf_warteschlange;
DROP POLICY IF EXISTS wf_warteschlange_org_fence ON public.wf_warteschlange;

DROP INDEX IF EXISTS public.idx_wf_queue_pending;

DROP TABLE IF EXISTS public.wf_warteschlange CASCADE;

-- ═══════════════════════════════════════════════════════════════
-- TEIL 4 (reverse): wf_ausfuehrungen
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS wf_ausfuehrungen_admin_all ON public.wf_ausfuehrungen;
DROP POLICY IF EXISTS wf_ausfuehrungen_org_fence ON public.wf_ausfuehrungen;

DROP INDEX IF EXISTS public.idx_wf_ausfuehrungen_status;
DROP INDEX IF EXISTS public.idx_wf_ausfuehrungen_event;

DROP TABLE IF EXISTS public.wf_ausfuehrungen CASCADE;

-- ═══════════════════════════════════════════════════════════════
-- TEIL 3 (reverse): wf_aktionen
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS wf_aktionen_admin_all ON public.wf_aktionen;
DROP POLICY IF EXISTS wf_aktionen_org_fence ON public.wf_aktionen;

DROP TABLE IF EXISTS public.wf_aktionen CASCADE;

-- ═══════════════════════════════════════════════════════════════
-- TEIL 2 (reverse): wf_regeln
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS wf_regeln_admin_all ON public.wf_regeln;
DROP POLICY IF EXISTS wf_regeln_org_fence ON public.wf_regeln;

DROP INDEX IF EXISTS public.idx_wf_regeln_event_typ;

DROP TABLE IF EXISTS public.wf_regeln CASCADE;

-- ═══════════════════════════════════════════════════════════════
-- TEIL 1 (reverse): wf_events
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS wf_events_admin_all ON public.wf_events;
DROP POLICY IF EXISTS wf_events_org_fence ON public.wf_events;

DROP INDEX IF EXISTS public.idx_wf_events_org_created;
DROP INDEX IF EXISTS public.idx_wf_events_typ;
DROP INDEX IF EXISTS public.idx_wf_events_status;

DROP TABLE IF EXISTS public.wf_events CASCADE;

COMMIT;
