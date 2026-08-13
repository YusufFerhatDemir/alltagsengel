-- ═══════════════════════════════════════════════════════════════════
-- ROLLBACK zu 20260901020000_invoice_due_date_default.sql
-- ═══════════════════════════════════════════════════════════════════
--
-- Setzt Trigger, Funktion und Spalten-Default zurück.
-- Der Backfill wird NICHT zurückgerollt: die gesetzten Fälligkeiten sind
-- fachlich richtig abgeleitet, und ein Zurücksetzen auf NULL würde OPOS und
-- Mahnwesen wieder blind machen.
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

DROP TRIGGER IF EXISTS trg_set_invoice_due_date ON public.invoices;
DROP FUNCTION IF EXISTS public.set_invoice_due_date();

ALTER TABLE public.invoices
  ALTER COLUMN payment_terms_days SET DEFAULT 30;

COMMIT;
