-- ════════════════════════════════════════════════════════════════════
-- EINSATZPLANUNG + KALENDER + DIGITALE LEISTUNGSNACHWEISE
-- ════════════════════════════════════════════════════════════════════
-- Erweitert assignments und service_records um vollständige Einsatz-
-- planung mit Doppelbelegungsschutz, digitale Leistungsnachweise mit
-- Signatur-Schutz und Audit-Trail, sowie Budget-Reservierung.
--
-- Alle Statements idempotent (IF NOT EXISTS / DO $$ … $$).
-- organization_id wird NICHT angelegt — existiert bereits via
-- 20260801_phase3_multi_mandant_saas.sql (org_fence RESTRICTIVE).
-- ════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════
-- 1) ASSIGNMENTS — Schema-Erweiterung
-- ═══════════════════════════════════════════════════════════════════

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='assignments' AND column_name='assignment_date') THEN
    ALTER TABLE public.assignments ADD COLUMN assignment_date date;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='assignments' AND column_name='actual_start_time') THEN
    ALTER TABLE public.assignments ADD COLUMN actual_start_time time;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='assignments' AND column_name='actual_end_time') THEN
    ALTER TABLE public.assignments ADD COLUMN actual_end_time time;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='assignments' AND column_name='actual_duration_minutes') THEN
    ALTER TABLE public.assignments ADD COLUMN actual_duration_minutes integer;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='assignments' AND column_name='address') THEN
    ALTER TABLE public.assignments ADD COLUMN address text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='assignments' AND column_name='zip_code') THEN
    ALTER TABLE public.assignments ADD COLUMN zip_code text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='assignments' AND column_name='bundesland') THEN
    ALTER TABLE public.assignments ADD COLUMN bundesland text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='assignments' AND column_name='recurrence_rule') THEN
    ALTER TABLE public.assignments ADD COLUMN recurrence_rule jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='assignments' AND column_name='recurrence_end') THEN
    ALTER TABLE public.assignments ADD COLUMN recurrence_end date;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='assignments' AND column_name='parent_assignment_id') THEN
    ALTER TABLE public.assignments ADD COLUMN parent_assignment_id uuid REFERENCES public.assignments(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='assignments' AND column_name='notes') THEN
    ALTER TABLE public.assignments ADD COLUMN notes text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='assignments' AND column_name='updated_at') THEN
    ALTER TABLE public.assignments ADD COLUMN updated_at timestamptz DEFAULT now();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='assignments' AND column_name='created_by') THEN
    ALTER TABLE public.assignments ADD COLUMN created_by uuid;
  END IF;
END $$;

-- Status-Constraint erweitern (alte entfernen, neue setzen)
DO $$ BEGIN
  ALTER TABLE public.assignments DROP CONSTRAINT IF EXISTS assignments_status_check;
  ALTER TABLE public.assignments ADD CONSTRAINT assignments_status_check
    CHECK (status IN (
      'active', 'cancelled',
      'GEPLANT', 'BESTAETIGT', 'UNTERWEGS', 'GESTARTET', 'BEENDET', 'STORNIERT', 'NO_SHOW'
    ));
EXCEPTION WHEN others THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_assignments_date
  ON public.assignments (assignment_date);
CREATE INDEX IF NOT EXISTS idx_assignments_caregiver_date
  ON public.assignments (caregiver_id, assignment_date);
CREATE INDEX IF NOT EXISTS idx_assignments_client_date
  ON public.assignments (client_id, assignment_date);
CREATE INDEX IF NOT EXISTS idx_assignments_parent
  ON public.assignments (parent_assignment_id) WHERE parent_assignment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_assignments_bundesland
  ON public.assignments (bundesland) WHERE bundesland IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════
