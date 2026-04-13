-- care_recipients: Pflegebedürftige Personen die von einem Angehörigen verwaltet werden
CREATE TABLE IF NOT EXISTS care_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  birth_year INTEGER,
  pflegegrad INTEGER CHECK (pflegegrad BETWEEN 1 AND 5),
  address TEXT,
  postal_code TEXT,
  city TEXT,
  relationship TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE care_recipients ENABLE ROW LEVEL SECURITY;
-- Nur der eigene Angehörige sichtbar
CREATE POLICY "care_recipients_owner" ON care_recipients
  FOR ALL USING (profile_id = auth.uid());
-- Admins sehen alles
CREATE POLICY "care_recipients_admin" ON care_recipients
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin'))
  );
