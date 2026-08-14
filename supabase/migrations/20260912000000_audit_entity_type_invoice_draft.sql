-- ════════════════════════════════════════════════════════════════════════════
-- Migration: entity_type 'invoice_draft' im billing_audit_trail zulassen
-- Datum:     2026-08-14
-- Rollback:  20260912000001_rollback_audit_entity_type_invoice_draft.sql
--
-- BEFUND (Audit B, live auf Production nachgewiesen)
--
--   create_invoice_draft_atomic() v8 (20260911010000) schreibt beim Abbruch
--   wegen fehlender Unterschrift einen Audit-Eintrag und wirft danach
--   MISSING_SIGNATURE:
--
--       INSERT INTO public.billing_audit_trail (… entity_type …)
--       VALUES (p_org_id, 'invoice_draft', p_client_id, 'missing_signature', …);
--       RAISE EXCEPTION 'MISSING_SIGNATURE: …';
--
--   'invoice_draft' steht aber NICHT in
--   billing_audit_trail_entity_type_check. Der INSERT scheitert deshalb
--   IMMER mit SQLSTATE 23514, und zwar VOR dem RAISE. Folge:
--
--     1) Der Aufrufer sieht nicht "MISSING_SIGNATURE: 2 von 2 Nachweisen sind
--        nicht unterschrieben", sondern
--        'new row for relation "billing_audit_trail" violates check
--         constraint "billing_audit_trail_entity_type_check"'.
--        lib/billing/core/invoice-engine.ts reicht diesen Text unveraendert
--        als "Atomare Rechnungserstellung fehlgeschlagen: …" weiter — fuer
--        die Abrechnungskraft nicht interpretierbar.
--     2) Der forensische Nachweis des abgewiesenen Versuchs entsteht nie.
--        Genau dieser Eintrag ist der Zweck der Unterschriftspflicht.
--
--   Die Sperre selbst hielt: es wurde in keinem Fall eine Rechnung ohne
--   Unterschrift erzeugt (Rollback der gesamten Transaktion).
--
-- WARUM DIE VOKABEL ERWEITERT WIRD (und die RPC nicht auf 'invoice' umgestellt)
--
--   entity_id traegt bei diesem Eintrag eine client_id, keine invoice_id —
--   es gibt zum Abbruchzeitpunkt keine Rechnung. Ein Eintrag mit
--   entity_type='invoice' und einer Klienten-UUID in entity_id waere im
--   Audit-Trail schlicht falsch. Die Vokabel wird deshalb um den real
--   auftretenden Typ ergaenzt, wie schon in 20260902010000 / 20260903010000.
--
-- Idempotent, keine Datenaenderung.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'billing_audit_trail_entity_type_check'
      AND pg_get_constraintdef(oid) LIKE '%invoice_draft%'
  ) THEN
    ALTER TABLE public.billing_audit_trail
      DROP CONSTRAINT IF EXISTS billing_audit_trail_entity_type_check;
    ALTER TABLE public.billing_audit_trail
      ADD CONSTRAINT billing_audit_trail_entity_type_check CHECK (
        entity_type = ANY(ARRAY[
          'invoice', 'invoice_draft', 'tariff', 'correction', 'snapshot',
          'credit_note', 'payment', 'payment_allocation', 'dunning',
          'payment_difference', 'monthly_closing',
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
  END IF;
END $$;

COMMENT ON CONSTRAINT billing_audit_trail_entity_type_check
  ON public.billing_audit_trail IS
  'Kontrolliertes Vokabular der auditierten Objekttypen. '
  'invoice_draft ist der abgewiesene Rechnungsentwurf — entity_id traegt '
  'dort eine client_id, weil zum Abbruchzeitpunkt keine Rechnung existiert.';