-- 2) SERVICE_RECORDS — Schema-Erweiterung für digitale Nachweise
-- ═══════════════════════════════════════════════════════════════════

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='service_records' AND column_name='assignment_id') THEN
    ALTER TABLE public.service_records ADD COLUMN assignment_id uuid REFERENCES public.assignments(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='service_records' AND column_name='proof_status') THEN
    ALTER TABLE public.service_records ADD COLUMN proof_status text DEFAULT 'ENTWURF'
      CHECK (proof_status IN ('ENTWURF','ABGESCHLOSSEN','UNTERSCHRIEBEN','ABGERECHNET','STORNIERT'));
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
    ALTER TABLE public.service_records ADD COLUMN client_signer_role text
      CHECK (client_signer_role IS NULL OR client_signer_role IN ('KUNDE','ANGEHOERIGER','VERTRETER'));
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
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='service_records' AND column_name='billing_type') THEN
    ALTER TABLE public.service_records ADD COLUMN billing_type text DEFAULT 'PRIVAT'
      CHECK (billing_type IN ('PRIVAT','§45b','§39','§36','§37','§42','SONSTIGE'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='service_records' AND column_name='billing_status') THEN
    ALTER TABLE public.service_records ADD COLUMN billing_status text DEFAULT 'OFFEN'
      CHECK (billing_status IN (
        'OFFEN','KASSENABRECHNUNG_NOCH_NICHT_FREIGESCHALTET',
        'ZUGEORDNET','ABGERECHNET','STORNIERT'
      ));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='service_records' AND column_name='bundesland') THEN
    ALTER TABLE public.service_records ADD COLUMN bundesland text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='service_records' AND column_name='leistung_beschreibung') THEN
    ALTER TABLE public.service_records ADD COLUMN leistung_beschreibung text;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_service_records_assignment
  ON public.service_records (assignment_id) WHERE assignment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_service_records_proof_status
  ON public.service_records (proof_status);
CREATE INDEX IF NOT EXISTS idx_service_records_billing_status
  ON public.service_records (billing_status);
CREATE INDEX IF NOT EXISTS idx_service_records_date_caregiver
  ON public.service_records (date, caregiver_id);

-- ═══════════════════════════════════════════════════════════════════
-- 3) SERVICE_RECORD_AUDIT_LOG — Änderungsverlauf
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.service_record_audit_log (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  record_id  uuid NOT NULL REFERENCES public.service_records(id) ON DELETE CASCADE,
  action     text NOT NULL CHECK (action IN ('ERSTELLT','GEAENDERT','UNTERSCHRIEBEN','GESPERRT','STORNIERT','ENTSPERRT')),
  changed_by uuid,
  old_values jsonb,
  new_values jsonb,
  ip_address text,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sr_audit_record
  ON public.service_record_audit_log (record_id);

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

-- ═══════════════════════════════════════════════════════════════════
-- 4) ASSIGNMENT_AUDIT_LOG — Änderungsverlauf für Einsätze
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.assignment_audit_log (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  assignment_id uuid NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  action        text NOT NULL CHECK (action IN ('ERSTELLT','GEAENDERT','STORNIERT','GESTARTET','BEENDET','NO_SHOW')),
  changed_by    uuid,
  old_values    jsonb,
  new_values    jsonb,
  created_at    timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_as_audit_assignment
  ON public.assignment_audit_log (assignment_id);

ALTER TABLE public.assignment_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS as_audit_admin_read ON public.assignment_audit_log;
CREATE POLICY as_audit_admin_read ON public.assignment_audit_log
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','superadmin'))
  );

DROP POLICY IF EXISTS as_audit_insert ON public.assignment_audit_log;
CREATE POLICY as_audit_insert ON public.assignment_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════════
-- 5) BUDGET_RESERVATIONS — geplante vs. tatsächliche Budgets
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.budget_reservations (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id       uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  assignment_id   uuid REFERENCES public.assignments(id) ON DELETE SET NULL,
  budget_type     text NOT NULL CHECK (budget_type IN ('§45b','§39','§36','§37','§42','PRIVAT','SONSTIGE')),
  reserved_amount numeric NOT NULL DEFAULT 0,
  actual_amount   numeric,
  month           date NOT NULL,
  status          text DEFAULT 'RESERVIERT' CHECK (status IN ('RESERVIERT','VERBRAUCHT','STORNIERT')),
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_budget_reservations_client_month
  ON public.budget_reservations (client_id, month);

ALTER TABLE public.budget_reservations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS budget_res_admin ON public.budget_reservations;
CREATE POLICY budget_res_admin ON public.budget_reservations
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','superadmin'))
  );

DROP POLICY IF EXISTS budget_res_own ON public.budget_reservations;
CREATE POLICY budget_res_own ON public.budget_reservations
  FOR SELECT TO authenticated
  USING (
    client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid())
  );

