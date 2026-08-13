-- ═══════════════════════════════════════════════════════════════
-- ROLLBACK zu 20260902010000_dta_versand_pipeline.sql
--
-- Entfernt Versandprotokoll, Fehlercode-Katalog und Wiedervorlage-Queue
-- und setzt den Audit-Entity-Constraint auf den Stand von Block 18 zurück.
--
-- ACHTUNG — Datenverlust: dta_versand_protokoll ist der einzige Nachweis
-- darüber, was wann an eine Kasse übermittelt wurde. Vor dem Rollback
-- exportieren, wenn bereits echt versendet wurde.
-- ═══════════════════════════════════════════════════════════════

BEGIN;

DROP TRIGGER IF EXISTS trg_dta_wiedervorlage_updated ON public.dta_wiedervorlage;
DROP TRIGGER IF EXISTS trg_dta_fehlercode_katalog_updated ON public.dta_fehlercode_katalog;

DROP TABLE IF EXISTS public.dta_wiedervorlage;
DROP TABLE IF EXISTS public.dta_fehlercode_katalog;
DROP TABLE IF EXISTS public.dta_versand_protokoll;

DROP FUNCTION IF EXISTS public.set_updated_at_dta_versand();

-- Audit-Constraint auf den Stand von Block 18 zurücksetzen.
-- Zeilen mit den entfallenden entity_types würden den Constraint verletzen —
-- deshalb erst prüfen, sonst schlägt das ALTER fehl und der Rollback bricht ab.
DO $$
DECLARE
  betroffen integer;
BEGIN
  SELECT count(*) INTO betroffen
  FROM public.billing_audit_trail
  WHERE entity_type IN ('dta_versand', 'dta_wiedervorlage', 'dta_fehlercode');

  IF betroffen > 0 THEN
    RAISE NOTICE 'Rollback: % Audit-Zeilen mit neuen entity_types werden auf "dta_lauf" umgeschrieben (Nachweis bleibt erhalten)', betroffen;
    UPDATE public.billing_audit_trail
       SET entity_type = 'dta_lauf'
     WHERE entity_type IN ('dta_versand', 'dta_wiedervorlage', 'dta_fehlercode');
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
        'sepa_mandate', 'sepa_batch', 'dunning_document',
        'billing_fristen',
        'camt_import', 'zahlungseingang', 'klaerfall', 'ruecklastschrift',
        'datev_export', 'datev_kontenzuordnung',
        'sgb_v_lauf', 'sgb_v_formatversion', 'sgb_v_routing',
        'kim_konfiguration', 'kim_formatversion', 'kim_karte', 'kim_nachricht'
      ])
    );
END $$;

COMMIT;
