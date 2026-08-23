-- ROLLBACK zu 20261002000002_billing_landesregeln_mandantenzaun.sql
--
-- Stellt die mandantenblinde Policy wieder her. Bewusst ein Rueckschritt:
-- danach kann ein Admin jedes Mandanten die Landesregeln aller Mandanten
-- aendern. Nur ausfuehren, wenn der Zaun einen echten Weg blockiert — und
-- dann die Ursache beheben, nicht den Zustand lassen.
--
-- Wie das Original im Supabase-SQL-Editor ausfuehren (Eigentuemerrechte).

BEGIN;

-- ── 3) billing_landesregeln auf den mandantenblinden Stand zurück ──────────
DROP POLICY IF EXISTS org_fence_billing_landesregeln ON public.billing_landesregeln;
DROP POLICY IF EXISTS landesregeln_admin_write ON public.billing_landesregeln;

CREATE POLICY landesregeln_admin_write ON public.billing_landesregeln
  FOR ALL TO authenticated
  USING (is_admin());


COMMIT;