-- ═══════════════════════════════════════════════════════════════════
-- 6) TRIGGER: Doppelbelegungsprüfung
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.check_assignment_overlap()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_conflict_id uuid;
BEGIN
  IF NEW.status IN ('STORNIERT', 'cancelled', 'NO_SHOW') THEN
    RETURN NEW;
  END IF;

  IF NEW.assignment_date IS NULL AND NEW.weekday IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_conflict_id
  FROM public.assignments
  WHERE id != NEW.id
    AND caregiver_id = NEW.caregiver_id
    AND status NOT IN ('STORNIERT', 'cancelled', 'NO_SHOW')
    AND (
      (NEW.assignment_date IS NOT NULL
        AND assignment_date = NEW.assignment_date
        AND start_time < NEW.end_time
        AND end_time > NEW.start_time)
      OR
      (NEW.assignment_date IS NULL
        AND NEW.weekday IS NOT NULL
        AND assignment_date IS NULL
        AND weekday = NEW.weekday
        AND start_time < NEW.end_time
        AND end_time > NEW.start_time
        AND (valid_until IS NULL OR valid_until >= COALESCE(NEW.valid_from, CURRENT_DATE))
        AND COALESCE(valid_from, CURRENT_DATE) <= COALESCE(NEW.valid_until, '9999-12-31'::date))
    )
  LIMIT 1;

  IF v_conflict_id IS NOT NULL THEN
    RAISE EXCEPTION 'DOPPELBELEGUNG: Mitarbeiter % hat bereits einen Einsatz zur gleichen Zeit (Konflikt: %)',
      NEW.caregiver_id, v_conflict_id
      USING ERRCODE = 'unique_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_assignment_overlap ON public.assignments;
CREATE TRIGGER trg_check_assignment_overlap
  BEFORE INSERT OR UPDATE ON public.assignments
  FOR EACH ROW EXECUTE FUNCTION public.check_assignment_overlap();

-- ═══════════════════════════════════════════════════════════════════
-- 7) TRIGGER: PLZ → Bundesland (assignments)
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.assignment_set_bundesland()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.zip_code IS NOT NULL AND (NEW.bundesland IS NULL OR OLD.zip_code IS DISTINCT FROM NEW.zip_code) THEN
    NEW.bundesland := public.eindeutiges_bundesland_fuer_plz(NEW.zip_code);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assignment_bundesland ON public.assignments;
CREATE TRIGGER trg_assignment_bundesland
  BEFORE INSERT OR UPDATE ON public.assignments
  FOR EACH ROW EXECUTE FUNCTION public.assignment_set_bundesland();

-- ═══════════════════════════════════════════════════════════════════
-- 8) TRIGGER: Signatur-Sperre — gesperrte Nachweise nicht änderbar
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.prevent_locked_record_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.is_locked = true THEN
    IF NEW.is_locked = false THEN
      IF EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','superadmin')) THEN
        RETURN NEW;
      END IF;
      RAISE EXCEPTION 'Gesperrter Leistungsnachweis kann nur von Admins entsperrt werden'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF NEW.proof_status = 'STORNIERT' THEN
      IF EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','superadmin')) THEN
        RETURN NEW;
      END IF;
    END IF;

    RAISE EXCEPTION 'Leistungsnachweis % ist gesperrt und kann nicht geändert werden',
      OLD.id USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_locked_record ON public.service_records;
CREATE TRIGGER trg_prevent_locked_record
  BEFORE UPDATE ON public.service_records
  FOR EACH ROW EXECUTE FUNCTION public.prevent_locked_record_change();

