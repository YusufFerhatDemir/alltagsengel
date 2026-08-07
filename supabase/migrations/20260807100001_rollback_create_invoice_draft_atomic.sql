-- ════════════════════════════════════════════════════════════════════════════
-- Rollback: Atomare Rechnungserstellung entfernen
-- Datum: 2026-08-07
-- Branch: feature/unified-invoice-creation
--
-- Entfernt die transaktionale RPC-Funktion und den Rueckgabetyp.
-- Keine Datenänderung. Bestehende Rechnungen bleiben erhalten.
-- ════════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.create_invoice_draft_atomic(UUID, UUID, TEXT, TEXT, UUID, TEXT, TEXT);
DROP TYPE IF EXISTS public.create_invoice_draft_result;
