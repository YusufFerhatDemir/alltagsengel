-- ════════════════════════════════════════════════════════════════════════════
-- Migration: billing_tariff_audit unveraenderlich machen + anon-Grants entziehen
-- Datum:     2026-09-09  (Finale Abnahme, 3 MITTEL-Befunde)
--
-- ── BEFUND A (billing_tariff_audit) ─────────────────────────────────────────
-- org_fence_tariff_audit (20260831040000) ist FOR ALL: jedes Mitglied der
-- Organisation kann Audit-Zeilen INSERT/UPDATE/DELETE, solange organization_id
-- passt. Ein Audit-Trail, den normale Nutzer aendern/loeschen koennen, ist als
-- Nachweis wertlos (dieselbe Klasse Befund wie billing_audit_trail/
-- assignment_audit_log/service_record_audit_log, 20260908020000).
--
-- Fix:
--   - SELECT nur is_admin()/is_internal_staff(), weiterhin org-gefenced.
--   - INSERT nur is_admin() (regulaerer Schreibweg ist der SECURITY-DEFINER-
--     Trigger trg_billing_tariff_audit/trg_leistungspreis_audit, der als
--     Funktionseigentuemer laeuft und von RLS nicht betroffen ist).
--   - KEINE UPDATE/KEINE DELETE-Policy mehr — RLS verweigert beides fuer
--     authenticated per Default. Zusaetzlich ein BEFORE UPDATE/DELETE-Trigger
--     (Muster aus personal_audit_log/wf_audit_log), der unbedingt abbricht —
--     das greift auch dann noch, wenn ein Schreibweg RLS umgeht.
--
-- ── BEFUND B (angel_reviews / reviews, Verifikation von 20260901000000) ────
-- Der RLS-Fence (SELECT nur fuer Beteiligte/Admin) ist live und per PostgREST
-- verifiziert (anon erhaelt [] auf beiden Tabellen). Fehlend war der explizite
-- Grant-Entzug: RLS blockt zwar jede Zeile, aber anon behaelt das GRANT SELECT
-- aus den Default-Privileges (Belt-and-Suspenders-Prinzip aus 20260904000000
-- fuer billing_tarif_belege).
--
-- Rollback: 20260909000001_rollback_audit_haerten_und_bewertungen_grants.sql
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- A) billing_tariff_audit: Rollen-Policies statt FOR ALL, unveraenderlich
-- ─────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS org_fence_tariff_audit ON public.billing_tariff_audit;

CREATE POLICY billing_tariff_audit_select ON public.billing_tariff_audit
  FOR SELECT TO authenticated
  USING (
    (public.is_admin() OR public.is_internal_staff())
    AND organization_id = public.current_org_id()
  );

CREATE POLICY billing_tariff_audit_insert ON public.billing_tariff_audit
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    AND organization_id = public.current_org_id()
  );

CREATE OR REPLACE FUNCTION public.prevent_billing_tariff_audit_edit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'billing_tariff_audit ist unveraenderlich (Revisionssicherheit).';
END;
$$;

DROP TRIGGER IF EXISTS trg_immutable_billing_tariff_audit_update ON public.billing_tariff_audit;
CREATE TRIGGER trg_immutable_billing_tariff_audit_update
  BEFORE UPDATE ON public.billing_tariff_audit
  FOR EACH ROW EXECUTE FUNCTION public.prevent_billing_tariff_audit_edit();

DROP TRIGGER IF EXISTS trg_immutable_billing_tariff_audit_delete ON public.billing_tariff_audit;
CREATE TRIGGER trg_immutable_billing_tariff_audit_delete
  BEFORE DELETE ON public.billing_tariff_audit
  FOR EACH ROW EXECUTE FUNCTION public.prevent_billing_tariff_audit_edit();

REVOKE ALL ON FUNCTION public.prevent_billing_tariff_audit_edit() FROM PUBLIC, anon;

-- ─────────────────────────────────────────────────────────────────────
-- B) angel_reviews / reviews: anon-Grant explizit entziehen
--    (RLS blockt bereits alle Zeilen seit 20260901000000 — dies ist
--    Verteidigung in der Tiefe, kein funktionaler Fix.)
-- ─────────────────────────────────────────────────────────────────────

REVOKE ALL ON public.angel_reviews FROM anon;
REVOKE ALL ON public.reviews       FROM anon;

COMMIT;

-- ════════════════════════════════════════════════════════════════════
-- VERIFIKATION nach dem Apply (manuell ausfuehren):
--
--   a) normaler authenticated User kann keine Audit-Zeile einfuegen:
--      curl -X POST ".../rest/v1/billing_tariff_audit" \
--        -H "Authorization: Bearer $USER_JWT" -H "apikey: $ANON" \
--        -H "Content-Type: application/json" \
--        -d '{"tariff_id":"...","organization_id":"...","aktion":"test"}'
--      → erwartet 403 (RLS-Verstoss)
--
--   b) UPDATE/DELETE scheitern immer, auch fuer Admin/service_role:
--      UPDATE billing_tariff_audit SET aktion = 'x' WHERE id = '...';
--      → erwartet Fehler "billing_tariff_audit ist unveraenderlich"
--
--   c) anon liest 0 Zeilen von angel_reviews/reviews:
--      curl ".../rest/v1/angel_reviews?select=id" -H "apikey: $ANON" \
--        -H "Authorization: Bearer $ANON"
--      → erwartet [] (oder 401 nach dem GRANT-Entzug)
--
--   d) Cross-Tenant: Admin von Org B sieht keine Audit-Zeilen von Org A
--      (organization_id = current_org_id() greift).
-- ════════════════════════════════════════════════════════════════════
