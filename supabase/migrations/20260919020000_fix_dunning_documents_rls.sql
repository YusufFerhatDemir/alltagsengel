-- ═══════════════════════════════════════════════════════════════
-- Fix: RLS auf dunning_documents/sepa_* — profiles-Subquery + totes
-- app.current_org_id() ersetzen (Audit "Mahnwesen" 2026-08-15)
-- ═══════════════════════════════════════════════════════════════
--
-- 20260812120000_sepa_mandate_and_mahnung.sql legte fuer
-- sepa_mandates/sepa_batches/sepa_batch_items/dunning_documents zwei
-- fehlerhafte Policy-Muster an, die im gleichzeitigen Umbau
-- 20260822020000_billing_policies_is_admin.sql (dunning_entries,
-- payments, ...) NICHT mitgezogen wurden:
--
-- 1) admin_crud_*: EXISTS(SELECT 1 FROM profiles WHERE id = auth.uid() ...)
--    statt public.is_admin() — 42P17-Rekursionsrisiko, sobald profiles
--    eigene RLS-Policies bekommt (siehe 20260822020000, Kommentar P1).
--
-- 2) org_fence_*: current_setting('app.current_org_id', true)::uuid —
--    diese Session-Variable wird an KEINER Stelle im Anwendungscode
--    gesetzt (kein set_config('app.current_org_id', ...) im Repo).
--    Die RESTRICTIVE-Klausel ist damit fuer authenticated/anon IMMER
--    NULL = organization_id, also false — die Policy blockiert jede
--    Zeile. In der Praxis unbemerkt, weil alle App-Zugriffe auf diese
--    vier Tabellen ausschliesslich ueber den service_role-Admin-Client
--    laufen (RLS-Bypass) — siehe app/api/billing/dunning/dokumente/route.ts.
--    Sollte sich das aendern (z. B. ein direkter Client-Read), wuerde
--    die Tabelle fail-closed leer erscheinen statt fail-open zu lecken —
--    aber das Muster ist inkonsistent zum Rest des Codes und gehoert
--    auf current_org_id() vereinheitlicht (siehe dunning_entries).
--
-- Diese Migration wurde NICHT gegen Supabase angewendet (kein DB-Zugang
-- in dieser Session) — wartet auf manuelles Apply.
-- ═══════════════════════════════════════════════════════════════

-- ── admin_crud_*: profiles-Subquery → is_admin() ──────────────────────────
DROP POLICY IF EXISTS admin_crud_sepa_mandates ON sepa_mandates;
CREATE POLICY admin_crud_sepa_mandates ON sepa_mandates
  FOR ALL TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS admin_crud_sepa_batches ON sepa_batches;
CREATE POLICY admin_crud_sepa_batches ON sepa_batches
  FOR ALL TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS admin_crud_sepa_batch_items ON sepa_batch_items;
CREATE POLICY admin_crud_sepa_batch_items ON sepa_batch_items
  FOR ALL TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS admin_crud_dunning_documents ON dunning_documents;
CREATE POLICY admin_crud_dunning_documents ON dunning_documents
  FOR ALL TO authenticated USING (public.is_admin());

-- ── org_fence_*: totes app.current_org_id → current_org_id() ─────────────
DROP POLICY IF EXISTS org_fence_sepa_mandates ON sepa_mandates;
CREATE POLICY org_fence_sepa_mandates ON sepa_mandates AS RESTRICTIVE
  FOR ALL USING (organization_id = public.current_org_id())
  WITH CHECK (organization_id = public.current_org_id());

DROP POLICY IF EXISTS org_fence_sepa_batches ON sepa_batches;
CREATE POLICY org_fence_sepa_batches ON sepa_batches AS RESTRICTIVE
  FOR ALL USING (organization_id = public.current_org_id())
  WITH CHECK (organization_id = public.current_org_id());

DROP POLICY IF EXISTS org_fence_sepa_batch_items ON sepa_batch_items;
CREATE POLICY org_fence_sepa_batch_items ON sepa_batch_items AS RESTRICTIVE
  FOR ALL USING (organization_id = public.current_org_id())
  WITH CHECK (organization_id = public.current_org_id());

DROP POLICY IF EXISTS org_fence_dunning_documents ON dunning_documents;
CREATE POLICY org_fence_dunning_documents ON dunning_documents AS RESTRICTIVE
  FOR ALL USING (organization_id = public.current_org_id())
  WITH CHECK (organization_id = public.current_org_id());
