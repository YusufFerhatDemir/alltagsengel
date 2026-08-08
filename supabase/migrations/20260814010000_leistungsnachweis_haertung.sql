-- ════════════════════════════════════════════════════════════════════
-- Block 9: Leistungsnachweis & Monatsabschluss — DB-Härtung
-- ════════════════════════════════════════════════════════════════════
-- Stellt die durch Rollback 20260808200001 gelöschten DB-Objekte
-- wieder her: Audit-Tabelle, Integritäts-Trigger, Closing-RPC.
-- Alle Statements idempotent (IF NOT EXISTS / CREATE OR REPLACE).
-- ════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════
-- 1) SERVICE_RECORDS — Spalten sicherstellen (idempotent)
-- ═══════════════════════════════════════════════════════════════════

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='service_records' AND column_name='proof_status') THEN
    ALTER TABLE public.service_records ADD COLUMN proof_status text DEFAULT 'ENTWURF';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='service_records' AND column_name='billing_status') THEN
    ALTER TABLE public.service_records ADD COLUMN billing_status text DEFAULT 'OFFEN';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='service_records' AND column_name='billing_type') THEN
    ALTER TABLE public.service_records ADD COLUMN billing_type text DEFAULT 'PRIVAT';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='service_records' AND column_name='caregiver_confirmed_at') THEN
    ALTER TABLE public.service_records ADD COLUMN caregiver_confirmed_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='service_records' AND column_name='client_signed_at') THEN
    ALTER TABLE public.service_records ADD COLUMN client_signed_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='service_records' AND column_name='client_signer_name') THEN
    ALTER TABLE public.service_records ADD COLUMN client_signer_name text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='service_records' AND column_name='client_signer_role') THEN
    ALTER TABLE public.service_records ADD COLUMN client_signer_role text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='service_records' AND column_name='signature_hash') THEN
    ALTER TABLE public.service_records ADD COLUMN signature_hash text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='service_records' AND column_name='is_locked') THEN
    ALTER TABLE public.service_records ADD COLUMN is_locked boolean DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='service_records' AND column_name='gps_start_lat') THEN
    ALTER TABLE public.service_records ADD COLUMN gps_start_lat numeric;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='service_records' AND column_name='gps_start_lng') THEN
    ALTER TABLE public.service_records ADD COLUMN gps_start_lng numeric;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='service_records' AND column_name='gps_end_lat') THEN
    ALTER TABLE public.service_records ADD COLUMN gps_end_lat numeric;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='service_records' AND column_name='gps_end_lng') THEN
    ALTER TABLE public.service_records ADD COLUMN gps_end_lng numeric;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='service_records' AND column_name='leistung_beschreibung') THEN
    ALTER TABLE public.service_records ADD COLUMN leistung_beschreibung text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='service_records' AND column_name='assignment_id') THEN
    ALTER TABLE public.service_records ADD COLUMN assignment_id uuid;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='service_records' AND column_name='bundesland') THEN
    ALTER TABLE public.service_records ADD COLUMN bundesland text;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_service_records_proof_status
  ON public.service_records (proof_status);
CREATE INDEX IF NOT EXISTS idx_service_records_billing_status
  ON public.service_records (billing_status);
CREATE INDEX IF NOT EXISTS idx_service_records_date_caregiver
  ON public.service_records (date, caregiver_id);

-- ═══════════════════════════════════════════════════════════════════
-- 2) SERVICE_RECORD_AUDIT_LOG — Änderungsverlauf
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.service_record_audit_log (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  record_id  uuid NOT NULL,
  action     text NOT NULL,
  field_name text,
  old_value  text,
  new_value  text,
  changed_by uuid,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sr_audit_record
  ON public.service_record_audit_log (record_id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='service_record_audit_log'
    AND column_name='organization_id') THEN
    ALTER TABLE public.service_record_audit_log
      ADD COLUMN organization_id uuid DEFAULT current_org_id();
  END IF;
EXCEPTION WHEN others THEN
  NULL;
END $$;

ALTER TABLE public.service_record_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sr_audit_admin_read ON public.service_record_audit_log;
CREATE POLICY sr_audit_admin_read ON public.service_record_audit_log
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','superadmin'))
  );

