-- ============================================================
-- SICHERHEITSFIX: user_metadata-basierte RLS-Policies ersetzen
-- ============================================================
-- Problem: user_metadata ist vom User selbst über
-- supabase.auth.updateUser({data:{role:'admin'}}) editierbar.
-- Jede Policy "auth.jwt()->'user_metadata'->>'role' = 'admin'"
-- ist damit wirkungslos: jeder User kann sich selbst Admin machen.
--
-- Fix: SECURITY DEFINER Funktion public.is_admin() prüft
-- stattdessen profiles.role (nur via service_role oder eigenem
-- UPDATE-Policy änderbar, wir haben zusätzlich prevent_role_escalation).
--
-- Analogie: Bisher stand auf dem Türschild "ich bin Admin" und
-- jeder konnte sein eigenes Schild beschriften. Jetzt prüft der
-- Türsteher im Mitarbeiterausweis (profiles.role), der nur vom
-- HR-Büro ausgestellt wird.
-- ============================================================

-- 1) Helper-Funktion
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role = ANY (ARRAY['admin','superadmin'])
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, anon, service_role;

-- 2) Alle 47 betroffenen Policies droppen + neu anlegen mit is_admin()

-- angels
DROP POLICY IF EXISTS "Admin engelleri yönetebilir" ON public.angels;
CREATE POLICY "Admin engelleri yönetebilir" ON public.angels
  FOR ALL USING (public.is_admin());

-- bookings
DROP POLICY IF EXISTS "Admin bookingleri yönetebilir" ON public.bookings;
CREATE POLICY "Admin bookingleri yönetebilir" ON public.bookings
  FOR ALL USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can read all bookings" ON public.bookings;
CREATE POLICY "Admins can read all bookings" ON public.bookings
  FOR SELECT USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can update all bookings" ON public.bookings;
CREATE POLICY "Admins can update all bookings" ON public.bookings
  FOR UPDATE USING (public.is_admin());

-- content_blocks
DROP POLICY IF EXISTS "Admin manages all content" ON public.content_blocks;
CREATE POLICY "Admin manages all content" ON public.content_blocks
  FOR ALL USING (public.is_admin());

-- kf_booking_reviews
DROP POLICY IF EXISTS "Admin manages booking reviews" ON public.kf_booking_reviews;
CREATE POLICY "Admin manages booking reviews" ON public.kf_booking_reviews
  FOR ALL USING (public.is_admin());

-- kf_feature_flags
DROP POLICY IF EXISTS "Admin manages feature flags" ON public.kf_feature_flags;
CREATE POLICY "Admin manages feature flags" ON public.kf_feature_flags
  FOR ALL USING (public.is_admin());

-- kf_partner_availability
DROP POLICY IF EXISTS "Admin manages partner availability" ON public.kf_partner_availability;
CREATE POLICY "Admin manages partner availability" ON public.kf_partner_availability
  FOR ALL USING (public.is_admin());

-- kf_partners
DROP POLICY IF EXISTS "Admin manages partners" ON public.kf_partners;
CREATE POLICY "Admin manages partners" ON public.kf_partners
  FOR ALL USING (public.is_admin());

-- kf_pricing_audit
DROP POLICY IF EXISTS "Admin read audit" ON public.kf_pricing_audit;
CREATE POLICY "Admin read audit" ON public.kf_pricing_audit
  FOR SELECT USING (public.is_admin());

-- kf_pricing_config
DROP POLICY IF EXISTS "Admin full access config" ON public.kf_pricing_config;
CREATE POLICY "Admin full access config" ON public.kf_pricing_config
  FOR ALL USING (public.is_admin());

-- kf_pricing_costs
DROP POLICY IF EXISTS "Admin manages costs" ON public.kf_pricing_costs;
CREATE POLICY "Admin manages costs" ON public.kf_pricing_costs
  FOR ALL USING (public.is_admin());

-- kf_pricing_regions
DROP POLICY IF EXISTS "Admin full access regions" ON public.kf_pricing_regions;
CREATE POLICY "Admin full access regions" ON public.kf_pricing_regions
  FOR ALL USING (public.is_admin());