-- ═══════════════════════════════════════════════════════════════════
-- 9) TRIGGER: Signatur-Hash berechnen bei Unterschrift
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.compute_signature_hash()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.proof_status = 'UNTERSCHRIEBEN' AND (OLD.proof_status IS DISTINCT FROM 'UNTERSCHRIEBEN') THEN
    NEW.signature_hash := encode(
      sha256(
        convert_to(
          COALESCE(NEW.id::text, '') || '|' ||
          COALESCE(NEW.client_id::text, '') || '|' ||
          COALESCE(NEW.caregiver_id::text, '') || '|' ||
          COALESCE(NEW.date::text, '') || '|' ||
          COALESCE(NEW.start_time::text, '') || '|' ||
          COALESCE(NEW.end_time::text, '') || '|' ||
          COALESCE(NEW.duration_minutes::text, '') || '|' ||
          COALESCE(NEW.service_type, '') || '|' ||
          COALESCE(NEW.billing_type, '') || '|' ||
          COALESCE(NEW.amount::text, '') || '|' ||
          COALESCE(NEW.client_signed_at::text, '') || '|' ||
          COALESCE(NEW.caregiver_confirmed_at::text, ''),
          'UTF8'
        )
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
  FOR EACH ROW EXECUTE FUNCTION public.compute_signature_hash();

-- ═══════════════════════════════════════════════════════════════════
-- 10) TRIGGER: Auto-Audit-Log für service_records
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.audit_service_record_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_action text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'ERSTELLT';
  ELSIF NEW.proof_status = 'UNTERSCHRIEBEN' AND OLD.proof_status != 'UNTERSCHRIEBEN' THEN
    v_action := 'UNTERSCHRIEBEN';
  ELSIF NEW.is_locked = true AND OLD.is_locked = false THEN
    v_action := 'GESPERRT';
  ELSIF NEW.is_locked = false AND OLD.is_locked = true THEN
    v_action := 'ENTSPERRT';
  ELSIF NEW.proof_status = 'STORNIERT' AND OLD.proof_status != 'STORNIERT' THEN
    v_action := 'STORNIERT';
  ELSE
    v_action := 'GEAENDERT';
  END IF;

  INSERT INTO public.service_record_audit_log (record_id, action, changed_by, old_values, new_values)
  VALUES (
    COALESCE(NEW.id, OLD.id),
    v_action,
    auth.uid(),
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    to_jsonb(NEW)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_service_record ON public.service_records;
CREATE TRIGGER trg_audit_service_record
  AFTER INSERT OR UPDATE ON public.service_records
  FOR EACH ROW EXECUTE FUNCTION public.audit_service_record_change();

-- ═══════════════════════════════════════════════════════════════════
-- 11) TRIGGER: PLZ → Bundesland (service_records)
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.service_record_set_bundesland()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_plz text;
BEGIN
  IF NEW.bundesland IS NULL THEN
    SELECT c.zip_code INTO v_plz
    FROM public.clients c WHERE c.id = NEW.client_id;
    IF v_plz IS NOT NULL THEN
      NEW.bundesland := public.eindeutiges_bundesland_fuer_plz(v_plz);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sr_bundesland ON public.service_records;
CREATE TRIGGER trg_sr_bundesland
  BEFORE INSERT OR UPDATE ON public.service_records
  FOR EACH ROW EXECUTE FUNCTION public.service_record_set_bundesland();

-- ═══════════════════════════════════════════════════════════════════
-- 12) TRIGGER: Kassen-Billing-Gate
-- ═══════════════════════════════════════════════════════════════════
-- Wenn billing_type != 'PRIVAT' und das Bundesland keine aktive
-- Kassenanerkennung hat → billing_status automatisch auf
-- KASSENABRECHNUNG_NOCH_NICHT_FREIGESCHALTET setzen.

CREATE OR REPLACE FUNCTION public.check_billing_gate()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_bl text;
  v_kasse_aktiv boolean;
BEGIN
  IF NEW.billing_type = 'PRIVAT' THEN
    RETURN NEW;
  END IF;

  v_bl := COALESCE(NEW.bundesland, (
    SELECT public.eindeutiges_bundesland_fuer_plz(c.zip_code)
    FROM public.clients c WHERE c.id = NEW.client_id
  ));

  IF v_bl IS NOT NULL THEN
    SELECT (s.kasse_status = 'ANERKANNT') INTO v_kasse_aktiv
    FROM public.state_settings s
    WHERE s.bundesland = v_bl;

    IF v_kasse_aktiv IS NOT TRUE THEN
      NEW.billing_status := 'KASSENABRECHNUNG_NOCH_NICHT_FREIGESCHALTET';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_billing_gate ON public.service_records;
CREATE TRIGGER trg_check_billing_gate
  BEFORE INSERT OR UPDATE ON public.service_records
  FOR EACH ROW EXECUTE FUNCTION public.check_billing_gate();

