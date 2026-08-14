-- ════════════════════════════════════════════════════════════════════════════
-- Rollback zu 20260912000000_audit_entity_type_invoice_draft.sql
--
-- Nimmt 'invoice_draft' wieder aus dem Vokabular. ACHTUNG: danach scheitert
-- der MISSING_SIGNATURE-Pfad von create_invoice_draft_atomic() wieder mit
-- 23514 statt mit der Klartextmeldung. Die Unterschriftssperre selbst bleibt
-- wirksam — nur der Audit-Eintrag und die verstaendliche Fehlermeldung gehen
-- verloren.
--
-- Der Rollback bricht ab, wenn bereits Zeilen mit entity_type='invoice_draft'
-- existieren: sie waeren sonst constraint-widrig und der ALTER wuerde
-- fehlschlagen. Audit-Zeilen duerfen nicht geloescht werden (Trigger
-- trg_audit_trail_no_delete), also ist ein Rollback dann nicht moeglich.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_zeilen INTEGER;
BEGIN
  SELECT count(*) INTO v_zeilen
  FROM public.billing_audit_trail
  WHERE entity_type = 'invoice_draft';

  IF v_zeilen > 0 THEN
    RAISE EXCEPTION
      'Rollback nicht moeglich: % Audit-Zeile(n) mit entity_type=''invoice_draft'' '
      'vorhanden. Audit-Zeilen sind unveraenderlich und duerfen nicht geloescht '
      'werden.', v_zeilen;
  END IF;

  ALTER TABLE public.billing_audit_trail
    DROP CONSTRAINT IF EXISTS billing_audit_trail_entity_type_check;
  ALTER TABLE public.billing_audit_trail
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
        'sepa_mandate', 'sepa_batch', 'dunning_document', 'billing_fristen',
        'camt_import', 'zahlungseingang', 'klaerfall', 'ruecklastschrift',
        'datev_export', 'datev_kontenzuordnung',
        'sgb_v_lauf', 'sgb_v_formatversion', 'sgb_v_routing',
        'kim_konfiguration', 'kim_formatversion', 'kim_karte',
        'kim_nachricht',
        'dta_versand', 'dta_wiedervorlage', 'dta_fehlercode',
        'abrechnung_betriebsmodus', 'abrechnung_credential',
        'dta_dead_letter'
      ])
    );
END $$;
