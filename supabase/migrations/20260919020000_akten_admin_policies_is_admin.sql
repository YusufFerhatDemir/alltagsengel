-- ════════════════════════════════════════════════════════════════════════════
-- Migration: akten_* Admin-Policies — profiles-Subquery → is_admin()
-- Datum:     2026-08-15  (Audit Modul 22 Dokumentenmanagement)
--
-- BEFUND: 20260809010000_dokumentenmanagement_akten.sql legt fuenf
--   Admin-Policies mit demselben Anti-Pattern an, das 20260823020000
--   (profiles_subquery_to_is_admin) bereits fuer wf_*/pflege_*/ops_*
--   behoben hat — dort aber NICHT fuer akten_*:
--
--     admin_akten_dokumente, admin_akten_versionen, admin_akten_vertraege,
--     admin_akten_kontaktpersonen, admin_akten_zugriff
--
--   Alle fuenf pruefen
--     EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
--   direkt gegen profiles. Zwei Probleme:
--     1. profiles hat selbst RLS — eine Subquery aus einer anderen Policy
--        heraus ist der bekannte 42P17-Rekursionsauslöser.
--     2. 'superadmin' faellt durch (is_admin() deckt admin + superadmin ab
--        und beruecksichtigt zusaetzlich deleted_at).
--
-- FIX: dieselbe Ersetzung wie 20260823020000 — DROP POLICY + CREATE POLICY
--   mit public.is_admin() (SECURITY DEFINER, umgeht RLS, kein Zyklus).
--   Keine Verhaltensaenderung fuer 'admin', zusaetzlich 'superadmin' erlaubt
--   und deleted_at-safe.
--
-- KEINE Datenaenderung. Rollback: 20260919020001_rollback_akten_admin_policies_is_admin.sql
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

DROP POLICY IF EXISTS "admin_akten_dokumente" ON public.akten_dokumente;
CREATE POLICY "admin_akten_dokumente" ON public.akten_dokumente
    FOR ALL USING (public.is_admin());

DROP POLICY IF EXISTS "admin_akten_versionen" ON public.akten_dokument_versionen;
CREATE POLICY "admin_akten_versionen" ON public.akten_dokument_versionen
    FOR ALL USING (public.is_admin());

DROP POLICY IF EXISTS "admin_akten_vertraege" ON public.akten_vertraege;
CREATE POLICY "admin_akten_vertraege" ON public.akten_vertraege
    FOR ALL USING (public.is_admin());

DROP POLICY IF EXISTS "admin_akten_kontaktpersonen" ON public.akten_kontaktpersonen;
CREATE POLICY "admin_akten_kontaktpersonen" ON public.akten_kontaktpersonen
    FOR ALL USING (public.is_admin());

DROP POLICY IF EXISTS "admin_akten_zugriff" ON public.akten_zugriff_log;
CREATE POLICY "admin_akten_zugriff" ON public.akten_zugriff_log
    FOR ALL USING (public.is_admin());

COMMIT;
