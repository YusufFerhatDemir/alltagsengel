-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK zu 20260818010000_vitalwerte.sql
-- ACHTUNG: Entfernt beide Tabellen inklusive aller erfassten Messwerte und
-- Grenzwerte. Nur ausführen, wenn das Modul komplett zurückgebaut werden soll.
-- ═══════════════════════════════════════════════════════════════════════════

DROP TABLE IF EXISTS vital_sign_thresholds;
DROP TABLE IF EXISTS vital_signs;
