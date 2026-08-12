-- Rollback: 20260822020000_billing_policies_is_admin.sql
-- Stellt die alten profiles-Subquery-Policies wieder her

-- payments
DROP POLICY IF EXISTS "payments_admin_all" ON public.payments;
CREATE POLICY "payments_admin_all" ON public.payments
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- payment_allocations
DROP POLICY IF EXISTS "alloc_admin_all" ON public.payment_allocations;
CREATE POLICY "alloc_admin_all" ON public.payment_allocations
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- dunning_entries
DROP POLICY IF EXISTS "dunning_admin_all" ON public.dunning_entries;
CREATE POLICY "dunning_admin_all" ON public.dunning_entries
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- payment_differences
DROP POLICY IF EXISTS "diff_admin_all" ON public.payment_differences;
CREATE POLICY "diff_admin_all" ON public.payment_differences
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- documents
DROP POLICY IF EXISTS "documents_admin_all" ON public.documents;
DROP POLICY IF EXISTS "documents_user_update" ON public.documents;
DROP POLICY IF EXISTS "documents_user_delete" ON public.documents;

-- mis_audit_log
DROP POLICY IF EXISTS "mis_audit_log_admin_all" ON public.mis_audit_log;
