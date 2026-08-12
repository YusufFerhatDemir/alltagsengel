-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK: Expansion Deutschland (20260808100000)
--
-- Setzt die Deutschland-Architektur vollstaendig zurueck.
-- ACHTUNG: state_waitlist und state_settings_audit enthalten fachliche Daten
--          (Leads, Nachweis-Historie). Diese werden VOR dem Drop in
--          _archiv-Tabellen gesichert, damit nichts verloren geht.
--
-- Reihenfolge: Trigger → Policies → View → RPCs → Tabellen → Katalog.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Fachliche Daten sichern (nur wenn vorhanden) ─────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_schema = 'public' AND table_name = 'state_waitlist') THEN
    EXECUTE 'CREATE TABLE IF NOT EXISTS public.state_waitlist_archiv AS
             SELECT * FROM public.state_waitlist';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_schema = 'public' AND table_name = 'state_settings_audit') THEN
    EXECUTE 'CREATE TABLE IF NOT EXISTS public.state_settings_audit_archiv AS
             SELECT * FROM public.state_settings_audit';
  END IF;
END $$;

-- ── 2. Trigger ──────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_seed_state_settings      ON public.organizations;
DROP TRIGGER IF EXISTS trg_state_settings_updated_at ON public.state_settings;
DROP TRIGGER IF EXISTS trg_state_waitlist_updated_at ON public.state_waitlist;
DROP TRIGGER IF EXISTS trg_state_audit_no_update     ON public.state_settings_audit;

-- ── 3. Policies ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS state_settings_admin_all    ON public.state_settings;
DROP POLICY IF EXISTS state_audit_admin_read      ON public.state_settings_audit;
DROP POLICY IF EXISTS state_waitlist_insert       ON public.state_waitlist;
DROP POLICY IF EXISTS state_waitlist_admin_read   ON public.state_waitlist;
DROP POLICY IF EXISTS state_waitlist_admin_write  ON public.state_waitlist;
DROP POLICY IF EXISTS state_waitlist_admin_delete ON public.state_waitlist;
DROP POLICY IF EXISTS bundeslaender_read          ON public.bundeslaender;

-- ── 4. View ─────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.state_settings_public;

-- ── 5. RPCs / Helper ────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.activate_insurance_billing(UUID, TEXT, UUID, TEXT, TEXT, TEXT, DATE, DATE);
DROP FUNCTION IF EXISTS public.deactivate_insurance_billing(UUID, TEXT, UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.update_state_settings(
  UUID, TEXT, UUID, TEXT, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, DATE, DATE,
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.log_state_settings_change(UUID, TEXT, TEXT, JSONB, JSONB, UUID, TEXT);
DROP FUNCTION IF EXISTS public.state_flag(UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.seed_state_settings_for_org();
DROP FUNCTION IF EXISTS public.state_audit_append_only();
DROP TYPE     IF EXISTS public.state_activation_result CASCADE;

-- ── 6. Tabellen ─────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS public.state_waitlist;
DROP TABLE IF EXISTS public.state_settings_audit;
DROP TABLE IF EXISTS public.state_settings;

-- ── 7. Katalog (nur wenn keine Fremdreferenz mehr besteht) ──────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.confrelid = 'public.bundeslaender'::regclass
  ) THEN
    DROP TABLE IF EXISTS public.bundeslaender;
  ELSE
    RAISE NOTICE 'public.bundeslaender bleibt bestehen — es existieren noch Fremdschluessel darauf.';
  END IF;
END $$;
