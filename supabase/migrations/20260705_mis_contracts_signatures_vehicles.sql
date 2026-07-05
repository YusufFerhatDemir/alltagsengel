-- =============================================
-- MIS: Verträge, Unterschriften, Fahrzeuge
-- 2026-07-05
-- =============================================

-- 1) Vertragsmanagement
CREATE TABLE IF NOT EXISTS mis_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  partner TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'Sonstige',
  status TEXT NOT NULL DEFAULT 'draft',
  start_date DATE,
  end_date DATE,
  value NUMERIC(12,2),
  auto_renew BOOLEAN DEFAULT FALSE,
  notice_period_days INTEGER DEFAULT 30,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE mis_contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mis_contracts_all" ON mis_contracts
  FOR ALL USING (true) WITH CHECK (true);

-- 2) Unterschriften-Management
CREATE TABLE IF NOT EXISTS mis_signature_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_title TEXT NOT NULL,
  document_type TEXT NOT NULL DEFAULT 'Vertrag',
  signer_name TEXT NOT NULL,
  signer_email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  sent_at TIMESTAMPTZ,
  signed_at TIMESTAMPTZ,
  expires_at DATE,
  notes TEXT DEFAULT '',
  file_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE mis_signature_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mis_signatures_all" ON mis_signature_requests
  FOR ALL USING (true) WITH CHECK (true);

-- 3) Fahrzeugverwaltung
CREATE TABLE IF NOT EXISTS mis_vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plate TEXT NOT NULL UNIQUE,
  brand TEXT NOT NULL,
  model TEXT NOT NULL,
  year INTEGER NOT NULL DEFAULT 2024,
  fuel_type TEXT NOT NULL DEFAULT 'Benzin',
  status TEXT NOT NULL DEFAULT 'available',
  current_km INTEGER DEFAULT 0,
  next_tuev DATE,
  next_service_km INTEGER,
  insurance_until DATE,
  assigned_to TEXT,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE mis_vehicles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mis_vehicles_all" ON mis_vehicles
  FOR ALL USING (true) WITH CHECK (true);

-- Indices
CREATE INDEX IF NOT EXISTS idx_contracts_status ON mis_contracts(status);
CREATE INDEX IF NOT EXISTS idx_contracts_end_date ON mis_contracts(end_date);
CREATE INDEX IF NOT EXISTS idx_signatures_status ON mis_signature_requests(status);
CREATE INDEX IF NOT EXISTS idx_vehicles_status ON mis_vehicles(status);
CREATE INDEX IF NOT EXISTS idx_vehicles_plate ON mis_vehicles(plate);