-- kf_pricing_rules
DROP POLICY IF EXISTS "Admin manages pricing rules" ON public.kf_pricing_rules;
CREATE POLICY "Admin manages pricing rules" ON public.kf_pricing_rules
  FOR ALL USING (public.is_admin());

-- kf_pricing_surcharges
DROP POLICY IF EXISTS "Admin full access surcharges" ON public.kf_pricing_surcharges;
CREATE POLICY "Admin full access surcharges" ON public.kf_pricing_surcharges
  FOR ALL USING (public.is_admin());

-- kf_pricing_tiers
DROP POLICY IF EXISTS "Admin full access tiers" ON public.kf_pricing_tiers;
CREATE POLICY "Admin full access tiers" ON public.kf_pricing_tiers
  FOR ALL USING (public.is_admin());

-- kf_review_rules
DROP POLICY IF EXISTS "Admin manages review rules" ON public.kf_review_rules;
CREATE POLICY "Admin manages review rules" ON public.kf_review_rules
  FOR ALL USING (public.is_admin());

-- kf_service_doc_requirements
DROP POLICY IF EXISTS "Admin manages doc requirements" ON public.kf_service_doc_requirements;
CREATE POLICY "Admin manages doc requirements" ON public.kf_service_doc_requirements
  FOR ALL USING (public.is_admin());

-- krankenfahrt_providers
DROP POLICY IF EXISTS "Admins can delete providers" ON public.krankenfahrt_providers;
CREATE POLICY "Admins can delete providers" ON public.krankenfahrt_providers
  FOR DELETE USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can update all providers" ON public.krankenfahrt_providers;
CREATE POLICY "Admins can update all providers" ON public.krankenfahrt_providers
  FOR UPDATE USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can view all providers" ON public.krankenfahrt_providers;
CREATE POLICY "Admins can view all providers" ON public.krankenfahrt_providers
  FOR SELECT USING (public.is_admin());

-- krankenfahrt_reviews
DROP POLICY IF EXISTS "Admins can view all reviews" ON public.krankenfahrt_reviews;
CREATE POLICY "Admins can view all reviews" ON public.krankenfahrt_reviews
  FOR SELECT USING (public.is_admin());

-- krankenfahrten
DROP POLICY IF EXISTS "Admins can delete krankenfahrten" ON public.krankenfahrten;
CREATE POLICY "Admins can delete krankenfahrten" ON public.krankenfahrten
  FOR DELETE USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can update all krankenfahrten" ON public.krankenfahrten;
CREATE POLICY "Admins can update all krankenfahrten" ON public.krankenfahrten
  FOR UPDATE USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can view all krankenfahrten" ON public.krankenfahrten;
CREATE POLICY "Admins can view all krankenfahrten" ON public.krankenfahrten
  FOR SELECT USING (public.is_admin());

-- medikamentenplan
DROP POLICY IF EXISTS "Admins can view all medikamentenplan" ON public.medikamentenplan;
CREATE POLICY "Admins can view all medikamentenplan" ON public.medikamentenplan
  FOR SELECT USING (public.is_admin());

-- mis_audit_log
DROP POLICY IF EXISTS "Admin full access on mis_audit_log" ON public.mis_audit_log;
CREATE POLICY "Admin full access on mis_audit_log" ON public.mis_audit_log
  FOR ALL USING (public.is_admin());

-- mis_auth_log
DROP POLICY IF EXISTS "Admin can read auth log" ON public.mis_auth_log;
CREATE POLICY "Admin can read auth log" ON public.mis_auth_log
  FOR SELECT USING (public.is_admin());

-- mis_capa
DROP POLICY IF EXISTS "Admin can delete mis_capa" ON public.mis_capa;
CREATE POLICY "Admin can delete mis_capa" ON public.mis_capa
  FOR DELETE USING (public.is_admin());

DROP POLICY IF EXISTS "Admin can insert mis_capa" ON public.mis_capa;
CREATE POLICY "Admin can insert mis_capa" ON public.mis_capa
  FOR INSERT WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admin can update mis_capa" ON public.mis_capa;