-- ═══════════════════════════════════════════════════════════════════
-- 13) RLS: Erweiterte Policies für assignments
-- ═══════════════════════════════════════════════════════════════════
-- Bestehende baseline-Policies erlauben Admin-ALL. Engel soll eigene
-- Einsätze lesen und Status-Updates machen können.

DROP POLICY IF EXISTS assignments_engel_read ON public.assignments;
CREATE POLICY assignments_engel_read ON public.assignments
  FOR SELECT TO authenticated
  USING (
    caregiver_id IN (SELECT id FROM public.caregivers WHERE user_id = auth.uid())
    OR client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','superadmin'))
  );

DROP POLICY IF EXISTS assignments_engel_update ON public.assignments;
CREATE POLICY assignments_engel_update ON public.assignments
  FOR UPDATE TO authenticated
  USING (
    caregiver_id IN (SELECT id FROM public.caregivers WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','superadmin'))
  )
  WITH CHECK (
    caregiver_id IN (SELECT id FROM public.caregivers WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','superadmin'))
  );

DROP POLICY IF EXISTS assignments_admin_manage ON public.assignments;
CREATE POLICY assignments_admin_manage ON public.assignments
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','superadmin'))
  );

-- ═══════════════════════════════════════════════════════════════════
-- 14) RLS: service_records — Engel-Zugriff für eigene Nachweise
-- ═══════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS sr_engel_own ON public.service_records;
CREATE POLICY sr_engel_own ON public.service_records
  FOR ALL TO authenticated
  USING (
    caregiver_id IN (SELECT id FROM public.caregivers WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','superadmin'))
  )
  WITH CHECK (
    caregiver_id IN (SELECT id FROM public.caregivers WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','superadmin'))
  );

DROP POLICY IF EXISTS sr_client_read ON public.service_records;
CREATE POLICY sr_client_read ON public.service_records
  FOR SELECT TO authenticated
  USING (
    client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid())
  );

-- ═══════════════════════════════════════════════════════════════════
-- 15) RLS: budget_reservations + audit logs — org_fence
-- ═══════════════════════════════════════════════════════════════════

-- org_fence für neue Tabellen (gleicher Pattern wie Phase 3)
DO $$
DECLARE
  t text;
  new_tenant_tables text[] := ARRAY[
    'budget_reservations',
    'service_record_audit_log',
    'assignment_audit_log'
  ];
