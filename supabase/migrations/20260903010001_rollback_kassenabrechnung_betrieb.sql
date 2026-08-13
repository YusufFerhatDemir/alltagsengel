-- ═══════════════════════════════════════════════════════════════
-- ROLLBACK zu 20260903010000_kassenabrechnung_betrieb.sql
--
-- ACHTUNG — was dieser Rollback vernichtet:
--   · den Verlauf aller Umschaltungen zwischen Test- und Echtbetrieb
--   · das Austauschprotokoll der Zugangsmittel
--   · den Arbeitsvorrat nicht zustellbarer Übertragungen
--
-- Die Zugangsmittel selbst sind NICHT betroffen: Zertifikate und SSH-Keys
-- liegen im Storage-Bucket, das Passwort in einer Env-Variable. Diese Tabelle
-- enthält nur Metadaten.
--
-- Vor dem Ausführen: sind offene dta_dead_letter-Einträge vorhanden? Sie
-- gehen ersatzlos verloren und die betroffenen Aufträge bleiben mit Status
-- 'technischer_fehler' zurück, ohne dass irgendwo steht, dass sie liegen.
--
--   SELECT kanal, status, count(*) FROM public.dta_dead_letter
--    WHERE status IN ('offen','in_analyse') GROUP BY 1,2;
--
-- Der Entity-Type-CHECK auf billing_audit_trail wird auf den Stand von
-- 20260902010000 zurückgesetzt. Bereits geschriebene Audit-Zeilen mit den
-- neuen Typen würden den Constraint verletzen — sie werden vorher entfernt,
-- weil ein nicht validierbarer Constraint schlimmer ist als eine fehlende
-- Protokollzeile eines zurückgerollten Moduls.
-- ═══════════════════════════════════════════════════════════════

BEGIN;

DROP TRIGGER IF EXISTS trg_abrechnung_betriebsmodus_updated ON public.abrechnung_betriebsmodus;
DROP TRIGGER IF EXISTS trg_dta_dead_letter_updated ON public.dta_dead_letter;

DROP TABLE IF EXISTS public.dta_dead_letter;
DROP TABLE IF EXISTS public.abrechnung_credential_rotationen;
DROP TABLE IF EXISTS public.abrechnung_betriebsmodus_historie;
DROP TABLE IF EXISTS public.abrechnung_betriebsmodus;

DROP FUNCTION IF EXISTS public.set_updated_at_abrechnung_betrieb();

DELETE FROM public.billing_audit_trail
 WHERE entity_type IN ('abrechnung_betriebsmodus', 'abrechnung_credential', 'dta_dead_letter');

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
      'kim_konfiguration', 'kim_formatversion', 'kim_karte', 'kim_nachricht',
      'dta_versand', 'dta_wiedervorlage', 'dta_fehlercode'
    ])
  );

COMMIT;
