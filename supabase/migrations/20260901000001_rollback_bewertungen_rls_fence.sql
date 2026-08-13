-- ════════════════════════════════════════════════════════════════════
-- ROLLBACK zu 20260901000000_bewertungen_rls_fence.sql
-- ════════════════════════════════════════════════════════════════════
-- ACHTUNG: Stellt den Zustand VOR dem Fence wieder her — also die
-- oeffentliche Lesbarkeit beider Bewertungstabellen (USING (true)).
-- Nur ausfuehren, wenn der Fence nachweislich Produktionsfunktionen
-- bricht, und dann zeitnah durch einen korrigierten Fence ersetzen.
--
-- Vorher pruefen: bricht wirklich der Fence, oder liest eine Stelle noch
-- direkt aus angel_reviews statt ueber lib/reviews.ts?
-- ════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('angel_reviews', 'reviews')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- Stand vor der Migration (20260319000000_fix_rls_policies.sql)
CREATE POLICY "Anyone can view reviews" ON public.angel_reviews
  FOR SELECT USING (true);
CREATE POLICY "Customers can create own reviews" ON public.angel_reviews
  FOR INSERT WITH CHECK (auth.uid() = customer_id);
CREATE POLICY "Customers can update own reviews" ON public.angel_reviews
  FOR UPDATE USING (auth.uid() = customer_id)
  WITH CHECK (auth.uid() = customer_id);
CREATE POLICY "angel_reviews_admin_all" ON public.angel_reviews
  FOR ALL USING (public.is_admin());

CREATE POLICY "Anyone can view reviews" ON public.reviews
  FOR SELECT USING (true);
CREATE POLICY "Users can create own reviews" ON public.reviews
  FOR INSERT WITH CHECK (auth.uid() = reviewer_id);
CREATE POLICY "Users can update own reviews" ON public.reviews
  FOR UPDATE USING (auth.uid() = reviewer_id)
  WITH CHECK (auth.uid() = reviewer_id);
CREATE POLICY "reviews_admin_all" ON public.reviews
  FOR ALL USING (public.is_admin());

DROP FUNCTION IF EXISTS public.darf_buchung_bewerten(uuid, uuid);
DROP FUNCTION IF EXISTS public.buchung_in_aktiver_org(uuid);

COMMIT;
