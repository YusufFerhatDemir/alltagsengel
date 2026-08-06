-- ============================================================================
-- ROLLBACK: PR #35 Reconciliation — invoices_status_check
-- ============================================================================
--
-- Stellt den Constraint auf die urspruenglichen 6 englischen Werte zurueck.
-- ACHTUNG: Nach Rollback koennen keine Rechnungen mit deutschen Statuswerten
-- mehr erstellt werden. Bestehende Rechnungen mit deutschen Werten muessen
-- VORHER zurueck-migriert werden.
-- ============================================================================

ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_status_check;

ALTER TABLE public.invoices ADD CONSTRAINT invoices_status_check CHECK (
  status IN (
    'draft',
    'sent',
    'paid',
    'partial',
    'rejected',
    'disputed'
  )
);