DROP POLICY IF EXISTS sr_audit_insert ON public.service_record_audit_log;
CREATE POLICY sr_audit_insert ON public.service_record_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- org_fence
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='service_record_audit_log'
    AND column_name='organization_id') THEN
    DROP POLICY IF EXISTS "service_record_audit_log_org_fence" ON public.service_record_audit_log;
    CREATE POLICY "service_record_audit_log_org_fence" ON public.service_record_audit_log
      AS RESTRICTIVE FOR ALL
      USING (organization_id = current_org_id())
      WITH CHECK (organization_id = current_org_id());
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- 3) AUDIT-TRIGGER: Automatischer Audit-Trail bei Änderungen
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.audit_service_record_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_action text;
  v_org_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'ERSTELLT';
    v_org_id := NEW.organization_id;
    INSERT INTO public.service_record_audit_log
      (record_id, action, field_name, new_value, changed_by, organization_id)
    VALUES
      (NEW.id, v_action, NULL, 'Nachweis erstellt', auth.uid(), v_org_id);
    RETURN NEW;
  END IF;

  v_org_id := NEW.organization_id;

  IF OLD.proof_status IS DISTINCT FROM NEW.proof_status THEN
    v_action := CASE NEW.proof_status
      WHEN 'UNTERSCHRIEBEN' THEN 'UNTERSCHRIEBEN'
      WHEN 'STORNIERT' THEN 'STORNIERT'
      ELSE 'GEAENDERT'
    END;
    INSERT INTO public.service_record_audit_log
      (record_id, action, field_name, old_value, new_value, changed_by, organization_id)
    VALUES
      (NEW.id, v_action, 'proof_status', OLD.proof_status, NEW.proof_status, auth.uid(), v_org_id);
  END IF;

  IF OLD.is_locked IS DISTINCT FROM NEW.is_locked AND NEW.is_locked = true THEN
    INSERT INTO public.service_record_audit_log
      (record_id, action, field_name, old_value, new_value, changed_by, organization_id)
    VALUES
      (NEW.id, 'GESPERRT', 'is_locked', 'false', 'true', auth.uid(), v_org_id);
  END IF;

  IF OLD.billing_status IS DISTINCT FROM NEW.billing_status THEN
    INSERT INTO public.service_record_audit_log
      (record_id, action, field_name, old_value, new_value, changed_by, organization_id)
    VALUES
      (NEW.id, 'GEAENDERT', 'billing_status', OLD.billing_status, NEW.billing_status, auth.uid(), v_org_id);
  END IF;

  IF OLD.amount IS DISTINCT FROM NEW.amount THEN
    INSERT INTO public.service_record_audit_log
      (record_id, action, field_name, old_value, new_value, changed_by, organization_id)
    VALUES
      (NEW.id, 'GEAENDERT', 'amount',
       COALESCE(OLD.amount::text, ''),
       COALESCE(NEW.amount::text, ''),
       auth.uid(), v_org_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_service_record ON public.service_records;
CREATE TRIGGER trg_audit_service_record
  AFTER INSERT OR UPDATE ON public.service_records
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_service_record_change();

-- ═══════════════════════════════════════════════════════════════════
-- 4) SIGNATURE-HASH: Integritätsprüfung für unterschriebene Nachweise
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.compute_signature_hash()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.proof_status = 'UNTERSCHRIEBEN' AND NEW.client_signed_at IS NOT NULL THEN
    NEW.signature_hash := encode(
      digest(
        COALESCE(NEW.id::text, '') || '|' ||
        COALESCE(NEW.client_id::text, '') || '|' ||
        COALESCE(NEW.date::text, '') || '|' ||
        COALESCE(NEW.start_time::text, '') || '|' ||
        COALESCE(NEW.end_time::text, '') || '|' ||
        COALESCE(NEW.amount::text, '') || '|' ||
        COALESCE(NEW.client_signed_at::text, ''),
        'sha256'
      ),
      'hex'
    );
    NEW.is_locked := true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_compute_signature_hash ON public.service_records;
