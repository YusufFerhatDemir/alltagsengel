-- ════════════════════════════════════════════════════════════════════
-- SICHERHEITSFIX (2026-07-04): RLS-Lockdown interner Tabellen
-- ════════════════════════════════════════════════════════════════════
--
-- PROBLEM (live introspiziert via audit_rls_all_policies):
--   Zahlreiche interne Tabellen (Finanzen, Investoren-Dataroom, operativer
--   Betriebssystem-Kern) waren für JEDEN eingeloggten Nutzer lesbar –
--   teils sogar voll schreibbar.
--
--   Muster 1 (Betriebssystem):  Policies "<t>_auth_select/insert/update/all"
--                               mit  USING (true)  für Rolle  authenticated.
--                               → jeder Kunde/Engel konnte ALLE Klienten,
--                                 Pflegekräfte, Rechnungen, Budgets, Löhne
--                                 lesen und z.T. verändern.
--   Muster 2 (MIS/Investoren):  Policies "Authenticated users can read <t>"
--                               mit  USING (auth.role() = 'authenticated')
--                               → jeder eingeloggte Nutzer konnte Finanz-
--                                 berichte, Budgets, Bestellungen, Lieferanten
--                                 und den Investoren-Dataroom lesen.
--
-- FIX:
--   Alle diese offenen authenticated/public-Policies droppen und durch
--   public.is_admin() ersetzen. is_admin() prüft profiles.role (autoritativ,
--   gegen Self-Escalation durch Trigger prevent_role_escalation geschützt) –
--   NICHT user_metadata (vom User selbst editierbar).
--
--   Die "<t>_service_all"-Policies (Rolle service_role) bleiben unangetastet:
--   damit funktionieren die serverseitigen API-Routen (Service-Role-Key) weiter.
--   Die Admin-/MIS-Weboberfläche liest mit der Session des Admins → is_admin()
--   liefert true → funktioniert weiter. Reguläre Nutzer verlieren den Zugriff.
--
-- VERIFIKATION vorab: Kein app/kunde-, app/engel-, app/fahrer- oder öffentlicher
--   Codepfad greift direkt auf diese Tabellen zu (grep bestätigt). Nur die
--   Admin-/MIS-Oberfläche (durch Middleware admin-gated) und Service-Role-APIs.
-- ════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- 1) BETRIEBSSYSTEM-Tabellen: offene authenticated-Policies → is_admin()
--    Wir droppen jede authenticated-Policy und legen EINE ALL-Policy
--    (SELECT/INSERT/UPDATE/DELETE) mit is_admin() an.
-- ─────────────────────────────────────────────────────────────────────

