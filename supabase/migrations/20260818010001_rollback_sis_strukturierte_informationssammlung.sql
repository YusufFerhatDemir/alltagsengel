-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK zu 20260818010000_sis_strukturierte_informationssammlung.sql
-- Entfernt ausschließlich die dort neu angelegten Objekte.
-- ACHTUNG: DROP TABLE entfernt auch erfasste SIS-Daten — nur nutzen, wenn das
-- Modul zurückgebaut werden soll.
-- ═══════════════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_locked_sis_risikomatrix ON sis_risikomatrix;
DROP TRIGGER IF EXISTS trg_locked_sis_themenfelder ON sis_themenfelder;
DROP TRIGGER IF EXISTS trg_locked_sis ON sis_assessments;
DROP TRIGGER IF EXISTS trg_updated_at_sis_risikomatrix ON sis_risikomatrix;
DROP TRIGGER IF EXISTS trg_updated_at_sis_themenfelder ON sis_themenfelder;
DROP TRIGGER IF EXISTS trg_updated_at_sis_assessments ON sis_assessments;

DROP FUNCTION IF EXISTS prevent_locked_sis_child_edit();
DROP FUNCTION IF EXISTS prevent_locked_sis_edit();

DROP TABLE IF EXISTS sis_risikomatrix;
DROP TABLE IF EXISTS sis_themenfelder;
DROP TABLE IF EXISTS sis_assessments;
