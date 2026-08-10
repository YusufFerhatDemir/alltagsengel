-- ════════════════════════════════════════════════════════════════════════════
-- Migration: Billing-Policies — profiles-Subquery → is_admin()
-- Datum: 2026-08-10
-- Branch: staging/expansion-abnahme
-- P1: 6 Policies nutzen EXISTS(SELECT 1 FROM profiles …) statt is_admin()
--     → 42P17-Rekursionsrisiko wenn profiles RLS-Policies aktiv
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- 1. payments: alte + neue Policy ersetzen
-- ────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can manage all payments" ON public.payments;
DROP POLICY IF EXISTS "Users can view own payments" ON public.payments;
DROP POLICY IF EXISTS "payments_admin_all" ON public.payments;

CREATE POLICY "payments_admin_all" ON public.payments
  FOR ALL TO authenticated
  USING (public.is_admin());

-- ────────────────────────────────────────────────────────────────────────────
-- 2. payment_allocations
-- ────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "alloc_admin_all" ON public.payment_allocations;

CREATE POLICY "alloc_admin_all" ON public.payment_allocations
  FOR ALL TO authenticated
  USING (public.is_admin());

-- ────────────────────────────────────────────────────────────────────────────
-- 3. dunning_entries
-- ────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "dunning_admin_all" ON public.dunning_entries;

CREATE POLICY "dunning_admin_all" ON public.dunning_entries
  FOR ALL TO authenticated
  USING (public.is_admin());

-- ────────────────────────────────────────────────────────────────────────────
-- 4. payment_differences
-- ────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "diff_admin_all" ON public.payment_differences;

CREATE POLICY "diff_admin_all" ON public.payment_differences
  FOR ALL TO authenticated
  USING (public.is_admin());

-- ────────────────────────────────────────────────────────────────────────────
-- 5. Alte 20260319-Policies auf documents (profiles-Subquery)
-- ────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can update own documents" ON public.documents;
DROP POLICY IF EXISTS "Users can delete own documents" ON public.documents;
DROP POLICY IF EXISTS "Admins can manage all documents" ON public.documents;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'documents' AND schemaname = 'public') THEN
    EXECUTE 'CREATE POLICY "documents_admin_all" ON public.documents FOR ALL TO authenticated USING (public.is_admin())';
    EXECUTE 'CREATE POLICY "documents_user_update" ON public.documents FOR UPDATE TO authenticated USING (user_id = auth.uid())';
    EXECUTE 'CREATE POLICY "documents_user_delete" ON public.documents FOR DELETE TO authenticated USING (user_id = auth.uid())';
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 6. Alte Policy auf mis_audit_log (profiles-Subquery)
-- ────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can manage audits" ON public.mis_audit_log;
DROP POLICY IF EXISTS "Admins can read audit log" ON public.mis_audit_log;
DROP POLICY IF EXISTS "Admin full access on mis_audit_log" ON public.mis_audit_log;

CREATE POLICY "mis_audit_log_admin_all" ON public.mis_audit_log
  FOR ALL TO authenticated
  USING (public.is_admin());
