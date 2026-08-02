-- =============================================
-- MIS: Schulungsmanagement
-- Schulungskatalog + Schulungsnachweise
-- 2026-07-05
-- =============================================

-- 1) Schulungskatalog — welche Schulungen gibt es
CREATE TABLE IF NOT EXISTS mis_training_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  category TEXT NOT NULL DEFAULT 'pflicht',  -- pflicht, empfohlen, optional
  validity_months INTEGER NOT NULL DEFAULT 12,  -- wie oft Auffrischung nötig
  provider TEXT DEFAULT '',  -- Anbieter / Schulungsträger
  duration_hours NUMERIC(5,1) DEFAULT 0,  -- Dauer in Stunden
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE mis_training_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mis_training_catalog_all" ON mis_training_catalog;
CREATE POLICY "mis_training_catalog_all" ON mis_training_catalog
  FOR ALL USING (true) WITH CHECK (true);

-- 2) Schulungsnachweise pro Engel
CREATE TABLE IF NOT EXISTS mis_training_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  training_id UUID NOT NULL REFERENCES mis_training_catalog(id) ON DELETE CASCADE,
  engel_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  engel_name TEXT NOT NULL DEFAULT '',  -- denormalisiert für schnelle Anzeige
  completed_date DATE NOT NULL,
  expires_date DATE,  -- berechnet aus completed_date + validity_months
  certificate_url TEXT DEFAULT '',  -- Verweis auf Zertifikat/Dokument
  notes TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'valid',  -- valid, expiring, expired
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE mis_training_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mis_training_records_all" ON mis_training_records;
CREATE POLICY "mis_training_records_all" ON mis_training_records
  FOR ALL USING (true) WITH CHECK (true);

-- Indizes für Performance
CREATE INDEX IF NOT EXISTS idx_training_records_engel ON mis_training_records(engel_id);
CREATE INDEX IF NOT EXISTS idx_training_records_training ON mis_training_records(training_id);
CREATE INDEX IF NOT EXISTS idx_training_records_expires ON mis_training_records(expires_date);
CREATE INDEX IF NOT EXISTS idx_training_records_status ON mis_training_records(status);