BEGIN
  FOREACH t IN ARRAY new_tenant_tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND column_name = 'organization_id'
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD COLUMN organization_id uuid REFERENCES public.organizations(id)', t);
      EXECUTE format(
        'UPDATE public.%I SET organization_id = ''00000000-0000-4000-8000-000460629986'' WHERE organization_id IS NULL', t);
      EXECUTE format(
        'ALTER TABLE public.%I ALTER COLUMN organization_id SET DEFAULT public.current_org_id()', t);
      EXECUTE format(
        'ALTER TABLE public.%I ALTER COLUMN organization_id SET NOT NULL', t);
    END IF;

    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_%s_org ON public.%I (organization_id)', t, t);

    EXECUTE format('DROP POLICY IF EXISTS "%s_org_fence" ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY "%s_org_fence" ON public.%I AS RESTRICTIVE FOR ALL '
      || 'USING (organization_id = public.current_org_id()) '
      || 'WITH CHECK (organization_id = public.current_org_id())', t, t);
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- 16) RPC: Kalender-Daten effizient abrufen
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_calendar_assignments(
  p_start date,
  p_end date,
  p_caregiver_id uuid DEFAULT NULL,
  p_client_id uuid DEFAULT NULL,
  p_bundesland text DEFAULT NULL,
  p_status text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  client_id uuid,
  caregiver_id uuid,
  client_name text,
  caregiver_name text,
  assignment_date date,
  weekday integer,
  start_time time,
  end_time time,
  service_type text,
  status text,
  bundesland text,
  address text,
  is_recurring boolean,
  has_absence boolean
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.id,
    a.client_id,
    a.caregiver_id,
    (cl.first_name || ' ' || cl.last_name)::text AS client_name,
    (cg.first_name || ' ' || cg.last_name)::text AS caregiver_name,
    COALESCE(a.assignment_date, p_start + ((a.weekday - EXTRACT(DOW FROM p_start)::integer + 7) % 7)) AS assignment_date,
    a.weekday,
    a.start_time,
    a.end_time,
    a.service_type,
    a.status,
    a.bundesland,
    a.address,
    a.is_recurring,
    EXISTS (
      SELECT 1 FROM public.absences ab
      WHERE ab.caregiver_id = a.caregiver_id
        AND ab.start_date <= COALESCE(a.assignment_date, CURRENT_DATE)
        AND COALESCE(ab.end_date, ab.start_date) >= COALESCE(a.assignment_date, CURRENT_DATE)
    ) AS has_absence
  FROM public.assignments a
  LEFT JOIN public.clients cl ON cl.id = a.client_id
  LEFT JOIN public.caregivers cg ON cg.id = a.caregiver_id
  WHERE a.status NOT IN ('STORNIERT', 'cancelled')
    AND (
      (a.assignment_date IS NOT NULL AND a.assignment_date BETWEEN p_start AND p_end)
      OR
      (a.is_recurring = true AND a.assignment_date IS NULL
        AND COALESCE(a.valid_from, '1900-01-01') <= p_end
        AND COALESCE(a.valid_until, '9999-12-31') >= p_start)
    )
    AND (p_caregiver_id IS NULL OR a.caregiver_id = p_caregiver_id)
    AND (p_client_id IS NULL OR a.client_id = p_client_id)
    AND (p_bundesland IS NULL OR a.bundesland = p_bundesland)
    AND (p_status IS NULL OR a.status = p_status);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_calendar_assignments(date,date,uuid,uuid,text,text)
  TO authenticated;

-- ═══════════════════════════════════════════════════════════════════
-- 17) RPC: Monatsabschluss-Übersicht
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_monthly_closing_overview(
  p_month date
)
RETURNS TABLE (
  total_assignments bigint,
  completed_assignments bigint,
  missing_proofs bigint,
  unsigned_proofs bigint,
  locked_proofs bigint,
  billed_proofs bigint,
  open_assignments bigint,
  no_show_count bigint,
  cancelled_count bigint,
  total_clients bigint,
  total_caregivers bigint,
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
    (SELECT count(*) FROM assignments WHERE assignment_date BETWEEN v_start AND v_end AND status NOT IN ('STORNIERT','cancelled'))::bigint,
    (SELECT count(*) FROM assignments WHERE assignment_date BETWEEN v_start AND v_end AND status = 'BEENDET')::bigint,
    (SELECT count(*) FROM assignments a WHERE a.assignment_date BETWEEN v_start AND v_end AND a.status = 'BEENDET'
      AND NOT EXISTS (SELECT 1 FROM service_records sr WHERE sr.assignment_id = a.id))::bigint,
    (SELECT count(*) FROM service_records WHERE date BETWEEN v_start AND v_end AND proof_status IN ('ENTWURF','ABGESCHLOSSEN') AND is_locked = false)::bigint,
    (SELECT count(*) FROM service_records WHERE date BETWEEN v_start AND v_end AND is_locked = true)::bigint,
    (SELECT count(*) FROM service_records WHERE date BETWEEN v_start AND v_end AND billing_status = 'ABGERECHNET')::bigint,
    (SELECT count(*) FROM assignments WHERE assignment_date BETWEEN v_start AND v_end AND status IN ('GEPLANT','BESTAETIGT'))::bigint,
    (SELECT count(*) FROM assignments WHERE assignment_date BETWEEN v_start AND v_end AND status = 'NO_SHOW')::bigint,
    (SELECT count(*) FROM assignments WHERE assignment_date BETWEEN v_start AND v_end AND status IN ('STORNIERT','cancelled'))::bigint,
    (SELECT count(DISTINCT client_id) FROM assignments WHERE assignment_date BETWEEN v_start AND v_end)::bigint,
    (SELECT count(DISTINCT caregiver_id) FROM assignments WHERE assignment_date BETWEEN v_start AND v_end)::bigint,
    (SELECT count(*) FROM client_budgets WHERE status = 'active'
      AND (used_amount / NULLIF(annual_amount, 0)) > 0.9)::bigint;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_monthly_closing_overview(date)
  TO authenticated;

COMMIT;