CREATE POLICY "Admin can update mis_capa" ON public.mis_capa
  FOR UPDATE USING (public.is_admin());

-- mis_documents
DROP POLICY IF EXISTS "Admin full access on mis_documents" ON public.mis_documents;
CREATE POLICY "Admin full access on mis_documents" ON public.mis_documents
  FOR ALL USING (public.is_admin());

-- mis_kpis
DROP POLICY IF EXISTS "Admin full access on mis_kpis" ON public.mis_kpis;
CREATE POLICY "Admin full access on mis_kpis" ON public.mis_kpis
  FOR ALL USING (public.is_admin());

-- mis_quality_audits
DROP POLICY IF EXISTS "Admin can delete mis_quality_audits" ON public.mis_quality_audits;
CREATE POLICY "Admin can delete mis_quality_audits" ON public.mis_quality_audits
  FOR DELETE USING (public.is_admin());

DROP POLICY IF EXISTS "Admin can insert mis_quality_audits" ON public.mis_quality_audits;
CREATE POLICY "Admin can insert mis_quality_audits" ON public.mis_quality_audits
  FOR INSERT WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admin can update mis_quality_audits" ON public.mis_quality_audits;
CREATE POLICY "Admin can update mis_quality_audits" ON public.mis_quality_audits
  FOR UPDATE USING (public.is_admin());

-- mis_suppliers
DROP POLICY IF EXISTS "Admin can delete mis_suppliers" ON public.mis_suppliers;
CREATE POLICY "Admin can delete mis_suppliers" ON public.mis_suppliers
  FOR DELETE USING (public.is_admin());

DROP POLICY IF EXISTS "Admin can insert mis_suppliers" ON public.mis_suppliers;
CREATE POLICY "Admin can insert mis_suppliers" ON public.mis_suppliers
  FOR INSERT WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admin can update mis_suppliers" ON public.mis_suppliers;
CREATE POLICY "Admin can update mis_suppliers" ON public.mis_suppliers
  FOR UPDATE USING (public.is_admin());

-- mis_tasks
DROP POLICY IF EXISTS "Admin full access on mis_tasks" ON public.mis_tasks;
CREATE POLICY "Admin full access on mis_tasks" ON public.mis_tasks
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- notfall_info
DROP POLICY IF EXISTS "Admins can view all notfall_info" ON public.notfall_info;
CREATE POLICY "Admins can view all notfall_info" ON public.notfall_info
  FOR SELECT USING (public.is_admin());

-- profiles
DROP POLICY IF EXISTS "Admin can delete profiles" ON public.profiles;
CREATE POLICY "Admin can delete profiles" ON public.profiles
  FOR DELETE USING (public.is_admin());

DROP POLICY IF EXISTS "Admin can update all profiles" ON public.profiles;
CREATE POLICY "Admin can update all profiles" ON public.profiles
  FOR UPDATE USING ((auth.uid() = id) OR public.is_admin());

DROP POLICY IF EXISTS "profiles_select_admin" ON public.profiles;
CREATE POLICY "profiles_select_admin" ON public.profiles
  FOR SELECT USING (public.is_admin());

-- reviews
DROP POLICY IF EXISTS "Admins can read all reviews" ON public.reviews;
CREATE POLICY "Admins can read all reviews" ON public.reviews
  FOR SELECT USING (public.is_admin());

-- visitor_locations
DROP POLICY IF EXISTS "Admin can read all visits" ON public.visitor_locations;
CREATE POLICY "Admin can read all visits" ON public.visitor_locations
  FOR SELECT USING (public.is_admin());

-- visitors
DROP POLICY IF EXISTS "Admin can read visits" ON public.visitors;
CREATE POLICY "Admin can read visits" ON public.visitors
  FOR SELECT USING (public.is_admin());

-- 3) function_search_path WARNs fixen
ALTER FUNCTION public.prevent_role_escalation() SET search_path = public, pg_temp;
ALTER FUNCTION public.generate_referral_code() SET search_path = public, pg_temp;
ALTER FUNCTION public.set_onboarding_for_new_kunde() SET search_path = public, pg_temp;
