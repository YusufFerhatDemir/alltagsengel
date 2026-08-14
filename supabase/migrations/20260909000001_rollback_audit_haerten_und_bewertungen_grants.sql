-- ════════════════════════════════════════════════════════════════════
-- ROLLBACK zu 20260909000000_audit_haerten_und_bewertungen_grants.sql
-- ════════════════════════════════════════════════════════════════════
-- ACHTUNG: Stellt den Zustand VOR der Haertung wieder her — billing_tariff_audit
-- wird wieder fuer jedes Org-Mitglied schreib-/aenderbar (FOR ALL), die
-- Unveraenderlichkeits-Trigger fallen weg, und anon bekommt das Tabellen-Grant
-- auf angel_reviews/reviews zurueck (RLS aus 20260901000000 bleibt davon
-- unberuehrt und blockt weiterhin alle Zeilen).
-- Nur ausfuehren, wenn die Haertung nachweislich einen Produktionsweg bricht.
-- ════════════════════════════════════════════════════════════════════

BEGIN;

-- ── A) billing_tariff_audit zuruecksetzen ───────────────────────────

DROP TRIGGER IF EXISTS trg_immutable_billing_tariff_audit_update ON public.billing_tariff_audit;
DROP TRIGGER IF EXISTS trg_immutable_billing_tariff_audit_delete ON public.billing_tariff_audit;
DROP FUNCTION IF EXISTS public.prevent_billing_tariff_audit_edit();

DROP POLICY IF EXISTS billing_tariff_audit_select ON public.billing_tariff_audit;
DROP POLICY IF EXISTS billing_tariff_audit_insert ON public.billing_tariff_audit;

CREATE POLICY org_fence_tariff_audit ON public.billing_tariff_audit
  FOR ALL
  USING (organization_id = (
    SELECT om.organization_id FROM organization_members om
    WHERE om.user_id = auth.uid()
    LIMIT 1
  ))
  WITH CHECK (organization_id = (
    SELECT om.organization_id FROM organization_members om
    WHERE om.user_id = auth.uid()
    LIMIT 1
  ));

-- ── B) anon-Grants wiederherstellen ──────────────────────────────────

GRANT SELECT ON public.angel_reviews TO anon;
GRANT SELECT ON public.reviews       TO anon;

COMMIT;
