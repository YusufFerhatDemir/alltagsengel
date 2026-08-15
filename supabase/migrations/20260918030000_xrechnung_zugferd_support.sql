-- XRechnung/ZUGFeRD Support
-- Leitweg-ID und E-Invoicing-Konfiguration
--
-- Die Leitweg-ID wird als JSONB-Feld in organizations.settings gespeichert
-- (Schlüssel: leitweg_id), da organizations.settings bereits als generischer
-- Konfigurationscontainer dient und keine Schema-Erweiterung nötig ist.
--
-- Für den Fall, dass eine eigene Spalte bevorzugt wird:
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS leitweg_id text;

COMMENT ON COLUMN organizations.leitweg_id IS
  'Leitweg-ID für XRechnung (E-Invoicing B2B/B2G). Format: 0204:XXXXXXXXX-XXXXX-XX';

-- Index für schnellen Lookup (selten, aber bei Batch-Rechnungserstellung relevant)
CREATE INDEX IF NOT EXISTS idx_organizations_leitweg_id
  ON organizations (leitweg_id) WHERE leitweg_id IS NOT NULL;
