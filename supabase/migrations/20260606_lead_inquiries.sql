-- ═══════════════════════════════════════════════════════════
-- MIGRATION: Lead Inquiries Tabelle
-- ═══════════════════════════════════════════════════════════
-- Speichert Beratungsanfragen vom Website-Formular.
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS lead_inquiries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  plz TEXT NOT NULL,
  message TEXT,
  source TEXT DEFAULT 'website',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE lead_inquiries ENABLE ROW LEVEL SECURITY;

-- Admins dürfen alles lesen/bearbeiten
DROP POLICY IF EXISTS "Admin full access lead_inquiries" ON lead_inquiries;
CREATE POLICY "Admin full access lead_inquiries" ON lead_inquiries
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Öffentliches Insert (Website-Formular, kein Auth nötig)
DROP POLICY IF EXISTS "Anyone can submit lead inquiry" ON lead_inquiries;
CREATE POLICY "Anyone can submit lead inquiry" ON lead_inquiries
  FOR INSERT WITH CHECK (true);
