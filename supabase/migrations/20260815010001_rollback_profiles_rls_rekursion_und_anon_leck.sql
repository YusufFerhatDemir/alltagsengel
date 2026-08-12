-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK zu 20260815010000_profiles_rls_rekursion_und_anon_leck.sql
--
-- WARNUNG — dieser Rollback stellt BEIDE Altlasten wieder her:
--   * die rekursive Policy (42P17: profiles wird fuer alle Nicht-service_role
--     Zugriffe wieder unlesbar), UND
--   * die offenen Lesepolicies fuer Rolle `public` (anon liest alle Profile).
-- Er ist ausschliesslich dafuer da, den exakten Vorzustand wiederherzustellen,
-- falls das Apply unerwartete Nebenwirkungen zeigt. Nicht als Dauerzustand
-- betreiben — in dem Fall stattdessen vorwaerts fixen.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE POLICY "Admin profilleri yönetebilir"
  ON public.profiles FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.profiles profiles_1
    WHERE profiles_1.id = auth.uid()
      AND profiles_1.role = 'admin'
  ));

CREATE POLICY "Herkes profilleri okuyabilir"
  ON public.profiles FOR SELECT
  USING (true);

CREATE POLICY "Anyone can view public profiles"
  ON public.profiles FOR SELECT
  USING (deleted_at IS NULL);

COMMIT;
