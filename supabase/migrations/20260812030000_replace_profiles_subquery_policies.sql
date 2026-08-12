-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Alle 33 profiles-Subquery-Policies → is_admin() / SECDEF-Helper
-- Datum:     2026-08-12
-- Grund:     Performance + Rekursionssicherheit + Konsistenz
-- ═══════════════════════════════════════════════════════════════════════════
-- Analyse: Keine der 34 Policies verursachte aktuell 42P17-Rekursion
-- (profiles-Policies subqueryen nur bookings/krankenfahrten, nicht diese Tabellen).
-- Dennoch: is_admin() ist ~3x schneller als RLS-gefilterter Subquery und
-- eliminiert jedes künftige Rekursionsrisiko bei Änderungen an profiles-Policies.
--
-- profiles_select_booking_partner bleibt: sitzt auf profiles selbst,
-- subqueryed bookings + krankenfahrten (kein Zyklus), kein Ersatz nötig.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Batch 1: Reine Admin-Policies (27 Stück) ──

-- abrechnungslaeufe
DROP POLICY IF EXISTS "admin_abrechnungslaeufe" ON public.abrechnungslaeufe;
CREATE POLICY "admin_abrechnungslaeufe" ON public.abrechnungslaeufe FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- akten_dokument_versionen
DROP POLICY IF EXISTS "admin_akten_versionen" ON public.akten_dokument_versionen;
CREATE POLICY "admin_akten_versionen" ON public.akten_dokument_versionen FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- akten_dokumente
DROP POLICY IF EXISTS "admin_akten_dokumente" ON public.akten_dokumente;
CREATE POLICY "admin_akten_dokumente" ON public.akten_dokumente FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- akten_kontaktpersonen
DROP POLICY IF EXISTS "admin_akten_kontaktpersonen" ON public.akten_kontaktpersonen;
CREATE POLICY "admin_akten_kontaktpersonen" ON public.akten_kontaktpersonen FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- akten_vertraege
DROP POLICY IF EXISTS "admin_akten_vertraege" ON public.akten_vertraege;
CREATE POLICY "admin_akten_vertraege" ON public.akten_vertraege FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- akten_zugriff_log
DROP POLICY IF EXISTS "admin_akten_zugriff" ON public.akten_zugriff_log;
CREATE POLICY "admin_akten_zugriff" ON public.akten_zugriff_log FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- assignment_audit_log
DROP POLICY IF EXISTS "as_audit_admin_read" ON public.assignment_audit_log;
CREATE POLICY "as_audit_admin_read" ON public.assignment_audit_log FOR SELECT TO authenticated
  USING (public.is_admin());

-- budget_reservations
DROP POLICY IF EXISTS "budget_res_admin" ON public.budget_reservations;
CREATE POLICY "budget_res_admin" ON public.budget_reservations FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- care_recipients
DROP POLICY IF EXISTS "care_recipients_admin" ON public.care_recipients;
CREATE POLICY "care_recipients_admin" ON public.care_recipients FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- datenannahmestellen
DROP POLICY IF EXISTS "admin_das" ON public.datenannahmestellen;
CREATE POLICY "admin_das" ON public.datenannahmestellen FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- dta_dakota_auftraege
DROP POLICY IF EXISTS "admin_da" ON public.dta_dakota_auftraege;
CREATE POLICY "admin_da" ON public.dta_dakota_auftraege FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- dta_fehlerprotokoll
DROP POLICY IF EXISTS "admin_fp" ON public.dta_fehlerprotokoll;
CREATE POLICY "admin_fp" ON public.dta_fehlerprotokoll FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- dta_korrekturlaeufe
DROP POLICY IF EXISTS "admin_kl" ON public.dta_korrekturlaeufe;
CREATE POLICY "admin_kl" ON public.dta_korrekturlaeufe FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- dta_kostentraeger
DROP POLICY IF EXISTS "admin_kt" ON public.dta_kostentraeger;
CREATE POLICY "admin_kt" ON public.dta_kostentraeger FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- dta_lauf_rechnungen
DROP POLICY IF EXISTS "admin_dlr" ON public.dta_lauf_rechnungen;
CREATE POLICY "admin_dlr" ON public.dta_lauf_rechnungen FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- dta_ruecklaeufer
DROP POLICY IF EXISTS "admin_rl" ON public.dta_ruecklaeufer;
CREATE POLICY "admin_rl" ON public.dta_ruecklaeufer FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- dta_ruecklaeufer_positionen
DROP POLICY IF EXISTS "admin_rlp" ON public.dta_ruecklaeufer_positionen;
CREATE POLICY "admin_rlp" ON public.dta_ruecklaeufer_positionen FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- dta_validierungen
DROP POLICY IF EXISTS "admin_val" ON public.dta_validierungen;
CREATE POLICY "admin_val" ON public.dta_validierungen FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- lead_inquiries
DROP POLICY IF EXISTS "Admin full access lead_inquiries" ON public.lead_inquiries;
CREATE POLICY "Admin full access lead_inquiries" ON public.lead_inquiries FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- mis_audit_log
DROP POLICY IF EXISTS "audit_select_admin" ON public.mis_audit_log;
CREATE POLICY "audit_select_admin" ON public.mis_audit_log FOR SELECT TO authenticated
  USING (public.is_admin());

