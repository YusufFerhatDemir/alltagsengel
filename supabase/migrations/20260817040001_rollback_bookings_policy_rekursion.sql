-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK zu 20260817040000_bookings_policy_rekursion.sql
--
-- WARNUNG — dieser Rollback stellt die 42P17-TOTALBLOCKADE auf public.profiles
-- WIEDER HER. Danach scheitert jeder Nicht-service_role-Zugriff auf profiles
-- erneut mit "infinite recursion detected in policy for relation profiles":
-- Login-Nachlauf, Profilanzeige und jede Engel-Liste sind dann tot.
--
-- Er stellt ausserdem eine Policy wieder her, die fachlich WENIGER abdeckt als
-- der bereits aktive Ersatz bookings_admin (USING is_admin()):
--     hier:            role = 'admin'
--     bookings_admin:  role IN ('admin','superadmin') AND deleted_at IS NULL
--
-- Es gibt keinen fachlichen Grund, ihn auszufuehren. Er existiert nur, damit
-- die Migration die Rollback-Konvention des Repos erfuellt.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE POLICY "Admin bookingleri yönetebilir"
  ON public.bookings FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

COMMIT;
