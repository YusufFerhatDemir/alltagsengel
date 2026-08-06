-- ============================================================================
-- ROLLBACK: 20260806600000_audit_security.sql
-- Branch: fix/pre-backfill-security
-- ============================================================================
-- Reverts:
--   1. Drop immutability triggers on billing_audit_trail
--   2. Drop status-audit trigger on invoices
--   3. Drop migration_id, checksum_before, checksum_after columns
--   4. Re-add NOT NULL on actor_id
--   5. Re-add FK to auth.users on actor_id
-- ============================================================================

-- 1. Drop audit trigger on invoices
DROP TRIGGER IF EXISTS trg_audit_invoice_status ON public.invoices;
DROP FUNCTION IF EXISTS public.audit_invoice_status_change();

-- 2. Drop immutability triggers on billing_audit_trail
DROP TRIGGER IF EXISTS trg_audit_trail_no_update ON public.billing_audit_trail;
DROP TRIGGER IF EXISTS trg_audit_trail_no_delete ON public.billing_audit_trail;
DROP FUNCTION IF EXISTS public.prevent_audit_trail_mutation();

-- 3. Drop new columns (migration_id, checksum_before, checksum_after)
ALTER TABLE public.billing_audit_trail DROP COLUMN IF EXISTS checksum_after;
ALTER TABLE public.billing_audit_trail DROP COLUMN IF EXISTS checksum_before;
ALTER TABLE public.billing_audit_trail DROP COLUMN IF EXISTS migration_id;

-- 4. Re-add NOT NULL on actor_id
-- Erst sicherstellen, dass keine NULL-Werte existieren (sonst schlaegt ALTER fehl)
-- Falls NULL-Werte existieren: Rollback muss manuell nachbearbeitet werden
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.billing_audit_trail WHERE actor_id IS NULL
  ) THEN
    ALTER TABLE public.billing_audit_trail ALTER COLUMN actor_id SET NOT NULL;
  ELSE
    RAISE WARNING 'billing_audit_trail hat NULL actor_id-Werte — NOT NULL nicht wiederhergestellt. Manuelle Nacharbeit erforderlich.';
  END IF;
END $$;

-- 5. Re-add FK to auth.users (nur wenn nicht bereits vorhanden)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.billing_audit_trail'::regclass
      AND contype = 'f'
      AND EXISTS (
        SELECT 1 FROM unnest(conkey) k
        JOIN pg_attribute a ON a.attrelid = conrelid AND a.attnum = k
        WHERE a.attname = 'actor_id'
      )
  ) THEN
    ALTER TABLE public.billing_audit_trail
      ADD CONSTRAINT billing_audit_trail_actor_id_fkey
      FOREIGN KEY (actor_id) REFERENCES auth.users(id);
  END IF;
END $$;
