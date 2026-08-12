-- ════════════════════════════════════════════════════════════════════════════
-- Migration: DATEV-Export (Block 5)
-- Datum: 2026-08-12
-- Tabellen: datev_exports, datev_kontenzuordnung
-- RLS: org_fence RESTRICTIVE + is_admin()
-- Audit: CHECK-Constraint erweitert um 2 neue Entity Types
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- 1. datev_exports — pro generiertem DATEV-Export ein Eintrag
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS datev_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  zeitraum_von DATE NOT NULL,
  zeitraum_bis DATE NOT NULL,
  buchungen_anzahl INT NOT NULL DEFAULT 0,
  export_datum TIMESTAMPTZ NOT NULL DEFAULT now(),
  datei_pfad TEXT,
  status TEXT NOT NULL DEFAULT 'erstellt'
    CHECK (status IN ('erstellt', 'heruntergeladen', 'importiert', 'fehler')),
  beraternummer TEXT,
  mandantennummer TEXT,
  kontenrahmen TEXT NOT NULL DEFAULT 'SKR03',
  fehler_details TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ────────────────────────────────────────────────────────────────────────────
-- 2. datev_kontenzuordnung — Klient → Debitorennummer
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS datev_kontenzuordnung (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  client_id UUID REFERENCES clients(id),
  debitorennummer TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, client_id)
);

-- ────────────────────────────────────────────────────────────────────────────
-- 2b. DATEV-Konfiguration als JSONB-Spalte auf organizations
-- ────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'organizations' AND column_name = 'datev_config'
  ) THEN
    ALTER TABLE organizations ADD COLUMN datev_config JSONB DEFAULT NULL;
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Indizes
-- ────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_datev_exports_org
  ON datev_exports(organization_id);
CREATE INDEX IF NOT EXISTS idx_datev_exports_org_zeitraum
  ON datev_exports(organization_id, zeitraum_von, zeitraum_bis);
CREATE INDEX IF NOT EXISTS idx_datev_kontenzuordnung_org
  ON datev_kontenzuordnung(organization_id);
CREATE INDEX IF NOT EXISTS idx_datev_kontenzuordnung_debitor
  ON datev_kontenzuordnung(organization_id, debitorennummer);

-- ────────────────────────────────────────────────────────────────────────────
-- 4. RLS aktivieren
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE datev_exports ENABLE ROW LEVEL SECURITY;
ALTER TABLE datev_kontenzuordnung ENABLE ROW LEVEL SECURITY;

-- org_fence RESTRICTIVE
CREATE POLICY org_fence_datev_exports ON datev_exports AS RESTRICTIVE
  FOR ALL USING (organization_id = current_setting('app.current_org_id', true)::uuid);
CREATE POLICY org_fence_datev_kontenzuordnung ON datev_kontenzuordnung AS RESTRICTIVE
  FOR ALL USING (organization_id = current_setting('app.current_org_id', true)::uuid);

-- Admin CRUD via is_admin()
CREATE POLICY admin_crud_datev_exports ON datev_exports
  FOR ALL TO authenticated
  USING (public.is_admin());
CREATE POLICY admin_crud_datev_kontenzuordnung ON datev_kontenzuordnung
  FOR ALL TO authenticated
  USING (public.is_admin());

-- ────────────────────────────────────────────────────────────────────────────
-- 5. Audit CHECK-Constraint erweitern
-- ────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'billing_audit_trail_entity_type_check'
      AND pg_get_constraintdef(oid) LIKE '%datev_export%'
  ) THEN
    ALTER TABLE billing_audit_trail
      DROP CONSTRAINT IF EXISTS billing_audit_trail_entity_type_check;
    ALTER TABLE billing_audit_trail
      ADD CONSTRAINT billing_audit_trail_entity_type_check CHECK (
        entity_type = ANY(ARRAY[
          'invoice', 'tariff', 'correction', 'snapshot', 'credit_note',
          'payment', 'payment_allocation', 'dunning', 'payment_difference',
          'monthly_closing',
          'dta_lauf', 'dta_kostentraeger', 'dta_dakota_auftrag',
          'dta_ruecklaeufer', 'dta_fehlerprotokoll', 'dta_korrekturlauf',
          'dta_validierung', 'dta_lauf_rechnung', 'dta_annahmestelle',
          'dta_ruecklaeufer_position',
          'dokument', 'dokument_version', 'vertrag', 'kontaktperson',
          'verordnung', 'kundenakte', 'mitarbeiterakte',
          'sepa_mandate', 'sepa_batch', 'dunning_document',
          'billing_fristen',
          'camt_import', 'zahlungseingang', 'klaerfall', 'ruecklastschrift',
          'datev_export', 'datev_kontenzuordnung'
        ])
      );
  END IF;
END $$;
