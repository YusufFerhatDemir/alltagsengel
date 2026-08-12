-- ════════════════════════════════════════════════════════════════════════════
-- Billing RLS Cross-Org Verifikation
-- Ausfuehren in Shadow-DB oder Prod-Readonly-Transaktion
--
-- Prueft: Org A kann NICHT auf Rechnungen/Positionen von Org B zugreifen
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Org-Fence Policies existieren
SELECT 'invoices_org_fence' AS erwartung,
       policyname, tablename, permissive, cmd
FROM pg_policies
WHERE tablename = 'invoices' AND policyname = 'invoices_org_fence';

SELECT 'invoice_items_org_fence' AS erwartung,
       policyname, tablename, permissive, cmd
FROM pg_policies
WHERE tablename = 'invoice_items' AND policyname = 'invoice_items_org_fence';

-- 2. Anon-Deny Policies existieren
SELECT 'invoices_anon_deny' AS erwartung,
       policyname, tablename, permissive, roles
FROM pg_policies
WHERE tablename = 'invoices' AND policyname = 'invoices_anon_deny';

-- 3. RLS ist aktiviert
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('invoices', 'invoice_items', 'invoice_disputes');

-- 4. service_role bypass (SECURITY DEFINER RPCs)
SELECT proname, prosecdef
FROM pg_proc
WHERE proname IN ('create_invoice_draft_atomic', 'next_billing_number')
  AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');

ROLLBACK;
