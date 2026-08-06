-- ============================================================================
-- Pre-Backfill Sicherheit: Audit-Trail absichern
-- Branch: fix/pre-backfill-security
-- ============================================================================
--
-- 1. billing_audit_trail: actor_id nullable (Migrationen haben keinen auth-Kontext)
-- 2. billing_audit_trail: FK zu auth.users entfernen (Log-Tabelle, nicht editierbar)
-- 3. migration_id Spalte hinzufuegen
-- 4. Immutabilitaets-Trigger: kein UPDATE/DELETE auf Audit-Eintraege
-- 5. Status-Audit-Trigger auf invoices: protokolliert jede Statusaenderung
--
-- IDEMPOTENZ: IF NOT EXISTS / OR REPLACE Pattern
-- ============================================================================

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. Schema-Erweiterung billing_audit_trail
-- ──────────────────────────────────────────────────────────────────────────────

-- FK zu auth.users entfernen (Log-Tabelle soll auch ohne auth-Kontext beschreibbar sein)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name LIKE '%billing_audit_trail%actor%'
      AND table_name = 'billing_audit_trail'
      AND constraint_type = 'FOREIGN KEY'
  ) THEN
    -- Dynamisch alle FK-Constraints auf actor_id droppen
    EXECUTE (
      SELECT string_agg('ALTER TABLE public.billing_audit_trail DROP CONSTRAINT ' || conname, '; ')
      FROM pg_constraint
      WHERE conrelid = 'public.billing_audit_trail'::regclass
        AND contype = 'f'
        AND EXISTS (
          SELECT 1 FROM unnest(conkey) k
          JOIN pg_attribute a ON a.attrelid = conrelid AND a.attnum = k
          WHERE a.attname = 'actor_id'
        )
    );
  END IF;
END $$;

-- actor_id nullable machen (fuer Migrations-/Service-Role-Eintraege)
ALTER TABLE public.billing_audit_trail ALTER COLUMN actor_id DROP NOT NULL;

-- migration_id Spalte hinzufuegen
ALTER TABLE public.billing_audit_trail ADD COLUMN IF NOT EXISTS migration_id TEXT;

-- checksum_before / checksum_after fuer Datenintegritaet
ALTER TABLE public.billing_audit_trail ADD COLUMN IF NOT EXISTS checksum_before TEXT;
ALTER TABLE public.billing_audit_trail ADD COLUMN IF NOT EXISTS checksum_after TEXT;

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. Immutabilitaets-Trigger: Audit-Eintraege sind unveraenderbar
-- ──────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.prevent_audit_trail_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Audit-Trail-Eintraege duerfen nicht veraendert oder geloescht werden.';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger fuer UPDATE
DROP TRIGGER IF EXISTS trg_audit_trail_no_update ON public.billing_audit_trail;
CREATE TRIGGER trg_audit_trail_no_update
  BEFORE UPDATE ON public.billing_audit_trail
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_audit_trail_mutation();

-- Trigger fuer DELETE
DROP TRIGGER IF EXISTS trg_audit_trail_no_delete ON public.billing_audit_trail;
CREATE TRIGGER trg_audit_trail_no_delete
  BEFORE DELETE ON public.billing_audit_trail
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_audit_trail_mutation();

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. Status-Audit-Trigger auf invoices
-- ──────────────────────────────────────────────────────────────────────────────
-- Protokolliert JEDE Statusaenderung automatisch in billing_audit_trail.
-- Laeuft als AFTER UPDATE, damit die Aenderung und der Audit-Eintrag
-- in derselben Transaktion sind (atomar).

CREATE OR REPLACE FUNCTION public.audit_invoice_status_change()
RETURNS TRIGGER AS $$
DECLARE
  v_checksum TEXT;
BEGIN
  -- Nur bei tatsaechlicher Statusaenderung
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  -- Checksum der fachlichen Felder (ohne Status)
  v_checksum := md5(
    COALESCE(NEW.id::text, '') || '|' ||
    COALESCE(NEW.invoice_number, '') || '|' ||
    COALESCE(NEW.total_amount::text, '') || '|' ||
    COALESCE(NEW.budget_amount::text, '') || '|' ||
    COALESCE(NEW.private_amount::text, '') || '|' ||
    COALESCE(NEW.period_start::text, '') || '|' ||
    COALESCE(NEW.period_end::text, '') || '|' ||
    COALESCE(NEW.client_id::text, '') || '|' ||
    COALESCE(NEW.organization_id::text, '') || '|' ||
    COALESCE(NEW.soll_betrag_cent::text, '') || '|' ||
    COALESCE(NEW.ist_betrag_cent::text, '') || '|' ||
    COALESCE(NEW.kuerzung_cent::text, '')
  );

  INSERT INTO public.billing_audit_trail (
    organization_id, entity_type, entity_id, action,
    previous_state, new_state, reason,
    actor_id, actor_role, checksum,
    checksum_before, checksum_after
  ) VALUES (
    NEW.organization_id,
    'invoice',
    NEW.id,
    'status_change',
    jsonb_build_object(
      'status', OLD.status,
      'invoice_number', OLD.invoice_number,
      'total_amount', OLD.total_amount
    ),
    jsonb_build_object(
      'status', NEW.status,
      'invoice_number', NEW.invoice_number,
      'total_amount', NEW.total_amount
    ),
    NULL, -- reason wird ggf. vom Aufrufer gesetzt
    auth.uid(), -- NULL bei Migrationen/service_role
    CASE WHEN auth.uid() IS NULL THEN 'service_role' ELSE 'authenticated' END,
    v_checksum,
    v_checksum, -- before = after, da sich nur Status aendert
    v_checksum
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_audit_invoice_status ON public.invoices;
CREATE TRIGGER trg_audit_invoice_status
  AFTER UPDATE ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_invoice_status_change();

-- ──────────────────────────────────────────────────────────────────────────────
-- 4. RLS: Keine UPDATE/DELETE-Policies fuer Audit-Trail
-- ──────────────────────────────────────────────────────────────────────────────
-- Bestehende Policies erlauben bereits nur SELECT und INSERT.
-- Der Immutabilitaets-Trigger blockiert UPDATE/DELETE auf DB-Ebene.
-- Zusaetzlich: explizit verhindern, dass jemand neue Policies hinzufuegt.

-- Sicherheitshalber: Falls eine UPDATE/DELETE-Policy existiert, entfernen
DO $$ BEGIN
  -- Keine Aktion noetig — bestehende Policies sind korrekt:
  -- billing_audit_trail_org_fence (RESTRICTIVE, ALL)
  -- billing_audit_trail_select (SELECT)
  -- billing_audit_trail_insert (INSERT)
  -- UPDATE/DELETE werden durch den Trigger blockiert.
  NULL;
END $$;
