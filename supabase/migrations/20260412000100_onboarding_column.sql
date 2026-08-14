-- ═══════════════════════════════════════════════════════════
-- MIGRATION: Onboarding-Spalte für Profile
-- ═══════════════════════════════════════════════════════════
-- Fügt onboarding_completed Spalte hinzu.
-- Standard: true für existierende Benutzer (damit sie das Onboarding nicht sehen).
-- Neue Benutzer bekommen false (über den Trigger).
-- ═══════════════════════════════════════════════════════════

-- Spalte hinzufügen (Standard true für bestehende User)
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT true;

-- Bestehende User: onboarding ist abgeschlossen
UPDATE profiles SET onboarding_completed = true WHERE onboarding_completed IS NULL;

-- Trigger: Neue Kunden bekommen onboarding_completed = false
CREATE OR REPLACE FUNCTION set_onboarding_for_new_kunde()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.role = 'kunde' THEN
    NEW.onboarding_completed := false;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_onboarding_new_kunde ON profiles;
CREATE TRIGGER trg_onboarding_new_kunde
  BEFORE INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION set_onboarding_for_new_kunde();
