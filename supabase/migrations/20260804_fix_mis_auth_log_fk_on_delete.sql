-- ============================================================================
-- Migration: FK mis_auth_log_user_id_fkey auf ON DELETE SET NULL ändern
-- Datum:     2026-08-04
-- Grund:     DSGVO Art. 17 — Benutzerlöschung wird durch NO ACTION FK blockiert
-- Auswirkung: Audit-Log-Einträge bleiben erhalten, user_id wird NULL nach Löschung
-- Rollback:  audit/rollback/ROLLBACK_MIS_AUTH_LOG_FK.sql
-- ============================================================================

-- Spalte user_id ist bereits NULLABLE (is_nullable = YES in Produktion).
-- Daher kein ALTER COLUMN ... DROP NOT NULL nötig.

-- Schritt 1: Bestehenden FK entfernen (idempotent)
ALTER TABLE public.mis_auth_log
  DROP CONSTRAINT IF EXISTS mis_auth_log_user_id_fkey;

-- Schritt 2: FK mit ON DELETE SET NULL neu erstellen
ALTER TABLE public.mis_auth_log
  ADD CONSTRAINT mis_auth_log_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
