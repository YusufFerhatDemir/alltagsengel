-- ============================================
-- ALLTAGSENGEL MIS - Management Information System
-- Database Schema v1.0
-- ============================================

-- ====== DOCUMENT MANAGEMENT (ISO 9001 compliant) ======

CREATE TABLE IF NOT EXISTS public.mis_document_categories (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  parent_id uuid REFERENCES public.mis_document_categories(id) ON DELETE SET NULL,
  icon text DEFAULT 'folder',
  color text DEFAULT '#C9963C',
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.mis_documents (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  description text,
  category_id uuid REFERENCES public.mis_document_categories(id) ON DELETE SET NULL,
  file_path text,
  file_name text,
  file_size bigint DEFAULT 0,
  file_type text,
  version int DEFAULT 1,
  status text DEFAULT 'draft' CHECK (status IN ('draft','review','approved','archived','obsolete')),
  iso_doc_number text,
  iso_revision text DEFAULT 'A',
  classification text DEFAULT 'internal' CHECK (classification IN ('public','internal','confidential','restricted')),
  owner_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at timestamptz,
  review_due_at timestamptz,
  tags text[] DEFAULT '{}',
  metadata jsonb DEFAULT '{}',
  download_count int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.mis_document_versions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id uuid REFERENCES public.mis_documents(id) ON DELETE CASCADE,
  version int NOT NULL,
  file_path text,
  file_name text,
  file_size bigint DEFAULT 0,
  change_summary text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

-- ====== AUDIT LOG ======

CREATE TABLE IF NOT EXISTS public.mis_audit_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('create','read','update','delete','download','approve','reject','share','archive')),
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_name text,
  details jsonb DEFAULT '{}',
  ip_address text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_audit_entity ON public.mis_audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_actor ON public.mis_audit_log(actor_id);
CREATE INDEX idx_audit_date ON public.mis_audit_log(created_at DESC);

-- ====== DATA ROOM ======

CREATE TABLE IF NOT EXISTS public.mis_dataroom_sections (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  icon text DEFAULT 'folder',
  sort_order int DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.mis_dataroom_access (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  section_id uuid REFERENCES public.mis_dataroom_sections(id) ON DELETE CASCADE,
  document_id uuid REFERENCES public.mis_documents(id) ON DELETE CASCADE,
  accessed_by text,
  accessed_by_email text,
  access_type text DEFAULT 'view' CHECK (access_type IN ('view','download','share')),
  ip_address text,
  user_agent text,
  created_at timestamptz DEFAULT now()
);

-- ====== KPI TRACKING ======

CREATE TABLE IF NOT EXISTS public.mis_kpis (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL,
  category text NOT NULL,
  value numeric,
  target numeric,
  unit text DEFAULT '',
  trend text DEFAULT 'stable' CHECK (trend IN ('up','down','stable')),
  period text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ====== ISO 9001 QUALITY MANAGEMENT ======

CREATE TABLE IF NOT EXISTS public.mis_quality_processes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  process_id text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  category text DEFAULT 'core' CHECK (category IN ('core','support','management')),
  owner_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  status text DEFAULT 'active' CHECK (status IN ('active','review','suspended','retired')),
  risk_level text DEFAULT 'low' CHECK (risk_level IN ('low','medium','high','critical')),
  last_audit_date date,
  next_audit_date date,
  kpis jsonb DEFAULT '[]',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.mis_quality_audits (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  audit_number text NOT NULL,
  process_id uuid REFERENCES public.mis_quality_processes(id) ON DELETE SET NULL,
  audit_type text DEFAULT 'internal' CHECK (audit_type IN ('internal','external','supplier','certification')),
  auditor_name text,
  status text DEFAULT 'planned' CHECK (status IN ('planned','in_progress','completed','closed')),
  findings_count int DEFAULT 0,
  non_conformities int DEFAULT 0,
  observations int DEFAULT 0,
  score numeric,
  scheduled_date date,
  completed_date date,
  report_path text,
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.mis_capa (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  capa_number text NOT NULL,
  type text NOT NULL CHECK (type IN ('corrective','preventive','improvement')),
  title text NOT NULL,
  description text,
  source text DEFAULT 'audit' CHECK (source IN ('audit','complaint','incident','observation','management_review')),
  priority text DEFAULT 'medium' CHECK (priority IN ('low','medium','high','critical')),
  status text DEFAULT 'open' CHECK (status IN ('open','investigation','action_plan','implementation','verification','closed')),
  root_cause text,
  action_plan text,
  responsible_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  due_date date,
  closed_date date,
  effectiveness_verified boolean DEFAULT false,
  related_audit_id uuid REFERENCES public.mis_quality_audits(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ====== SUPPLY CHAIN ======

CREATE TABLE IF NOT EXISTS public.mis_suppliers (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  category text,
  contact_person text,
  email text,
  phone text,
  address text,
  rating numeric DEFAULT 0,
  status text DEFAULT 'active' CHECK (status IN ('active','pending','suspended','blacklisted')),
  iso_certified boolean DEFAULT false,
  contract_start date,
  contract_end date,
  payment_terms text,
  notes text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.mis_purchase_orders (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  po_number text NOT NULL UNIQUE,
  supplier_id uuid REFERENCES public.mis_suppliers(id) ON DELETE SET NULL,
  status text DEFAULT 'draft' CHECK (status IN ('draft','submitted','approved','ordered','received','closed','cancelled')),
  items jsonb DEFAULT '[]',
  total_amount numeric DEFAULT 0,
  currency text DEFAULT 'EUR',
  requested_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  order_date date,
  expected_delivery date,
  actual_delivery date,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ====== FINANCIAL TRACKING ======

CREATE TABLE IF NOT EXISTS public.mis_budget_items (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  category text NOT NULL,
  subcategory text,
  description text,
  planned_amount numeric DEFAULT 0,
  actual_amount numeric DEFAULT 0,
  period text NOT NULL,
  year int NOT NULL DEFAULT 2026,
  currency text DEFAULT 'EUR',
  status text DEFAULT 'active',
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.mis_financial_reports (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  report_type text NOT NULL CHECK (report_type IN ('monthly','quarterly','annual','custom')),
  title text NOT NULL,
  period_start date,
  period_end date,
  data jsonb DEFAULT '{}',
  status text DEFAULT 'draft' CHECK (status IN ('draft','review','final')),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

-- ====== AI CONVERSATIONS ======

CREATE TABLE IF NOT EXISTS public.mis_ai_conversations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  title text DEFAULT 'Neue Unterhaltung',
  messages jsonb DEFAULT '[]',
  context jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ====== TASKS & NOTIFICATIONS ======

CREATE TABLE IF NOT EXISTS public.mis_tasks (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  description text,
  module text NOT NULL,
  priority text DEFAULT 'medium' CHECK (priority IN ('low','medium','high','critical')),
  status text DEFAULT 'open' CHECK (status IN ('open','in_progress','review','done','cancelled')),
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  due_date date,
  completed_at timestamptz,
  tags text[] DEFAULT '{}',
  metadata jsonb DEFAULT '{}',
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.mis_notifications (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  message text,
  type text DEFAULT 'info' CHECK (type IN ('info','warning','error','success','task','review')),
  module text,
  link text,
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- ====== RLS Policies ======

ALTER TABLE public.mis_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mis_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mis_kpis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mis_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mis_notifications ENABLE ROW LEVEL SECURITY;

-- Admin full access policies
CREATE POLICY "Admin full access on mis_documents" ON public.mis_documents FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

CREATE POLICY "Admin full access on mis_audit_log" ON public.mis_audit_log FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

CREATE POLICY "Admin full access on mis_kpis" ON public.mis_kpis FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

CREATE POLICY "Admin full access on mis_tasks" ON public.mis_tasks FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

CREATE POLICY "Users see own notifications" ON public.mis_notifications FOR SELECT USING (
  user_id = auth.uid()
);

-- ====== SEED: Default Categories ======

INSERT INTO public.mis_document_categories (name, slug, icon, sort_order) VALUES
  ('Unternehmensdokumente', 'company', 'building', 1),
  ('Finanzen', 'finance', 'banknote', 2),
  ('Qualitätsmanagement', 'quality', 'shield-check', 3),
  ('Personalwesen', 'hr', 'users', 4),
  ('Recht & Compliance', 'legal', 'scale', 5),
  ('Technologie', 'technology', 'cpu', 6),
  ('Marketing', 'marketing', 'megaphone', 7),
  ('Data Room', 'dataroom', 'lock', 8),
  ('ISO 9001', 'iso9001', 'award', 9),
  ('Lieferanten', 'suppliers', 'truck', 10)
ON CONFLICT (slug) DO NOTHING;

-- ====== SEED: Default Data Room Sections ======

INSERT INTO public.mis_dataroom_sections (name, slug, description, sort_order) VALUES
  ('Unternehmensübersicht', 'company-overview', 'Firmenstruktur, Geschichte, Vision & Mission', 1),
  ('Pitch Deck', 'pitch-deck', 'Investorenpräsentation und Zusammenfassung', 2),
  ('Markenidentität', 'brand-identity', 'Brand Guidelines, Logo, Farben, Typografie', 3),
  ('Marktanalyse', 'market-analysis', 'TAM/SAM/SOM, Wettbewerbslandschaft', 4),
  ('Finanzprognosen', 'financial-projections', '5-Jahres-Prognose, Unit Economics, Budgets', 5),
  ('Produkt & Technologie', 'product-technology', 'Tech Stack, Architektur, Roadmap', 6),
  ('Go-To-Market', 'go-to-market', 'Vertriebs- und Marketingstrategie', 7),
  ('Recht & Compliance', 'legal-compliance', 'Regulierung, DSGVO, Verträge', 8)
ON CONFLICT (slug) DO NOTHING;

-- ====== SEED: Default KPIs ======

INSERT INTO public.mis_kpis (name, slug, category, value, target, unit, trend, period) VALUES
  ('Monatlich aktive Nutzer', 'mau', 'product', 0, 500, 'Nutzer', 'up', '2026-Q1'),
  ('Buchungen pro Monat', 'monthly-bookings', 'product', 0, 200, 'Buchungen', 'up', '2026-Q1'),
  ('Umsatz', 'revenue', 'finance', 0, 25000, '€', 'up', '2026-Q1'),
  ('Burn Rate', 'burn-rate', 'finance', 12000, 15000, '€/Monat', 'stable', '2026-Q1'),
  ('Kundenzufriedenheit', 'csat', 'quality', 0, 4.5, '/5', 'stable', '2026-Q1'),
  ('Engel Verfügbarkeit', 'angel-availability', 'operations', 0, 85, '%', 'up', '2026-Q1'),
  ('Durchschnittlicher Buchungswert', 'avg-booking-value', 'finance', 0, 45, '€', 'stable', '2026-Q1'),
  ('Plattformgebühr', 'platform-fee', 'finance', 18, 18, '%', 'stable', '2026-Q1'),
  ('ISO 9001 Compliance', 'iso-compliance', 'quality', 0, 100, '%', 'up', '2026-Q1'),
  ('Lieferantenbewertung', 'supplier-rating', 'supply-chain', 0, 4.0, '/5', 'stable', '2026-Q1'),
  ('Entlastungsbetrag', 'entlastungsbetrag', 'market', 131, 131, '€/Monat', 'stable', '2026'),
  ('TAM', 'tam', 'market', 24.6, 24.6, 'Mrd. €', 'up', '2026'),
  ('SAM', 'sam', 'market', 7.84, 7.84, 'Mrd. €', 'up', '2026'),
  ('SOM (Jahr 5)', 'som', 'market', 52, 52, 'Mio. €', 'up', '2026')
ON CONFLICT DO NOTHING;

-- ====== SEED: Default Quality Processes ======

INSERT INTO public.mis_quality_processes (process_id, name, description, category, risk_level) VALUES
  ('QP-001', 'Benutzerregistrierung', 'Onboarding-Prozess für Kunden und Engel', 'core', 'medium'),
  ('QP-002', 'Buchungsmanagement', 'Buchung, Bestätigung, Abschluss', 'core', 'high'),
  ('QP-003', 'Engel-Zertifizierung', 'Qualifikationsprüfung und Zertifizierung', 'core', 'high'),
  ('QP-004', 'Zahlungsabwicklung', 'Rechnungsstellung und Zahlungsfluss', 'core', 'critical'),
  ('QP-005', 'Kundensupport', 'Anfragen, Beschwerden, Feedback', 'support', 'medium'),
  ('QP-006', 'Datenschutz', 'DSGVO-konforme Datenverarbeitung', 'management', 'critical'),
  ('QP-007', 'Dokumentenlenkung', 'ISO 9001 Dokumentenmanagement', 'management', 'medium'),
  ('QP-008', 'Management Review', 'Regelmäßige Überprüfung des QMS', 'management', 'low'),
  ('QP-009', 'Lieferantenbewertung', 'Regelmäßige Bewertung der Lieferanten', 'support', 'medium'),
  ('QP-010', 'Kontinuierliche Verbesserung', 'KVP und CAPA-Prozess', 'management', 'low')
ON CONFLICT (process_id) DO NOTHING;

-- ====== Functions ======

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'mis_documents','mis_kpis','mis_quality_processes',
    'mis_capa','mis_suppliers','mis_purchase_orders',
    'mis_budget_items','mis_tasks','mis_ai_conversations'
  ]) LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_updated_at ON public.%I', t);
    EXECUTE format('CREATE TRIGGER trg_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION update_updated_at()', t);
  END LOOP;
END $$;

-- ====== Storage Bucket ======

INSERT INTO storage.buckets (id, name, public) VALUES ('mis-documents', 'mis-documents', false)
ON CONFLICT (id) DO NOTHING;
