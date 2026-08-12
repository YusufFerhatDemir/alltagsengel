-- ════════════════════════════════════════════════════════════════════════════
-- Migration: Zahlungseingangs-Matching & OPOS (Block 4)
-- Datum: 2026-08-12
-- Tabellen: camt_imports, zahlungseingaenge, klaerfaelle
-- RLS: org_fence RESTRICTIVE + is_admin()
-- Audit: CHECK-Constraint erweitert um 4 neue Entity Types
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- 1. CAMT-Imports — pro hochgeladener CAMT-Datei ein Eintrag
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS camt_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  dateiname TEXT NOT NULL,
  import_datum TIMESTAMPTZ NOT NULL DEFAULT now(),
  buchungen_anzahl INT NOT NULL DEFAULT 0,
  zugeordnet_anzahl INT NOT NULL DEFAULT 0,
  klaerfaelle_anzahl INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'importiert'
    CHECK (status IN ('importiert', 'verarbeitet', 'fehler')),
  quelldatei_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  UNIQUE(organization_id, quelldatei_hash)
);

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Zahlungseingaenge — jede Buchung aus dem CAMT
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS zahlungseingaenge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  camt_import_id UUID NOT NULL REFERENCES camt_imports(id) ON DELETE CASCADE,
  buchungsdatum DATE NOT NULL,
  valutadatum DATE,
  betrag_cent BIGINT NOT NULL,
  waehrung TEXT NOT NULL DEFAULT 'EUR',
  debitor_name TEXT,
  debitor_iban TEXT,
  verwendungszweck TEXT,
  end_to_end_id TEXT,
  mandate_id TEXT,
  buchungsreferenz TEXT,
  ist_ruecklastschrift BOOLEAN NOT NULL DEFAULT false,
  zuordnungs_status TEXT NOT NULL DEFAULT 'klaerfall'
    CHECK (zuordnungs_status IN ('automatisch', 'manuell', 'klaerfall', 'zugeordnet')),
  zuordnungs_confidence INT DEFAULT 0,
  payment_id UUID REFERENCES payments(id),
  quelldatei_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Klaerfaelle — unklare Zuordnungen zur manuellen Bearbeitung
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS klaerfaelle (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  zahlungseingang_id UUID NOT NULL REFERENCES zahlungseingaenge(id) ON DELETE CASCADE,
  grund TEXT NOT NULL,
  vorschlaege JSONB DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'offen'
    CHECK (status IN ('offen', 'zugeordnet', 'abgeschrieben')),
  bearbeitet_von UUID REFERENCES auth.users(id),
  bearbeitet_am TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ────────────────────────────────────────────────────────────────────────────
-- 4. Indizes
-- ────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_zahlungseingaenge_org_status
  ON zahlungseingaenge(organization_id, zuordnungs_status);
CREATE INDEX IF NOT EXISTS idx_zahlungseingaenge_org_datum
  ON zahlungseingaenge(organization_id, buchungsdatum);
CREATE INDEX IF NOT EXISTS idx_zahlungseingaenge_hash
  ON zahlungseingaenge(quelldatei_hash);
CREATE INDEX IF NOT EXISTS idx_klaerfaelle_org_status
  ON klaerfaelle(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_camt_imports_org
  ON camt_imports(organization_id);

-- ────────────────────────────────────────────────────────────────────────────
-- 5. RLS aktivieren
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE camt_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE zahlungseingaenge ENABLE ROW LEVEL SECURITY;
ALTER TABLE klaerfaelle ENABLE ROW LEVEL SECURITY;

-- org_fence RESTRICTIVE
CREATE POLICY org_fence_camt_imports ON camt_imports AS RESTRICTIVE
  FOR ALL USING (organization_id = current_setting('app.current_org_id', true)::uuid);
CREATE POLICY org_fence_zahlungseingaenge ON zahlungseingaenge AS RESTRICTIVE
  FOR ALL USING (organization_id = current_setting('app.current_org_id', true)::uuid);
CREATE POLICY org_fence_klaerfaelle ON klaerfaelle AS RESTRICTIVE
  FOR ALL USING (organization_id = current_setting('app.current_org_id', true)::uuid);

-- Admin CRUD via is_admin()
CREATE POLICY admin_crud_camt_imports ON camt_imports
  FOR ALL TO authenticated
  USING (public.is_admin());
CREATE POLICY admin_crud_zahlungseingaenge ON zahlungseingaenge
  FOR ALL TO authenticated
  USING (public.is_admin());
CREATE POLICY admin_crud_klaerfaelle ON klaerfaelle
  FOR ALL TO authenticated
  USING (public.is_admin());

-- ────────────────────────────────────────────────────────────────────────────
-- 6. Audit CHECK-Constraint erweitern
-- ────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'billing_audit_trail_entity_type_check'
      AND pg_get_constraintdef(oid) LIKE '%camt_import%'
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
          'camt_import', 'zahlungseingang', 'klaerfall', 'ruecklastschrift'
        ])
      );
  END IF;
END $$;
