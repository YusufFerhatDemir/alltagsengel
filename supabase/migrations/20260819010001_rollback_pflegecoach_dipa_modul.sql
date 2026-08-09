-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK zu 20260819010000_pflegecoach_dipa_modul.sql
-- NUR MANUELL anwenden. Entfernt das komplette coach_*-Datenmodell.
-- ACHTUNG: Löscht DiPA-Nutzerdaten unwiderruflich — vor Anwendung Export/
-- Backup sicherstellen (Art. 20 DSGVO). Reihenfolge: Kinder vor Eltern.
-- ═══════════════════════════════════════════════════════════════════════════

DROP TABLE IF EXISTS coach_audit_log;
DROP FUNCTION IF EXISTS coach_audit_trigger() CASCADE;

DROP TABLE IF EXISTS coach_reports;
DROP TABLE IF EXISTS coach_measurements;
DROP TABLE IF EXISTS coach_activity_log;
DROP TABLE IF EXISTS coach_activities;
DROP TABLE IF EXISTS coach_goals;
DROP TABLE IF EXISTS coach_assessments;
DROP TABLE IF EXISTS coach_shares;
DROP TABLE IF EXISTS coach_consents;
DROP TABLE IF EXISTS coach_users;

DROP FUNCTION IF EXISTS coach_set_updated_at();
