-- ============================================================================
-- ROLLBACK: 20260806600001_fix_finalized_edit.sql
-- Branch: fix/pre-backfill-security
-- ============================================================================
-- Reverts prevent_finalized_invoice_mutation() to the old version that
-- only checked 'versendet', 'bezahlt', 'storniert'.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.prevent_finalized_invoice_mutation()
RETURNS TRIGGER AS $$
BEGIN
  -- Alte Version: nur 3 Status geschuetzt
  IF OLD.status NOT IN ('versendet', 'bezahlt', 'storniert') THEN
    RETURN NEW;
  END IF;

  -- Alte Version: alle Felder blockiert (nicht feldspezifisch)
  RAISE EXCEPTION
    'Rechnung im Status % kann nicht mehr bearbeitet werden.',
    OLD.status;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger bleibt bestehen, Funktion wurde per CREATE OR REPLACE ersetzt
