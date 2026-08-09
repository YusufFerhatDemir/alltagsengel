-- ════════════════════════════════════════════════════════════════════════════
-- Migration: Billing Org-Fence Haertung (F1 Audit-Fix)
-- Datum: 2026-08-09
-- Branch: staging/expansion-abnahme
--
-- BEFUND F1 (HIGH): invoices und invoice_items brauchen explizite
-- org_fence RESTRICTIVE Policies. Phase-3 hat diese dynamisch erstellt,
-- aber spaetere Migrationen koennten sie ueberschrieben haben.
-- Diese Migration stellt sicher, dass:
--   1. RESTRICTIVE org_fence auf invoices und invoice_items existiert
--   2. Anon-Zugriff explizit gesperrt ist
--   3. Service-role-Bypass dokumentiert ist (SECURITY DEFINER RPCs only)
--
-- KEINE Produktionsdaten veraendert. KEINE erfundenen Preise.
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- 1. invoices: RESTRICTIVE org_fence (idempotent, DROP IF EXISTS)
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invoices_org_fence" ON public.invoices;
CREATE POLICY "invoices_org_fence" ON public.invoices
  AS RESTRICTIVE FOR ALL TO authenticated
  USING  (organization_id = public.current_org_id())
  WITH CHECK (organization_id = public.current_org_id());

-- ────────────────────────────────────────────────────────────────────────────
-- 2. invoice_items: RESTRICTIVE org_fence (idempotent)
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invoice_items_org_fence" ON public.invoice_items;
CREATE POLICY "invoice_items_org_fence" ON public.invoice_items
  AS RESTRICTIVE FOR ALL TO authenticated
  USING  (organization_id = public.current_org_id())
  WITH CHECK (organization_id = public.current_org_id());

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Sicherstellen: Kein anon-Zugriff (Defense-in-Depth)
-- ────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "invoices_anon_deny" ON public.invoices;
CREATE POLICY "invoices_anon_deny" ON public.invoices
  AS RESTRICTIVE FOR ALL TO anon
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS "invoice_items_anon_deny" ON public.invoice_items;
CREATE POLICY "invoice_items_anon_deny" ON public.invoice_items
  AS RESTRICTIVE FOR ALL TO anon
  USING (false)
  WITH CHECK (false);

-- ────────────────────────────────────────────────────────────────────────────
-- 4. invoice_disputes: gleiche Behandlung
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.invoice_disputes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invoice_disputes_org_fence" ON public.invoice_disputes;
CREATE POLICY "invoice_disputes_org_fence" ON public.invoice_disputes
  AS RESTRICTIVE FOR ALL TO authenticated
  USING  (organization_id = public.current_org_id())
  WITH CHECK (organization_id = public.current_org_id());

-- ════════════════════════════════════════════════════════════════════════════
-- VERIFIKATION (nach Apply):
--   SELECT policyname, permissive, roles, cmd
--   FROM pg_policies WHERE tablename IN ('invoices','invoice_items')
--   ORDER BY tablename, policyname;
--   -- Erwartung: je Tabelle mind. invoices_org_fence (RESTRICTIVE)
--   --           + invoices_admin_all (PERMISSIVE)
-- ════════════════════════════════════════════════════════════════════════════
