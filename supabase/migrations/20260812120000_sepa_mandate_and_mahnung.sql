-- ═══════════════════════════════════════════════════════════════
-- SEPA-Lastschrift Mandate + Mahnwesen-Outbound Infrastruktur
-- Angewendet auf Production am 2026-08-12
-- ═══════════════════════════════════════════════════════════════

-- 1) Creditor-IBAN + Gläubiger-ID auf organizations
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS iban TEXT,
  ADD COLUMN IF NOT EXISTS bic TEXT,
  ADD COLUMN IF NOT EXISTS bank_name TEXT,
  ADD COLUMN IF NOT EXISTS sepa_creditor_id TEXT;

-- 2) SEPA-Mandate
CREATE TABLE IF NOT EXISTS sepa_mandates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  client_id UUID NOT NULL REFERENCES clients(id),
  mandate_reference TEXT NOT NULL,
  mandate_date DATE NOT NULL,
  mandate_type TEXT NOT NULL DEFAULT 'CORE' CHECK (mandate_type IN ('CORE', 'B2B')),
  sequence_type TEXT NOT NULL DEFAULT 'RCUR' CHECK (sequence_type IN ('FRST', 'RCUR', 'OOFF', 'FNAL')),
  debtor_name TEXT NOT NULL,
  debtor_iban TEXT NOT NULL,
  debtor_bic TEXT,
  status TEXT NOT NULL DEFAULT 'aktiv' CHECK (status IN ('aktiv', 'pausiert', 'widerrufen', 'abgelaufen')),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  revoke_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  UNIQUE(organization_id, mandate_reference)
);

-- 3) SEPA-Batches
CREATE TABLE IF NOT EXISTS sepa_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  batch_number TEXT NOT NULL,
  batch_date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_items INT NOT NULL DEFAULT 0,
  total_cents BIGINT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'erstellt' CHECK (status IN ('erstellt', 'freigegeben', 'exportiert', 'eingereicht', 'verarbeitet', 'fehlerhaft')),
  xml_storage_path TEXT,
  requested_collection_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  UNIQUE(organization_id, batch_number)
);

-- 4) SEPA-Batch-Items
CREATE TABLE IF NOT EXISTS sepa_batch_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  batch_id UUID NOT NULL REFERENCES sepa_batches(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES invoices(id),
  mandate_id UUID NOT NULL REFERENCES sepa_mandates(id),
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  end_to_end_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'offen' CHECK (status IN ('offen', 'eingezogen', 'ruecklastschrift', 'fehlerhaft')),
  error_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5) Mahnungs-Dokumente
CREATE TABLE IF NOT EXISTS dunning_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  dunning_entry_id UUID NOT NULL REFERENCES dunning_entries(id),
  invoice_id UUID NOT NULL REFERENCES invoices(id),
  dunning_level TEXT NOT NULL,
  pdf_storage_path TEXT,
  sent_via TEXT CHECK (sent_via IN ('email', 'post', 'beide')),
  sent_at TIMESTAMPTZ,
  email_to TEXT,
  email_status TEXT DEFAULT 'nicht_gesendet' CHECK (email_status IN ('nicht_gesendet', 'gesendet', 'zugestellt', 'fehlgeschlagen')),
  zahlungsfrist DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- 6) RLS
ALTER TABLE sepa_mandates ENABLE ROW LEVEL SECURITY;
ALTER TABLE sepa_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE sepa_batch_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE dunning_documents ENABLE ROW LEVEL SECURITY;

-- org_fence RESTRICTIVE
CREATE POLICY org_fence_sepa_mandates ON sepa_mandates AS RESTRICTIVE
  FOR ALL USING (organization_id = current_setting('app.current_org_id', true)::uuid);
CREATE POLICY org_fence_sepa_batches ON sepa_batches AS RESTRICTIVE
  FOR ALL USING (organization_id = current_setting('app.current_org_id', true)::uuid);
CREATE POLICY org_fence_sepa_batch_items ON sepa_batch_items AS RESTRICTIVE
  FOR ALL USING (organization_id = current_setting('app.current_org_id', true)::uuid);
CREATE POLICY org_fence_dunning_documents ON dunning_documents AS RESTRICTIVE
  FOR ALL USING (organization_id = current_setting('app.current_org_id', true)::uuid);

-- Admin-CRUD
CREATE POLICY admin_crud_sepa_mandates ON sepa_mandates
  FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','superadmin')));
CREATE POLICY admin_crud_sepa_batches ON sepa_batches
  FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','superadmin')));
CREATE POLICY admin_crud_sepa_batch_items ON sepa_batch_items
  FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','superadmin')));
CREATE POLICY admin_crud_dunning_documents ON dunning_documents
  FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','superadmin')));

-- Stamm-Org IBAN
UPDATE organizations
SET iban = 'DE87100101234463569020',
    bic = 'QNTODEB2XXX',
    bank_name = 'Olinda',
    sepa_creditor_id = 'DE98ZZZ09999999999'
WHERE id = '00000000-0000-4000-8000-000460629986';