-- absences
DROP POLICY IF EXISTS "absences_auth_insert" ON public.absences;
DROP POLICY IF EXISTS "absences_auth_select" ON public.absences;
CREATE POLICY "absences_admin_all" ON public.absences
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- applications (Bewerbungen – PII)
DROP POLICY IF EXISTS "applications_auth_all" ON public.applications;
CREATE POLICY "applications_admin_all" ON public.applications
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- assignments
DROP POLICY IF EXISTS "assignments_auth_manage" ON public.assignments;
DROP POLICY IF EXISTS "assignments_auth_select" ON public.assignments;
CREATE POLICY "assignments_admin_all" ON public.assignments
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- budget_transactions (Finanzen)
DROP POLICY IF EXISTS "budget_tx_auth_insert" ON public.budget_transactions;
DROP POLICY IF EXISTS "budget_tx_auth_select" ON public.budget_transactions;
CREATE POLICY "budget_tx_admin_all" ON public.budget_transactions
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- caregiver_bonuses (Löhne/Boni – Finanzen)
DROP POLICY IF EXISTS "cg_bonuses_auth_all" ON public.caregiver_bonuses;
CREATE POLICY "cg_bonuses_admin_all" ON public.caregiver_bonuses
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- caregiver_documents (Dokumente – PII)
DROP POLICY IF EXISTS "cg_docs_auth_all" ON public.caregiver_documents;
CREATE POLICY "cg_docs_admin_all" ON public.caregiver_documents
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- caregiver_initials_history
DROP POLICY IF EXISTS "cg_initials_auth_insert" ON public.caregiver_initials_history;
DROP POLICY IF EXISTS "cg_initials_auth_select" ON public.caregiver_initials_history;
CREATE POLICY "cg_initials_admin_all" ON public.caregiver_initials_history
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- caregiver_qualifications
DROP POLICY IF EXISTS "caregiver_quals_auth_manage" ON public.caregiver_qualifications;
DROP POLICY IF EXISTS "caregiver_quals_auth_select" ON public.caregiver_qualifications;
CREATE POLICY "caregiver_quals_admin_all" ON public.caregiver_qualifications
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- caregivers (Pflegekräfte – PII)
DROP POLICY IF EXISTS "caregivers_auth_insert" ON public.caregivers;
DROP POLICY IF EXISTS "caregivers_auth_select" ON public.caregivers;
DROP POLICY IF EXISTS "caregivers_auth_update" ON public.caregivers;
CREATE POLICY "caregivers_admin_all" ON public.caregivers
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- client_budgets (Finanzen)
DROP POLICY IF EXISTS "client_budgets_auth_insert" ON public.client_budgets;
DROP POLICY IF EXISTS "client_budgets_auth_select" ON public.client_budgets;
DROP POLICY IF EXISTS "client_budgets_auth_update" ON public.client_budgets;
CREATE POLICY "client_budgets_admin_all" ON public.client_budgets
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- client_preferred_substitutes
DROP POLICY IF EXISTS "preferred_subs_auth_manage" ON public.client_preferred_substitutes;
DROP POLICY IF EXISTS "preferred_subs_auth_select" ON public.client_preferred_substitutes;
CREATE POLICY "preferred_subs_admin_all" ON public.client_preferred_substitutes
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- clients (Klienten/Pflegebedürftige – PII)
DROP POLICY IF EXISTS "clients_auth_insert" ON public.clients;
DROP POLICY IF EXISTS "clients_auth_select" ON public.clients;
DROP POLICY IF EXISTS "clients_auth_update" ON public.clients;
CREATE POLICY "clients_admin_all" ON public.clients
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- cooperation_partners
DROP POLICY IF EXISTS "coop_partners_auth_all" ON public.cooperation_partners;
CREATE POLICY "coop_partners_admin_all" ON public.cooperation_partners
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- invoice_disputes (Finanzen)
DROP POLICY IF EXISTS "invoice_disputes_auth_insert" ON public.invoice_disputes;
DROP POLICY IF EXISTS "invoice_disputes_auth_select" ON public.invoice_disputes;
DROP POLICY IF EXISTS "invoice_disputes_auth_update" ON public.invoice_disputes;
CREATE POLICY "invoice_disputes_admin_all" ON public.invoice_disputes
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- invoice_items (Finanzen)
DROP POLICY IF EXISTS "invoice_items_auth_insert" ON public.invoice_items;
DROP POLICY IF EXISTS "invoice_items_auth_select" ON public.invoice_items;
CREATE POLICY "invoice_items_admin_all" ON public.invoice_items
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- invoices (Finanzen)
DROP POLICY IF EXISTS "invoices_auth_insert" ON public.invoices;
DROP POLICY IF EXISTS "invoices_auth_select" ON public.invoices;
DROP POLICY IF EXISTS "invoices_auth_update" ON public.invoices;
CREATE POLICY "invoices_admin_all" ON public.invoices
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- partner_visits
DROP POLICY IF EXISTS "partner_visits_auth_all" ON public.partner_visits;
CREATE POLICY "partner_visits_admin_all" ON public.partner_visits
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- satisfaction_calls
DROP POLICY IF EXISTS "satisfaction_calls_auth_all" ON public.satisfaction_calls;
CREATE POLICY "satisfaction_calls_admin_all" ON public.satisfaction_calls
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- service_records (Leistungsnachweise – gesundheitsnahe PII)
DROP POLICY IF EXISTS "service_records_auth_insert" ON public.service_records;
DROP POLICY IF EXISTS "service_records_auth_select" ON public.service_records;
DROP POLICY IF EXISTS "service_records_auth_update" ON public.service_records;
CREATE POLICY "service_records_admin_all" ON public.service_records
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- substitution_requests
DROP POLICY IF EXISTS "sub_requests_auth_manage" ON public.substitution_requests;
DROP POLICY IF EXISTS "sub_requests_auth_select" ON public.substitution_requests;
CREATE POLICY "sub_requests_admin_all" ON public.substitution_requests
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ─────────────────────────────────────────────────────────────────────
-- 2) MIS / INVESTOREN-Tabellen: offene SELECT-Policy → is_admin()
--    (bestehende Admin-Write-Policies mit is_admin() bleiben erhalten)
-- ─────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Authenticated users can read mis_ai_conversations" ON public.mis_ai_conversations;
CREATE POLICY "mis_ai_conversations_admin_select" ON public.mis_ai_conversations
  FOR SELECT USING (public.is_admin());

