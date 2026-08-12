-- ═══════════════════════════════════════════════════════════════
-- ROLLBACK zu 20260830010000_kim_ti_geruest.sql
--
-- Entfernt das KIM/TI-Gerüst vollständig. Es gab keine Änderungen an
-- bestehenden Tabellen ausser der Erweiterung des Audit-Entity-Type-
-- Constraints — der wird auf den Stand VOR dieser Migration zurückgesetzt.
-- ═══════════════════════════════════════════════════════════════

BEGIN;

DROP POLICY IF EXISTS org_fence_kim_konfiguration   ON public.kim_konfiguration;
DROP POLICY IF EXISTS admin_kim_konfiguration_all    ON public.kim_konfiguration;
DROP POLICY IF EXISTS org_fence_kim_formatversionen  ON public.kim_formatversionen;
DROP POLICY IF EXISTS admin_kim_formatversionen_all  ON public.kim_formatversionen;
DROP POLICY IF EXISTS org_fence_kim_karten           ON public.kim_karten;
DROP POLICY IF EXISTS admin_kim_karten_all           ON public.kim_karten;
DROP POLICY IF EXISTS org_fence_kim_nachrichten      ON public.kim_nachrichten;
DROP POLICY IF EXISTS admin_kim_nachrichten_all      ON public.kim_nachrichten;

DROP TABLE IF EXISTS public.kim_nachrichten;
DROP TABLE IF EXISTS public.kim_karten;
DROP TABLE IF EXISTS public.kim_formatversionen;
DROP TABLE IF EXISTS public.kim_konfiguration;

-- Audit-Constraint auf den Stand VOR dieser Migration zurücksetzen
-- (ohne kim_*). Muss zusammen mit dem Rückbau von AUDIT_ENTITY_TYPES in
-- lib/billing/core/audit.ts erfolgen.
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
      'sgb_v_lauf', 'sgb_v_formatversion', 'sgb_v_routing'
    ])
  );

COMMIT;
