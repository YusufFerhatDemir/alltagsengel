-- Rollback: 20260919020000_fix_dunning_documents_rls.sql
-- Stellt die vorherigen (fehlerhaften) Policies aus
-- 20260812120000_sepa_mandate_and_mahnung.sql wieder her.

DROP POLICY IF EXISTS admin_crud_sepa_mandates ON sepa_mandates;
CREATE POLICY admin_crud_sepa_mandates ON sepa_mandates
  FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','superadmin')));

DROP POLICY IF EXISTS admin_crud_sepa_batches ON sepa_batches;
CREATE POLICY admin_crud_sepa_batches ON sepa_batches
  FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','superadmin')));

DROP POLICY IF EXISTS admin_crud_sepa_batch_items ON sepa_batch_items;
CREATE POLICY admin_crud_sepa_batch_items ON sepa_batch_items
  FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','superadmin')));

DROP POLICY IF EXISTS admin_crud_dunning_documents ON dunning_documents;
CREATE POLICY admin_crud_dunning_documents ON dunning_documents
  FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','superadmin')));

DROP POLICY IF EXISTS org_fence_sepa_mandates ON sepa_mandates;
CREATE POLICY org_fence_sepa_mandates ON sepa_mandates AS RESTRICTIVE
  FOR ALL USING (organization_id = current_setting('app.current_org_id', true)::uuid);

DROP POLICY IF EXISTS org_fence_sepa_batches ON sepa_batches;
CREATE POLICY org_fence_sepa_batches ON sepa_batches AS RESTRICTIVE
  FOR ALL USING (organization_id = current_setting('app.current_org_id', true)::uuid);

DROP POLICY IF EXISTS org_fence_sepa_batch_items ON sepa_batch_items;
CREATE POLICY org_fence_sepa_batch_items ON sepa_batch_items AS RESTRICTIVE
  FOR ALL USING (organization_id = current_setting('app.current_org_id', true)::uuid);

DROP POLICY IF EXISTS org_fence_dunning_documents ON dunning_documents;
CREATE POLICY org_fence_dunning_documents ON dunning_documents AS RESTRICTIVE
  FOR ALL USING (organization_id = current_setting('app.current_org_id', true)::uuid);
