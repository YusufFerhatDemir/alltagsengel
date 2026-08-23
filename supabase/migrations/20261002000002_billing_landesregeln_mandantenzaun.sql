-- ════════════════════════════════════════════════════════════════════════════
-- billing_landesregeln an den Mandanten binden — Delta Phase 4, Befund 3 (P2)
-- ════════════════════════════════════════════════════════════════════════════
--
-- Live gemessen (scripts/verify-security-delta-phase4-detail.mjs):
--
--   billing_landesregeln.landesregeln_admin_write
--     [PERMISSIVE] ALL  TO authenticated  USING is_admin()
--
-- Kein organization_id-Bezug, und die Tabelle hat keinen org_fence. Ein Admin
-- eines beliebigen Mandanten kann damit die Landesregeln ALLER Mandanten
-- lesen, aendern und loeschen. Landesregeln steuern die Abrechnung — das ist
-- der Zugriff auf eine fremde Kasse.
--
-- Die zweite Policy auf der Tabelle macht es bereits richtig
--   ((organization_id IS NULL) OR (organization_id = current_org_id()))
-- und bleibt unveraltert: bundesweite Regeln (organization_id IS NULL) sollen
-- fuer alle lesbar sein.
--
-- ── APPLY-WEG ──────────────────────────────────────────────────────────────
-- DROP/CREATE POLICY verlangt Eigentuemerrechte an der Tabelle. Der
-- service_role-Schluessel hat die nicht:
--   42501 "must be owner of relation billing_landesregeln"
-- Diese Datei muss deshalb im Supabase-SQL-Editor laufen (dort als postgres).
--
-- Idempotent. Rollback: 20261002000003_rollback_billing_landesregeln_mandantenzaun.sql
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 3) billing_landesregeln an den Mandanten binden ────────────────────────
-- Die alte Policy wird ersetzt, nicht ergänzt: eine zusätzliche Policy würde
-- als PERMISSIVE danebenstehen und der mandantenblinde Vollzugriff bliebe.
DROP POLICY IF EXISTS landesregeln_admin_write ON public.billing_landesregeln;

CREATE POLICY landesregeln_admin_write ON public.billing_landesregeln
  FOR ALL TO authenticated
  USING (is_admin() AND organization_id = current_org_id())
  WITH CHECK (is_admin() AND organization_id = current_org_id());

-- Zusätzlich der Zaun, den die Tabelle bisher nicht hatte. RESTRICTIVE, weil
-- er UND-verknüpft gelten muss — eine permissive Policy könnte ihn sonst
-- überstimmen. Bundesweite Regeln (organization_id IS NULL) bleiben für alle
-- lesbar; genau dafür ist der NULL-Zweig da.
DROP POLICY IF EXISTS org_fence_billing_landesregeln ON public.billing_landesregeln;

CREATE POLICY org_fence_billing_landesregeln ON public.billing_landesregeln
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (organization_id IS NULL OR organization_id = current_org_id())
  WITH CHECK (organization_id = current_org_id());

COMMENT ON POLICY org_fence_billing_landesregeln ON public.billing_landesregeln IS
  'Delta Phase 4: Mandantenzaun. Lesen erlaubt zusätzlich bundesweite Regeln '
  '(organization_id IS NULL); Schreiben nur in die eigene Organisation.';


COMMIT;

-- ── VERIFIKATION nach dem Apply ────────────────────────────────────────────
--   node scripts/verify-security-delta-phase4.mjs
-- Erwartet: billing_landesregeln taucht nicht mehr in der org_fence-Luecke auf.
