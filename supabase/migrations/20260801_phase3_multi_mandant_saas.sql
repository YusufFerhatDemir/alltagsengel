-- ════════════════════════════════════════════════════════════════════
-- PHASE 3 (Bauplan Abrechnungsplattform): Multi-Mandant SaaS-Architektur
-- ════════════════════════════════════════════════════════════════════
--
-- Inhalt:
--   1) organizations              — Mandanten (Pflegedienste)
--   2) organization_members       — User↔Org-Zuordnung (owner/admin/staff)
--   3) organization_subscriptions — Billing/Abo (Stripe-ready)
--   4) Helper-Funktionen          — current_org_id(), is_org_member(), has_org_role()
--   5) organization_id-Spalte     — auf allen mandantenfähigen Tabellen
--                                   (Backfill = Alltagsengel-Stamm-Org)
--   6) RLS-Fence                  — RESTRICTIVE-Policy je Tabelle:
--                                   organization_id = current_org_id()
--
-- Design-Entscheidungen:
--   • Stamm-Organisation Alltagsengel bekommt eine FESTE UUID, die das
--     IK 460629986 kodiert: 00000000-0000-4000-8000-000460629986.
--     → Backfill deterministisch, Code kann die Konstante referenzieren.
--   • current_org_id() löst auf in dieser Reihenfolge:
--       1. JWT app_metadata.org_id  (nur serverseitig setzbar → vertrauenswürdig)
--       2. organization_members-Lookup (erste/älteste Mitgliedschaft)
--       3. Fallback: Stamm-Org Alltagsengel
--     Der Fallback hält ALLE bestehenden Flows (Kunden, Engel, anon) intakt:
--     Bestandsdaten liegen in der Stamm-Org, Nutzer ohne Org-Kontext landen
--     ebenfalls dort → Fence lässt durch, nichts bricht.
--   • Die Fence-Policies sind RESTRICTIVE: sie schränken bestehende
--     (permissive) Policies zusätzlich ein, statt neue Rechte zu gewähren.
--     is_admin()-Policies aus dem RLS-Lockdown bleiben unangetastet —
--     ein Admin von Org A sieht damit trotzdem KEINE Daten von Org B.
--   • service_role hat BYPASSRLS → alle bestehenden Server-API-Routen
--     laufen unverändert. Serverseitiger Code MUSS bei Schreibzugriffen
--     für fremde Mandanten organization_id explizit setzen
--     (Helper: lib/organizations/server.ts → getActiveOrgId()).
--   • Spalten-Default = current_org_id(): clientseitige Inserts eines
--     Org-Mitglieds landen automatisch in der richtigen Org.
--   • Idempotent: kann mehrfach ausgeführt werden.
-- ════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- 1) organizations
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.organizations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  ik_nummer     text UNIQUE CHECK (ik_nummer ~ '^[0-9]{9}$'),
  address       jsonb NOT NULL DEFAULT '{}'::jsonb,   -- {strasse, plz, ort, bundesland}
  bundesland    text,
  settings      jsonb NOT NULL DEFAULT '{}'::jsonb,   -- Org-spezifische Einstellungen
  billing_plan  text NOT NULL DEFAULT 'free'
                CHECK (billing_plan IN ('intern','free','starter','pro','scale')),
  status        text NOT NULL DEFAULT 'onboarding'
                CHECK (status IN ('onboarding','active','suspended','cancelled')),
  onboarding_step int NOT NULL DEFAULT 0,             -- 0=Registrierung … 4=fertig
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Stamm-Organisation Alltagsengel (feste UUID, kodiert IK 460629986)
INSERT INTO public.organizations (id, name, ik_nummer, address, bundesland, billing_plan, status, onboarding_step, settings)
VALUES (
  '00000000-0000-4000-8000-000460629986',
  'Alltagsengel UG',
  '460629986',
  '{"strasse":"", "plz":"", "ort":"Frankfurt am Main", "bundesland":"Hessen"}'::jsonb,
  'Hessen',
  'intern',
  'active',
  4,
  '{}'::jsonb
)
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────
-- 2) organization_members
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.organization_members (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role            text NOT NULL DEFAULT 'staff' CHECK (role IN ('owner','admin','staff')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_org_members_user ON public.organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org  ON public.organization_members(organization_id);

-- Bestehende Plattform-Admins werden Owner der Stamm-Org
INSERT INTO public.organization_members (organization_id, user_id, role)
SELECT '00000000-0000-4000-8000-000460629986', p.id, 'owner'
FROM public.profiles p
WHERE p.role IN ('admin','superadmin')
ON CONFLICT (organization_id, user_id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────
-- 3) organization_subscriptions (Billing, Stripe-ready)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.organization_subscriptions (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id        uuid NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  plan                   text NOT NULL DEFAULT 'free'
                         CHECK (plan IN ('intern','free','starter','pro','scale')),
  status                 text NOT NULL DEFAULT 'active'
                         CHECK (status IN ('trialing','active','past_due','cancelled')),
  stripe_customer_id     text,
  stripe_subscription_id text,
  current_period_start   timestamptz,
  current_period_end     timestamptz,
  features               jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- z.B. {"max_klienten":50, "edifact":true, "ki_pruefung":false, "elnw":false, "api":false}
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.organization_subscriptions (organization_id, plan, status, features)
VALUES (
  '00000000-0000-4000-8000-000460629986', 'intern', 'active',
  '{"max_klienten": null, "edifact": true, "ki_pruefung": true, "elnw": true, "api": true}'::jsonb
)
ON CONFLICT (organization_id) DO NOTHING;

-- updated_at-Trigger
CREATE OR REPLACE FUNCTION public.org_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_organizations_updated ON public.organizations;
CREATE TRIGGER trg_organizations_updated BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.org_touch_updated_at();
DROP TRIGGER IF EXISTS trg_org_subscriptions_updated ON public.organization_subscriptions;
CREATE TRIGGER trg_org_subscriptions_updated BEFORE UPDATE ON public.organization_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.org_touch_updated_at();

-- ─────────────────────────────────────────────────────────────────────
-- 4) Helper-Funktionen
-- ─────────────────────────────────────────────────────────────────────

-- Aktive Organisation des aktuellen Requests.
-- SECURITY DEFINER, damit der Lookup auf organization_members nicht an
-- deren RLS scheitert. STABLE → wird pro Statement gecacht.
CREATE OR REPLACE FUNCTION public.current_org_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    NULLIF(auth.jwt() -> 'app_metadata' ->> 'org_id', '')::uuid,
    (SELECT om.organization_id
       FROM public.organization_members om
      WHERE om.user_id = auth.uid()
      ORDER BY om.created_at
      LIMIT 1),
    '00000000-0000-4000-8000-000460629986'::uuid
  );
$$;

CREATE OR REPLACE FUNCTION public.is_org_member(org uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = org AND om.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.has_org_role(org uuid, roles text[])
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = org
      AND om.user_id = auth.uid()
      AND om.role = ANY(roles)
  );
$$;

REVOKE ALL ON FUNCTION public.current_org_id() FROM public;
GRANT EXECUTE ON FUNCTION public.current_org_id() TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.is_org_member(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.is_org_member(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.has_org_role(uuid, text[]) FROM public;
GRANT EXECUTE ON FUNCTION public.has_org_role(uuid, text[]) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────
-- RLS für die neuen Tabellen
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.organizations              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_subscriptions ENABLE ROW LEVEL SECURITY;

-- organizations: Mitglieder lesen ihre Org, Owner/Admin dürfen updaten.
-- INSERT/DELETE nur über service_role (API mit Validierung).
DROP POLICY IF EXISTS "orgs_member_select" ON public.organizations;
CREATE POLICY "orgs_member_select" ON public.organizations
  FOR SELECT USING (public.is_org_member(id));
DROP POLICY IF EXISTS "orgs_owner_update" ON public.organizations;
CREATE POLICY "orgs_owner_update" ON public.organizations
  FOR UPDATE USING (public.has_org_role(id, ARRAY['owner','admin']))
  WITH CHECK (public.has_org_role(id, ARRAY['owner','admin']));

-- organization_members: eigene Mitgliedschaften + Mitglieder der eigenen Org
-- sichtbar; verwalten dürfen nur Owner/Admin der Org.
DROP POLICY IF EXISTS "org_members_select" ON public.organization_members;
CREATE POLICY "org_members_select" ON public.organization_members
  FOR SELECT USING (user_id = auth.uid() OR public.is_org_member(organization_id));
DROP POLICY IF EXISTS "org_members_manage" ON public.organization_members;
CREATE POLICY "org_members_manage" ON public.organization_members
  FOR ALL USING (public.has_org_role(organization_id, ARRAY['owner','admin']))
  WITH CHECK (public.has_org_role(organization_id, ARRAY['owner','admin']));

-- subscriptions: Mitglieder lesen; Schreiben nur service_role (Stripe-Webhooks)
DROP POLICY IF EXISTS "org_subs_member_select" ON public.organization_subscriptions;
CREATE POLICY "org_subs_member_select" ON public.organization_subscriptions
  FOR SELECT USING (public.is_org_member(organization_id));

-- ─────────────────────────────────────────────────────────────────────
-- 5+6) organization_id-Spalte + Index + RESTRICTIVE RLS-Fence
--      auf allen mandantenfähigen Tabellen
-- ─────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  t text;
  tenant_tables text[] := ARRAY[
    -- Betriebssystem-Kern
    'clients', 'care_recipients', 'caregivers', 'applications', 'assignments',
    'absences', 'bookings', 'care_notes', 'medikamentenplan', 'notfall_info',
    'dispatch_status', 'einsatz_absagen', 'substitution_requests',
    'client_preferred_substitutes', 'satisfaction_calls', 'fahrzeuge',
    'caregiver_bonuses', 'caregiver_documents', 'caregiver_initials_history',
    'caregiver_qualifications', 'cooperation_partners', 'hygienebox_orders',
    'ocr_results', 'review_errors',
    -- Finanzen / Abrechnung
    'client_budgets', 'budget_transactions', 'invoices', 'invoice_items',
    'invoice_disputes', 'invoice_packages', 'payment_status', 'monthly_closings',
    'service_records', 'service_record_items', 'service_signatures',
    'service_pricing', 'leistungspreise', 'kostentraeger_kontakte',
    'verordnungen', 'verordnung_leistungen',
    'abrechnungslaeufe', 'abrechnung_zertifikate',
    -- MIS (operative Module, die SaaS-Mandanten ebenfalls nutzen)
    'mis_applicants', 'mis_availability', 'mis_budget_items', 'mis_capa',
    'mis_complaints', 'mis_contracts', 'mis_crm_activities', 'mis_documents',
    'mis_document_versions', 'mis_financial_reports', 'mis_job_postings',
    'mis_kpis', 'mis_notifications', 'mis_purchase_orders', 'mis_quality_audits',
    'mis_quality_processes', 'mis_shifts', 'mis_signature_requests',
    'mis_suppliers', 'mis_tasks', 'mis_training_catalog', 'mis_training_records',
    'mis_vehicles'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    -- Tabelle existiert? (Schema lebt teilweise nur live in Supabase)
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      RAISE NOTICE 'Tabelle % existiert nicht — übersprungen', t;
      CONTINUE;
    END IF;

    -- Spalte anlegen (nullable), Backfill auf Stamm-Org, dann NOT NULL + Default
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

    -- RESTRICTIVE Fence: schneidet ALLE bestehenden permissiven Policies
    -- auf die aktive Organisation zu (AND-Verknüpfung).
    EXECUTE format('DROP POLICY IF EXISTS "%s_org_fence" ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY "%s_org_fence" ON public.%I AS RESTRICTIVE FOR ALL '
      || 'USING (organization_id = public.current_org_id()) '
      || 'WITH CHECK (organization_id = public.current_org_id())', t, t);
  END LOOP;
END $$;

COMMIT;

-- ════════════════════════════════════════════════════════════════════
-- VERIFIKATION (nach Apply manuell ausführen):
--   select count(*) from organizations;                          -- ≥ 1
--   select public.current_org_id();                              -- Stamm-Org-UUID
--   select tablename, policyname from pg_policies
--    where policyname like '%org_fence' order by tablename;      -- alle Fences da
--   select count(*) from clients where organization_id is null;  -- 0
-- ════════════════════════════════════════════════════════════════════
