-- ═══════════════════════════════════════════════════════════════
-- ROLLBACK zu 20260826020000_sgb_v_302_geruest.sql
--
-- Entfernt das § 302-SGB-V-Gerüst vollständig. Die Erweiterungen an
-- abrechnungslaeufe werden zurückgenommen; bestehende § 105-Läufe bleiben
-- unberührt, weil rechtsgrundlage nur ein zusätzliches Feld mit Default war.
-- ═══════════════════════════════════════════════════════════════

BEGIN;

DROP POLICY IF EXISTS org_fence_sgb_v_formatversionen ON public.sgb_v_formatversionen;
DROP POLICY IF EXISTS admin_sgb_v_formatversionen_all  ON public.sgb_v_formatversionen;
DROP POLICY IF EXISTS org_fence_sgb_v_routing          ON public.sgb_v_routing;
DROP POLICY IF EXISTS admin_sgb_v_routing_all          ON public.sgb_v_routing;

DROP TABLE IF EXISTS public.sgb_v_formatversionen;
DROP TABLE IF EXISTS public.sgb_v_routing;

-- Audit-Constraint auf den Stand VOR dieser Migration zurücksetzen
-- (ohne sgb_v_*). Muss zusammen mit dem Rückbau von AUDIT_ENTITY_TYPES
-- in lib/billing/core/audit.ts erfolgen.
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
      'datev_export', 'datev_kontenzuordnung'
    ])
  );

DROP INDEX IF EXISTS public.idx_abrechnungslaeufe_rechtsgrundlage;

ALTER TABLE public.abrechnungslaeufe
  DROP CONSTRAINT IF EXISTS chk_lauf_sgb_v_format,
  DROP CONSTRAINT IF EXISTS chk_lauf_rechtsgrundlage;

ALTER TABLE public.abrechnungslaeufe
  DROP COLUMN IF EXISTS sgb_v_ta_version,
  DROP COLUMN IF EXISTS sgb_v_format,
  DROP COLUMN IF EXISTS rechtsgrundlage;

COMMIT;
