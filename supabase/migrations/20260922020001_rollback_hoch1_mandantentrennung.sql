-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK zu 20260922020000_hoch1_mandantentrennung.sql
--
-- ACHTUNG: Stellt den mandantenblinden Zustand wieder her (Security-Audit
-- 2026-08-19, HOCH-1). Danach sieht ein Administrator einer beliebigen
-- Organisation in profiles, angels, messages, notifications, referrals und
-- den 18 Fence-Tabellen wieder die Daten ALLER Organisationen.
-- Nur ausfuehren, wenn ein Zugriffspfad nachweislich haengt.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── TEIL 3 zurueck: Admin-Policies wieder org-blind ───────────────────────
DROP POLICY IF EXISTS "Admins can manage all profiles" ON public.profiles;
CREATE POLICY "Admins can manage all profiles" ON public.profiles
  FOR ALL TO public USING (is_admin());

DROP POLICY IF EXISTS "profiles_select_admin" ON public.profiles;
CREATE POLICY "profiles_select_admin" ON public.profiles
  FOR SELECT TO public USING (is_admin());

DROP POLICY IF EXISTS "Admin can delete profiles" ON public.profiles;
CREATE POLICY "Admin can delete profiles" ON public.profiles
  FOR DELETE TO public USING (is_admin());

DROP POLICY IF EXISTS "Admin can update all profiles" ON public.profiles;
CREATE POLICY "Admin can update all profiles" ON public.profiles
  FOR UPDATE TO public USING ((auth.uid() = id) OR is_admin());

DROP POLICY IF EXISTS "Admin engelleri yönetebilir" ON public.angels;
CREATE POLICY "Admin engelleri yönetebilir" ON public.angels
  FOR ALL TO public USING (is_admin());

DROP POLICY IF EXISTS "angel_availability_delete" ON public.angel_availability;
CREATE POLICY "angel_availability_delete" ON public.angel_availability
  FOR DELETE TO authenticated USING ((angel_id = auth.uid()) OR is_admin());

DROP POLICY IF EXISTS "angel_availability_insert" ON public.angel_availability;
CREATE POLICY "angel_availability_insert" ON public.angel_availability
  FOR INSERT TO authenticated WITH CHECK ((angel_id = auth.uid()) OR is_admin());

DROP POLICY IF EXISTS "angel_availability_update" ON public.angel_availability;
CREATE POLICY "angel_availability_update" ON public.angel_availability
  FOR UPDATE TO authenticated
  USING ((angel_id = auth.uid()) OR is_admin())
  WITH CHECK ((angel_id = auth.uid()) OR is_admin());

DROP POLICY IF EXISTS "messages_admin_all" ON public.messages;
CREATE POLICY "messages_admin_all" ON public.messages
  FOR ALL TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "notifications_admin_all" ON public.notifications;
CREATE POLICY "notifications_admin_all" ON public.notifications
  FOR ALL TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "Admins sehen alle Referrals" ON public.referrals;
CREATE POLICY "Admins sehen alle Referrals" ON public.referrals
  FOR SELECT TO authenticated USING (is_admin());

-- ── TEIL 2 zurueck: Fence + Spalte entfernen ─────────────────────────────
DO $$
DECLARE
  t text;
  fence_tables text[] := ARRAY[
    'approved_locations', 'audit_logs', 'kf_booking_reviews',
    'kf_partner_availability', 'kf_partners', 'krankenfahrt_providers',
    'krankenfahrt_reviews', 'krankenfahrten', 'lead_inquiries', 'mis_auth_log',
    'mis_dataroom_access', 'mis_privacy_audit_log', 'mis_privacy_consents',
    'mis_privacy_records', 'mis_privacy_requests', 'newsletter_subscribers',
    'notfall_access_attempts', 'whatsapp_conversations'
  ];
BEGIN
  FOREACH t IN ARRAY fence_tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN CONTINUE; END IF;

    EXECUTE format('DROP POLICY IF EXISTS "%s_org_fence" ON public.%I', t, t);
    EXECUTE format('DROP INDEX IF EXISTS public.idx_%s_org', t);
    EXECUTE format('ALTER TABLE public.%I DROP COLUMN IF EXISTS organization_id', t);
  END LOOP;
END $$;

-- ── Helfer entfernen ─────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.nutzer_in_aktiver_org(uuid);
DROP FUNCTION IF EXISTS public.nutzer_hat_org_bindung(uuid);

-- ── TEIL 1 zurueck: current_org_id() ohne caregivers/clients ─────────────
CREATE OR REPLACE FUNCTION public.current_org_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    NULLIF(auth.jwt() -> 'app_metadata' ->> 'org_id', '')::uuid,
    (SELECT om.organization_id
       FROM public.organization_members om
      WHERE om.user_id = auth.uid()
      ORDER BY om.created_at
      LIMIT 1),
    '00000000-0000-4000-8000-000460629986'::uuid
  );
$$;

REVOKE ALL ON FUNCTION public.current_org_id() FROM public;
GRANT EXECUTE ON FUNCTION public.current_org_id() TO anon, authenticated, service_role;

COMMIT;
