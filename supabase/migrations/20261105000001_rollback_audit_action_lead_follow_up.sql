-- Rollback zu 20261105000000_audit_action_lead_follow_up.sql
--
-- ACHTUNG: Bestehende Zeilen mit action = 'lead_follow_up_lauf' verletzen den
-- alten CHECK. Ein Rollback mit vorhandenen Zeilen scheitert deshalb — das
-- ist beabsichtigt: ein Audit-Eintrag wird nicht weggeworfen, um eine
-- Einschränkung wiederherzustellen. Erst entscheiden, was mit den Zeilen
-- geschieht, dann zurückrollen.

ALTER TABLE public.mis_audit_log
  DROP CONSTRAINT IF EXISTS mis_audit_log_action_check;

ALTER TABLE public.mis_audit_log
  ADD CONSTRAINT mis_audit_log_action_check
  CHECK (action IN (
    'create','read','update','delete','download','approve','reject','share','archive',
    'password_reset','role_grant','role_revoke','user_delete','user_self_delete',
    'user_self_soft_delete','user_self_undelete','user_hard_delete_cron',
    'data_export','admin_login','rate_limit_reset',
    'marketing_kampagne_freigegeben','marketing_kampagne_versendet',
    'marketing_kampagne_versand_abgebrochen'
  ));
