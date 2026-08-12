-- ============================================================
-- billing_fristen — Fristen & Wiedervorlagen für Rückläufer
-- ============================================================

CREATE TABLE IF NOT EXISTS billing_fristen (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  aufgabe_id     uuid REFERENCES ops_aufgaben(id),
  ruecklaeufer_id uuid REFERENCES dta_ruecklaeufer(id),
  frist_typ      text NOT NULL CHECK (frist_typ IN (
    'technischer_fehler', 'fachlicher_fehler', 'abgelehnt',
    'teilweise_abgelehnt', 'korrektur_erforderlich',
    'wiedervorlage', 'eskalation'
  )),
  faellig_am     date NOT NULL,
  eskaliert_am   timestamptz,
  eskalationsstufe smallint NOT NULL DEFAULT 0,
  status         text NOT NULL DEFAULT 'offen' CHECK (status IN (
    'offen', 'eskaliert', 'erledigt', 'abgelaufen'
  )),
  notiz          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- Performance index
CREATE INDEX IF NOT EXISTS idx_billing_fristen_org_status_faellig
  ON billing_fristen (organization_id, status, faellig_am);

CREATE INDEX IF NOT EXISTS idx_billing_fristen_ruecklaeufer
  ON billing_fristen (ruecklaeufer_id) WHERE ruecklaeufer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_billing_fristen_aufgabe
  ON billing_fristen (aufgabe_id) WHERE aufgabe_id IS NOT NULL;

-- RLS
ALTER TABLE billing_fristen ENABLE ROW LEVEL SECURITY;

-- org_fence RESTRICTIVE
CREATE POLICY org_fence_billing_fristen ON billing_fristen AS RESTRICTIVE
  FOR ALL USING (organization_id = current_setting('app.current_org_id', true)::uuid);

-- Admin-CRUD
CREATE POLICY admin_crud_billing_fristen ON billing_fristen
  FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','superadmin')));

-- updated_at trigger
CREATE TRIGGER set_updated_at_billing_fristen
  BEFORE UPDATE ON billing_fristen
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);

-- Add billing_fristen to audit entity type CHECK if not already present
DO $$
BEGIN
  -- Check if billing_fristen is already in the constraint
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'billing_audit_trail_entity_type_check'
      AND pg_get_constraintdef(oid) LIKE '%billing_fristen%'
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
          'billing_fristen'
        ])
      );
  END IF;
END $$;