CREATE TRIGGER trg_compute_signature_hash
  BEFORE UPDATE ON public.service_records
  FOR EACH ROW
  WHEN (NEW.proof_status = 'UNTERSCHRIEBEN' AND OLD.proof_status IS DISTINCT FROM NEW.proof_status)
  EXECUTE FUNCTION public.compute_signature_hash();

-- ═══════════════════════════════════════════════════════════════════
-- 5) LOCKED-RECORD-SCHUTZ: Gesperrte Nachweise dürfen nicht mehr
--    verändert werden (außer Stornierung durch Admin)
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.prevent_locked_record_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF OLD.is_locked = true THEN
    IF NEW.proof_status = 'STORNIERT' THEN
      RETURN NEW;
    END IF;
    IF NEW.is_locked IS DISTINCT FROM OLD.is_locked AND NEW.is_locked = false THEN
      IF EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','superadmin')) THEN
        RETURN NEW;
      END IF;
    END IF;
    RAISE EXCEPTION 'Leistungsnachweis ist gesperrt — Änderungen sind nicht mehr möglich.'
      USING HINT = 'Manipulationsschutz aktiv';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_locked_record ON public.service_records;
CREATE TRIGGER trg_prevent_locked_record
  BEFORE UPDATE ON public.service_records
  FOR EACH ROW
  WHEN (OLD.is_locked = true)
  EXECUTE FUNCTION public.prevent_locked_record_change();

-- ═══════════════════════════════════════════════════════════════════
-- 6) RPC: Monatsabschluss-Übersicht (KPI-Aggregation)
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_monthly_closing_overview(
  p_month date
)
RETURNS TABLE (
  total_records bigint,
  signed_records bigint,
  unsigned_records bigint,
  locked_records bigint,
  billed_records bigint,
  draft_records bigint,
  total_clients bigint,
  total_caregivers bigint,
  total_amount numeric,
  budget_warnings bigint
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_start date := date_trunc('month', p_month)::date;
  v_end   date := (date_trunc('month', p_month) + interval '1 month' - interval '1 day')::date;
BEGIN
  RETURN QUERY
  SELECT
    (SELECT count(*) FROM service_records WHERE date BETWEEN v_start AND v_end)::bigint,
    (SELECT count(*) FROM service_records WHERE date BETWEEN v_start AND v_end
      AND proof_status = 'UNTERSCHRIEBEN')::bigint,
    (SELECT count(*) FROM service_records WHERE date BETWEEN v_start AND v_end
      AND proof_status IN ('ENTWURF','ABGESCHLOSSEN'))::bigint,
    (SELECT count(*) FROM service_records WHERE date BETWEEN v_start AND v_end
      AND is_locked = true)::bigint,
    (SELECT count(*) FROM service_records WHERE date BETWEEN v_start AND v_end
      AND billing_status = 'ABGERECHNET')::bigint,
    (SELECT count(*) FROM service_records WHERE date BETWEEN v_start AND v_end
      AND proof_status = 'ENTWURF')::bigint,
    (SELECT count(DISTINCT client_id) FROM service_records WHERE date BETWEEN v_start AND v_end)::bigint,
    (SELECT count(DISTINCT caregiver_id) FROM service_records WHERE date BETWEEN v_start AND v_end)::bigint,
    (SELECT COALESCE(sum(amount), 0) FROM service_records WHERE date BETWEEN v_start AND v_end)::numeric,
    (SELECT count(*) FROM client_budgets WHERE status = 'active'
      AND annual_amount > 0
      AND (used_amount / NULLIF(annual_amount, 0)) > 0.9)::bigint;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_monthly_closing_overview(date)
  TO authenticated;

COMMIT;