DROP POLICY IF EXISTS "Authenticated users can read mis_budget_items" ON public.mis_budget_items;
CREATE POLICY "mis_budget_items_admin_select" ON public.mis_budget_items
  FOR SELECT USING (public.is_admin());

DROP POLICY IF EXISTS "Authenticated users can read mis_capa" ON public.mis_capa;
CREATE POLICY "mis_capa_admin_select" ON public.mis_capa
  FOR SELECT USING (public.is_admin());

DROP POLICY IF EXISTS "Authenticated users can read mis_dataroom_access" ON public.mis_dataroom_access;
CREATE POLICY "mis_dataroom_access_admin_select" ON public.mis_dataroom_access
  FOR SELECT USING (public.is_admin());

DROP POLICY IF EXISTS "Authenticated users can read mis_dataroom_sections" ON public.mis_dataroom_sections;
CREATE POLICY "mis_dataroom_sections_admin_select" ON public.mis_dataroom_sections
  FOR SELECT USING (public.is_admin());

DROP POLICY IF EXISTS "Authenticated users can read mis_document_categories" ON public.mis_document_categories;
CREATE POLICY "mis_document_categories_admin_select" ON public.mis_document_categories
  FOR SELECT USING (public.is_admin());

DROP POLICY IF EXISTS "Authenticated users can read mis_document_versions" ON public.mis_document_versions;
CREATE POLICY "mis_document_versions_admin_select" ON public.mis_document_versions
  FOR SELECT USING (public.is_admin());

DROP POLICY IF EXISTS "Authenticated users can read mis_financial_reports" ON public.mis_financial_reports;
CREATE POLICY "mis_financial_reports_admin_select" ON public.mis_financial_reports
  FOR SELECT USING (public.is_admin());

DROP POLICY IF EXISTS "Authenticated users can read mis_purchase_orders" ON public.mis_purchase_orders;
CREATE POLICY "mis_purchase_orders_admin_select" ON public.mis_purchase_orders
  FOR SELECT USING (public.is_admin());

DROP POLICY IF EXISTS "Authenticated users can read mis_quality_audits" ON public.mis_quality_audits;
CREATE POLICY "mis_quality_audits_admin_select" ON public.mis_quality_audits
  FOR SELECT USING (public.is_admin());

DROP POLICY IF EXISTS "Authenticated users can read mis_quality_processes" ON public.mis_quality_processes;
CREATE POLICY "mis_quality_processes_admin_select" ON public.mis_quality_processes
  FOR SELECT USING (public.is_admin());

DROP POLICY IF EXISTS "Authenticated users can read mis_suppliers" ON public.mis_suppliers;
CREATE POLICY "mis_suppliers_admin_select" ON public.mis_suppliers
  FOR SELECT USING (public.is_admin());

DROP POLICY IF EXISTS "Authenticated users can read mis_tasks" ON public.mis_tasks;
CREATE POLICY "mis_tasks_admin_select" ON public.mis_tasks
  FOR SELECT USING (public.is_admin());

COMMIT;

-- ════════════════════════════════════════════════════════════════════
-- HINWEIS app_settings (separat, NICHT hier automatisch geändert):
--   app_settings ist public-readable und enthält u.a. 'demo_password'.
--   Lockdown könnte den Demo-Login (anonym) brechen → bewusst separat
--   behandeln (Demo-Passwort serverseitig prüfen statt Klartext ausliefern).
-- ════════════════════════════════════════════════════════════════════
