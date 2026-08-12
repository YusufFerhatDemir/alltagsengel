-- Rollback: Zahlungseingangs-Matching & OPOS (Block 4)

DROP TABLE IF EXISTS klaerfaelle CASCADE;
DROP TABLE IF EXISTS zahlungseingaenge CASCADE;
DROP TABLE IF EXISTS camt_imports CASCADE;

-- Audit-Constraint zurueck auf vorherigen Stand (mit billing_fristen, ohne Block 4)
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
