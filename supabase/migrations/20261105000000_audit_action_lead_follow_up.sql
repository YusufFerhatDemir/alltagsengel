-- Audit-Action für den täglichen Lead-Follow-up-Lauf (Kette 13).
--
-- WARUM ES DIESE MIGRATION BRAUCHT
-- `mis_audit_log.action` trägt einen CHECK mit einer festen Werteliste. Ein
-- unbekannter Wert lässt den Insert lautlos scheitern — der Lauf selbst
-- läuft weiter, aber die Spur fehlt. Genau deshalb kann die Kette ihren
-- eigenen Lauf bisher nicht protokollieren.
--
-- WAS DIE KETTE HEUTE SCHON HINTERLÄSST
-- Eine `notifications`-Zeile je Empfänger und Tag, mit der vollständigen
-- Zählung in `data` (Warteliste/Bewerbungen/Anfragen, je Stufe). Das ist ein
-- brauchbarer Beleg für einen Lauf, an dem etwas fällig WAR.
--
-- WAS FEHLT UND WAS DIESE ACTION NACHTRÄGT
-- Der Lauf ohne Fälligkeiten und der Lauf mit Lesefehler hinterlassen heute
-- nichts. „Keine Meldung" und „nicht gelaufen" sind dadurch nicht
-- unterscheidbar — und das ist die Frage, die man nach einem Rückstand als
-- Erste stellt.
--
-- STAND: geschrieben 12.09.2026, NICHT angewendet. DDL ist aus der
-- Agentensitzung nicht möglich (42501). Bis zur Anwendung meldet
-- logAuditEventOrWarn eine „AUDIT-LUECKE" ins Log — sichtbar, nicht still.
-- Rollback: 20261105000001_rollback_audit_action_lead_follow_up.sql

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
    'marketing_kampagne_versand_abgebrochen',
    -- Lead-Follow-up (Kette 13), 12.09.2026
    'lead_follow_up_lauf'
  ));