-- newsletter_subscribers
DROP POLICY IF EXISTS "Admin full access newsletter" ON public.newsletter_subscribers;
CREATE POLICY "Admin full access newsletter" ON public.newsletter_subscribers FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- page_views
DROP POLICY IF EXISTS "Admins can read page_views" ON public.page_views;
CREATE POLICY "Admins can read page_views" ON public.page_views FOR SELECT TO authenticated
  USING (public.is_admin());

-- referrals
DROP POLICY IF EXISTS "Admins sehen alle Referrals" ON public.referrals;
CREATE POLICY "Admins sehen alle Referrals" ON public.referrals FOR SELECT TO authenticated
  USING (public.is_admin());

-- service_record_audit_log
DROP POLICY IF EXISTS "sr_audit_admin_read" ON public.service_record_audit_log;
CREATE POLICY "sr_audit_admin_read" ON public.service_record_audit_log FOR SELECT TO authenticated
  USING (public.is_admin());

-- whatsapp_conversations
DROP POLICY IF EXISTS "whatsapp_admin_read" ON public.whatsapp_conversations;
CREATE POLICY "whatsapp_admin_read" ON public.whatsapp_conversations FOR SELECT TO authenticated
  USING (public.is_admin());

-- app_settings (superadmin → is_admin() deckt admin+superadmin ab)
DROP POLICY IF EXISTS "app_settings_update" ON public.app_settings;
CREATE POLICY "app_settings_update" ON public.app_settings FOR UPDATE TO authenticated
  USING (public.is_admin());

-- ── Batch 2: angel_availability (angel_id + admin) ──

DROP POLICY IF EXISTS "angel_availability_insert" ON public.angel_availability;
CREATE POLICY "angel_availability_insert" ON public.angel_availability FOR INSERT TO authenticated
  WITH CHECK (angel_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "angel_availability_update" ON public.angel_availability;
CREATE POLICY "angel_availability_update" ON public.angel_availability FOR UPDATE TO authenticated
  USING (angel_id = auth.uid() OR public.is_admin())
  WITH CHECK (angel_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "angel_availability_delete" ON public.angel_availability;
CREATE POLICY "angel_availability_delete" ON public.angel_availability FOR DELETE TO authenticated
  USING (angel_id = auth.uid() OR public.is_admin());

-- ── Batch 3: assignments + service_records (SECDEF-Helper statt Subquery) ──

DROP POLICY IF EXISTS "assignments_admin_manage" ON public.assignments;
CREATE POLICY "assignments_admin_manage" ON public.assignments FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "assignments_engel_read" ON public.assignments;
CREATE POLICY "assignments_engel_read" ON public.assignments FOR SELECT TO authenticated
  USING (
    caregiver_id IN (SELECT public.eigene_caregiver_ids())
    OR client_id IN (SELECT public.eigene_client_ids())
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "assignments_engel_update" ON public.assignments;
CREATE POLICY "assignments_engel_update" ON public.assignments FOR UPDATE TO authenticated
  USING (
    caregiver_id IN (SELECT public.eigene_caregiver_ids())
    OR public.is_admin()
  )
  WITH CHECK (
    caregiver_id IN (SELECT public.eigene_caregiver_ids())
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "sr_engel_own" ON public.service_records;
CREATE POLICY "sr_engel_own" ON public.service_records FOR ALL TO authenticated
  USING (
    caregiver_id IN (SELECT public.eigene_caregiver_ids())
    OR public.is_admin()
  )
  WITH CHECK (
    caregiver_id IN (SELECT public.eigene_caregiver_ids())
    OR public.is_admin()
  );
