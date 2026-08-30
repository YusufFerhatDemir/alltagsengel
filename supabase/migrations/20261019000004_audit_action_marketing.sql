-- ═══════════════════════════════════════════════════════════════════════════
-- mis_audit_log: Aktionen für den Werbeversand
--
-- WARUM DIESE MIGRATION NOETIG IST
-- `mis_audit_log.action` traegt einen CHECK. Ein unbekannter Wert laesst
-- den Insert mit 23514 scheitern — und weil der Audit-Weg bewusst fail-soft
-- ist (logAuditEventOrWarn meldet nur), waere die Folge ein Massenversand
-- OHNE Spur, wer ihn ausgeloest hat. Der Versand liefe, das Protokoll
-- bliebe leer, und niemand merkte es.
--
-- WARUM NICHT EIN VORHANDENER WERT
-- 'share' oder 'create' waeren technisch moeglich und fachlich falsch. Ein
-- Werbeversand ist der einzige Vorgang im System, der in einem Zug hunderte
-- Menschen erreicht und sich nicht zuruecknehmen laesst. Er unter 'create'
-- zu fuehren hiesse, ihn in der Forensik nicht von der Anlage eines
-- Datensatzes unterscheiden zu koennen.
--
-- DREI NEUE WERTE
--   marketing_kampagne_freigegeben        — ein Mensch hat freigegeben
--   marketing_kampagne_versendet          — der Versand lief
--   marketing_kampagne_versand_abgebrochen— die Tore haben ihn gestoppt
--
-- Der Abbruch gehoert ausdruecklich dazu: „hat jemand versucht zu senden
-- und wurde gestoppt" ist die Frage, die man nach einem Zwischenfall
-- stellt.
--
-- Die Liste ist der Stand aus 20260419000100 plus diesen drei Werten.
-- Spiegel in TypeScript: AuditAction in lib/audit-log.ts.
--
-- Rollback: 20261019000005_rollback_audit_action_marketing.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.mis_audit_log
  DROP CONSTRAINT IF EXISTS mis_audit_log_action_check;

ALTER TABLE public.mis_audit_log
  ADD CONSTRAINT mis_audit_log_action_check
  CHECK (action IN (
    -- Legacy MIS-Actions
    'create','read','update','delete','download','approve','reject','share','archive',
    -- Auth-Events
    'password_reset',
    'role_grant',
    'role_revoke',
    'user_delete',
    'user_self_delete',
    'user_self_soft_delete',
    'user_self_undelete',
    'user_hard_delete_cron',
    'data_export',
    'admin_login',
    'rate_limit_reset',
    -- Werbeversand (Block 20)
    'marketing_kampagne_freigegeben',
    'marketing_kampagne_versendet',
    'marketing_kampagne_versand_abgebrochen'
  ));

COMMIT;
