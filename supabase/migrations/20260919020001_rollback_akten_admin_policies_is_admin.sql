-- ════════════════════════════════════════════════════════════════════
-- ROLLBACK zu 20260919020000_akten_admin_policies_is_admin.sql
-- ════════════════════════════════════════════════════════════════════
-- ACHTUNG: Stellt die profiles-Subquery-Policies wieder her (42P17-
-- Rekursionsrisiko, kein superadmin-Zugriff). Nur ausfuehren, wenn
-- is_admin() nachweislich einen Produktionsweg bricht.
-- ════════════════════════════════════════════════════════════════════

BEGIN;

DROP POLICY IF EXISTS "admin_akten_dokumente" ON public.akten_dokumente;
CREATE POLICY "admin_akten_dokumente" ON public.akten_dokumente
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

DROP POLICY IF EXISTS "admin_akten_versionen" ON public.akten_dokument_versionen;
CREATE POLICY "admin_akten_versionen" ON public.akten_dokument_versionen
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

DROP POLICY IF EXISTS "admin_akten_vertraege" ON public.akten_vertraege;
CREATE POLICY "admin_akten_vertraege" ON public.akten_vertraege
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

DROP POLICY IF EXISTS "admin_akten_kontaktpersonen" ON public.akten_kontaktpersonen;
CREATE POLICY "admin_akten_kontaktpersonen" ON public.akten_kontaktpersonen
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

DROP POLICY IF EXISTS "admin_akten_zugriff" ON public.akten_zugriff_log;
CREATE POLICY "admin_akten_zugriff" ON public.akten_zugriff_log
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

COMMIT;
