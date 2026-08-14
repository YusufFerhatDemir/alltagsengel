-- ============================================================
-- RLS-LOCKDOWN: neue MIS-Module (CRM, Bewerbermanagement,
-- Schichtplanung, Verträge, Fahrzeuge, Unterschriften, Schulungen,
-- Datenschutz-Register)
-- ============================================================
-- Problem: Diese Tabellen wurden heute (2026-07-05) parallel zur
-- RLS-Lockdown-Migration (20260704_rls_lockdown_internal_tables.sql)
-- neu angelegt und folgen NICHT dem dort etablierten Muster
-- ({table}_admin_all mit is_admin() + {table}_service_all mit
-- service_role). Stattdessen erlauben sie "Allow all for
-- authenticated users" (jeder eingeloggte Kunde/Engel!) oder sogar
-- roles={public} mit qual=true (unauthentifizierter anon-Zugriff
-- über den REST-Endpoint mit dem anon-Key).
--
-- Betroffene Tabellen (verifiziert via scripts/rls-matrix.ts,
-- Nutzung ausschließlich aus app/mis/* bestätigt via Grep):
--   mis_applicants, mis_availability, mis_complaints, mis_contracts,
--   mis_crm_activities (RLS war komplett AUS), mis_job_postings,
--   mis_privacy_audit_log, mis_privacy_consents, mis_privacy_records,
--   mis_privacy_requests, mis_shifts, mis_signature_requests,
--   mis_training_catalog, mis_training_records, mis_vehicles
--
-- Impact: Bewerber-PII (mis_applicants), Beschwerden (mis_complaints),
-- Verträge, DSGVO-Betroffenenanfragen (mis_privacy_requests/_records)
-- waren für jeden eingeloggten oder z.T. sogar anonymen Client lesbar
-- UND schreibbar/löschbar.
--
-- Fix: gleiches Muster wie 20260704_rls_lockdown_internal_tables.sql —
-- is_admin() fürs Admin-UI, service_role für Server-Routes/Cron.
-- ============================================================

-- mis_applicants
DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.mis_applicants;
DROP POLICY IF EXISTS mis_applicants_admin_all ON public.mis_applicants;
CREATE POLICY mis_applicants_admin_all ON public.mis_applicants
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS mis_applicants_service_all ON public.mis_applicants;
CREATE POLICY mis_applicants_service_all ON public.mis_applicants
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- mis_availability
DROP POLICY IF EXISTS "mis_availability_all" ON public.mis_availability;
DROP POLICY IF EXISTS mis_availability_admin_all ON public.mis_availability;
CREATE POLICY mis_availability_admin_all ON public.mis_availability
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS mis_availability_service_all ON public.mis_availability;
CREATE POLICY mis_availability_service_all ON public.mis_availability
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- mis_complaints
DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.mis_complaints;
DROP POLICY IF EXISTS mis_complaints_admin_all ON public.mis_complaints;
CREATE POLICY mis_complaints_admin_all ON public.mis_complaints
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS mis_complaints_service_all ON public.mis_complaints;
CREATE POLICY mis_complaints_service_all ON public.mis_complaints
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- mis_contracts
DROP POLICY IF EXISTS "mis_contracts_all" ON public.mis_contracts;
DROP POLICY IF EXISTS mis_contracts_admin_all ON public.mis_contracts;
CREATE POLICY mis_contracts_admin_all ON public.mis_contracts
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS mis_contracts_service_all ON public.mis_contracts;
CREATE POLICY mis_contracts_service_all ON public.mis_contracts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- mis_crm_activities: RLS war komplett deaktiviert (rowsecurity=false)
ALTER TABLE public.mis_crm_activities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mis_crm_activities_admin_all ON public.mis_crm_activities;
CREATE POLICY mis_crm_activities_admin_all ON public.mis_crm_activities
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS mis_crm_activities_service_all ON public.mis_crm_activities;
CREATE POLICY mis_crm_activities_service_all ON public.mis_crm_activities
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- mis_job_postings (keine öffentliche Karriereseite liest diese Tabelle —
-- app/karriere + app/jobs sind statisch, nur app/mis/recruiting greift zu)
DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.mis_job_postings;
DROP POLICY IF EXISTS mis_job_postings_admin_all ON public.mis_job_postings;
CREATE POLICY mis_job_postings_admin_all ON public.mis_job_postings
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS mis_job_postings_service_all ON public.mis_job_postings;
CREATE POLICY mis_job_postings_service_all ON public.mis_job_postings
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- mis_privacy_audit_log
DROP POLICY IF EXISTS "privacy_audit_log_all" ON public.mis_privacy_audit_log;
DROP POLICY IF EXISTS mis_privacy_audit_log_admin_all ON public.mis_privacy_audit_log;
CREATE POLICY mis_privacy_audit_log_admin_all ON public.mis_privacy_audit_log
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS mis_privacy_audit_log_service_all ON public.mis_privacy_audit_log;
CREATE POLICY mis_privacy_audit_log_service_all ON public.mis_privacy_audit_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- mis_privacy_consents
DROP POLICY IF EXISTS "privacy_consents_all" ON public.mis_privacy_consents;
DROP POLICY IF EXISTS mis_privacy_consents_admin_all ON public.mis_privacy_consents;
CREATE POLICY mis_privacy_consents_admin_all ON public.mis_privacy_consents
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS mis_privacy_consents_service_all ON public.mis_privacy_consents;
CREATE POLICY mis_privacy_consents_service_all ON public.mis_privacy_consents
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- mis_privacy_records
DROP POLICY IF EXISTS "privacy_records_all" ON public.mis_privacy_records;
DROP POLICY IF EXISTS mis_privacy_records_admin_all ON public.mis_privacy_records;
CREATE POLICY mis_privacy_records_admin_all ON public.mis_privacy_records
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS mis_privacy_records_service_all ON public.mis_privacy_records;
CREATE POLICY mis_privacy_records_service_all ON public.mis_privacy_records
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- mis_privacy_requests
DROP POLICY IF EXISTS "privacy_requests_all" ON public.mis_privacy_requests;
DROP POLICY IF EXISTS mis_privacy_requests_admin_all ON public.mis_privacy_requests;
CREATE POLICY mis_privacy_requests_admin_all ON public.mis_privacy_requests
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS mis_privacy_requests_service_all ON public.mis_privacy_requests;
CREATE POLICY mis_privacy_requests_service_all ON public.mis_privacy_requests
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- mis_shifts
DROP POLICY IF EXISTS "mis_shifts_all" ON public.mis_shifts;
DROP POLICY IF EXISTS mis_shifts_admin_all ON public.mis_shifts;
CREATE POLICY mis_shifts_admin_all ON public.mis_shifts
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS mis_shifts_service_all ON public.mis_shifts;
CREATE POLICY mis_shifts_service_all ON public.mis_shifts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- mis_signature_requests
DROP POLICY IF EXISTS "mis_signatures_all" ON public.mis_signature_requests;
DROP POLICY IF EXISTS mis_signature_requests_admin_all ON public.mis_signature_requests;
CREATE POLICY mis_signature_requests_admin_all ON public.mis_signature_requests
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS mis_signature_requests_service_all ON public.mis_signature_requests;
CREATE POLICY mis_signature_requests_service_all ON public.mis_signature_requests
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- mis_training_catalog
DROP POLICY IF EXISTS "mis_training_catalog_all" ON public.mis_training_catalog;
DROP POLICY IF EXISTS mis_training_catalog_admin_all ON public.mis_training_catalog;
CREATE POLICY mis_training_catalog_admin_all ON public.mis_training_catalog
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS mis_training_catalog_service_all ON public.mis_training_catalog;
CREATE POLICY mis_training_catalog_service_all ON public.mis_training_catalog
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- mis_training_records
DROP POLICY IF EXISTS "mis_training_records_all" ON public.mis_training_records;
DROP POLICY IF EXISTS mis_training_records_admin_all ON public.mis_training_records;
CREATE POLICY mis_training_records_admin_all ON public.mis_training_records
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS mis_training_records_service_all ON public.mis_training_records;
CREATE POLICY mis_training_records_service_all ON public.mis_training_records
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- mis_vehicles
DROP POLICY IF EXISTS "mis_vehicles_all" ON public.mis_vehicles;
DROP POLICY IF EXISTS mis_vehicles_admin_all ON public.mis_vehicles;
CREATE POLICY mis_vehicles_admin_all ON public.mis_vehicles
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS mis_vehicles_service_all ON public.mis_vehicles;
CREATE POLICY mis_vehicles_service_all ON public.mis_vehicles
  FOR ALL TO service_role USING (true) WITH CHECK (true);
