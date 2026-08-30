-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK zu 20261019000004_audit_action_marketing.sql
--
-- Setzt den CHECK auf den Stand von 20260419000100 zurueck.
--
-- ACHTUNG: bereits geschriebene Zeilen mit den drei Marketing-Aktionen
-- verletzen den zurueckgesetzten CHECK. PostgreSQL prueft einen neu
-- angelegten CHECK gegen den Bestand — die Migration schlaegt dann fehl,
-- statt die Zeilen stillschweigend zu behalten. Das ist die richtige
-- Reihenfolge: erst entscheiden, was mit den Protokollzeilen geschieht,
-- dann den CHECK zurueckbauen.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.mis_audit_log
  DROP CONSTRAINT IF EXISTS mis_audit_log_action_check;

ALTER TABLE public.mis_audit_log
  ADD CONSTRAINT mis_audit_log_action_check
  CHECK (action IN (
    'create','read','update','delete','download','approve','reject','share','archive',
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
    'rate_limit_reset'
  ));

COMMIT;
