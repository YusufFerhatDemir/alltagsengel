-- ════════════════════════════════════════════════════════════════════
-- BASELINE Teil 2: Fremdschlüssel + RLS für die live-only-Tabellen
-- ════════════════════════════════════════════════════════════════════
--
-- Läuft NACH allen anderen Migrationen, damit jede Zieltabelle eines
-- Fremdschlüssels garantiert existiert (z.B. organizations aus
-- 20260801_phase3_multi_mandant_saas.sql, profiles aus initial-setup).
--
-- 51 Fremdschlüssel, aus dem Live-Schema introspiziert. organization_id-
-- FKs der 30 tenant_tables sind NICHT enthalten — die setzt die Phase-3-
-- Migration. Jeder Constraint ist idempotent per pg_constraint-Prüfung.
--
-- RLS wird für alle 61 Tabellen aktiviert (live sind alle 124 Tabellen
-- des public-Schemas RLS-aktiv — Stand 2026-08-02, verifiziert über
-- audit_rls_all_status()).
--
-- ACHTUNG: Diese Datei enthält bewusst KEINE permissiven Policies für
-- die 31 Nicht-Tenant-Tabellen. Auf einer frisch aufgebauten Test-DB
-- sind sie damit für anon/authenticated dicht (RLS an, keine Policy =
-- keine Zeile). Das ist der sichere Default; die live existierenden
-- permissiven Policies sind in audit/DATABASE_SCHEMA_GAP_REPORT.md
-- dokumentiert und noch nicht ins Repo überführt (siehe Gap G-4).
-- ════════════════════════════════════════════════════════════════════

BEGIN;

DO $$ BEGIN
  IF to_regclass('public.absences') IS NOT NULL AND to_regclass('public.caregivers') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'absences_caregiver_id_fkey') THEN
    ALTER TABLE public.absences ADD CONSTRAINT absences_caregiver_id_fkey
      FOREIGN KEY (caregiver_id) REFERENCES public.caregivers(id);
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.applications') IS NOT NULL AND to_regclass('public.caregivers') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'applications_referred_by_caregiver_id_fkey') THEN
    ALTER TABLE public.applications ADD CONSTRAINT applications_referred_by_caregiver_id_fkey
      FOREIGN KEY (referred_by_caregiver_id) REFERENCES public.caregivers(id);
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.assignments') IS NOT NULL AND to_regclass('public.caregivers') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assignments_caregiver_id_fkey') THEN
    ALTER TABLE public.assignments ADD CONSTRAINT assignments_caregiver_id_fkey
      FOREIGN KEY (caregiver_id) REFERENCES public.caregivers(id);
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.assignments') IS NOT NULL AND to_regclass('public.clients') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assignments_client_id_fkey') THEN
    ALTER TABLE public.assignments ADD CONSTRAINT assignments_client_id_fkey
      FOREIGN KEY (client_id) REFERENCES public.clients(id);
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.assignments') IS NOT NULL AND to_regclass('public.verordnungen') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assignments_verordnung_id_fkey') THEN
    ALTER TABLE public.assignments ADD CONSTRAINT assignments_verordnung_id_fkey
      FOREIGN KEY (verordnung_id) REFERENCES public.verordnungen(id);
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.budget_transactions') IS NOT NULL AND to_regclass('public.client_budgets') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'budget_transactions_budget_id_fkey') THEN
    ALTER TABLE public.budget_transactions ADD CONSTRAINT budget_transactions_budget_id_fkey
      FOREIGN KEY (budget_id) REFERENCES public.client_budgets(id);
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.budget_transactions') IS NOT NULL AND to_regclass('public.clients') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'budget_transactions_client_id_fkey') THEN
    ALTER TABLE public.budget_transactions ADD CONSTRAINT budget_transactions_client_id_fkey
      FOREIGN KEY (client_id) REFERENCES public.clients(id);
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.budget_transactions') IS NOT NULL AND to_regclass('public.service_records') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'budget_transactions_service_record_id_fkey') THEN
    ALTER TABLE public.budget_transactions ADD CONSTRAINT budget_transactions_service_record_id_fkey
      FOREIGN KEY (service_record_id) REFERENCES public.service_records(id);
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.caregiver_bonuses') IS NOT NULL AND to_regclass('public.caregivers') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'caregiver_bonuses_caregiver_id_fkey') THEN
    ALTER TABLE public.caregiver_bonuses ADD CONSTRAINT caregiver_bonuses_caregiver_id_fkey
      FOREIGN KEY (caregiver_id) REFERENCES public.caregivers(id);
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.caregiver_documents') IS NOT NULL AND to_regclass('public.caregivers') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'caregiver_documents_caregiver_id_fkey') THEN
    ALTER TABLE public.caregiver_documents ADD CONSTRAINT caregiver_documents_caregiver_id_fkey
      FOREIGN KEY (caregiver_id) REFERENCES public.caregivers(id);
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.caregiver_initials_history') IS NOT NULL AND to_regclass('public.caregivers') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'caregiver_initials_history_caregiver_id_fkey') THEN
    ALTER TABLE public.caregiver_initials_history ADD CONSTRAINT caregiver_initials_history_caregiver_id_fkey
      FOREIGN KEY (caregiver_id) REFERENCES public.caregivers(id);
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.caregiver_qualifications') IS NOT NULL AND to_regclass('public.caregivers') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'caregiver_qualifications_caregiver_id_fkey') THEN
    ALTER TABLE public.caregiver_qualifications ADD CONSTRAINT caregiver_qualifications_caregiver_id_fkey
      FOREIGN KEY (caregiver_id) REFERENCES public.caregivers(id);
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.chat_messages') IS NOT NULL AND to_regclass('public.krankenfahrten') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_messages_ride_id_fkey') THEN
    ALTER TABLE public.chat_messages ADD CONSTRAINT chat_messages_ride_id_fkey
      FOREIGN KEY (ride_id) REFERENCES public.krankenfahrten(id);
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.client_budgets') IS NOT NULL AND to_regclass('public.clients') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'client_budgets_client_id_fkey') THEN
    ALTER TABLE public.client_budgets ADD CONSTRAINT client_budgets_client_id_fkey
      FOREIGN KEY (client_id) REFERENCES public.clients(id);
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.client_preferred_substitutes') IS NOT NULL AND to_regclass('public.caregivers') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'client_preferred_substitutes_caregiver_id_fkey') THEN
    ALTER TABLE public.client_preferred_substitutes ADD CONSTRAINT client_preferred_substitutes_caregiver_id_fkey
      FOREIGN KEY (caregiver_id) REFERENCES public.caregivers(id);
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.client_preferred_substitutes') IS NOT NULL AND to_regclass('public.clients') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'client_preferred_substitutes_client_id_fkey') THEN
    ALTER TABLE public.client_preferred_substitutes ADD CONSTRAINT client_preferred_substitutes_client_id_fkey
      FOREIGN KEY (client_id) REFERENCES public.clients(id);
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.fahrzeuge') IS NOT NULL AND to_regclass('public.krankenfahrt_providers') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fahrzeuge_provider_id_fkey') THEN
    ALTER TABLE public.fahrzeuge ADD CONSTRAINT fahrzeuge_provider_id_fkey
      FOREIGN KEY (provider_id) REFERENCES public.krankenfahrt_providers(id);
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.hygienebox_orders') IS NOT NULL AND to_regclass('public.profiles') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hygienebox_orders_user_id_fkey') THEN
    ALTER TABLE public.hygienebox_orders ADD CONSTRAINT hygienebox_orders_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.profiles(id);
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.invoice_disputes') IS NOT NULL AND to_regclass('public.invoices') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoice_disputes_invoice_id_fkey') THEN
    ALTER TABLE public.invoice_disputes ADD CONSTRAINT invoice_disputes_invoice_id_fkey
      FOREIGN KEY (invoice_id) REFERENCES public.invoices(id);
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.invoice_items') IS NOT NULL AND to_regclass('public.invoices') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoice_items_invoice_id_fkey') THEN
    ALTER TABLE public.invoice_items ADD CONSTRAINT invoice_items_invoice_id_fkey
      FOREIGN KEY (invoice_id) REFERENCES public.invoices(id);
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.invoice_items') IS NOT NULL AND to_regclass('public.service_records') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoice_items_service_record_id_fkey') THEN
    ALTER TABLE public.invoice_items ADD CONSTRAINT invoice_items_service_record_id_fkey
      FOREIGN KEY (service_record_id) REFERENCES public.service_records(id);
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.invoices') IS NOT NULL AND to_regclass('public.clients') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_client_id_fkey') THEN
    ALTER TABLE public.invoices ADD CONSTRAINT invoices_client_id_fkey
      FOREIGN KEY (client_id) REFERENCES public.clients(id);
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.invoices') IS NOT NULL AND to_regclass('public.verordnungen') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_verordnung_id_fkey') THEN
    ALTER TABLE public.invoices ADD CONSTRAINT invoices_verordnung_id_fkey
      FOREIGN KEY (verordnung_id) REFERENCES public.verordnungen(id);
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.kf_booking_reviews') IS NOT NULL AND to_regclass('public.profiles') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kf_booking_reviews_assigned_to_fkey') THEN
    ALTER TABLE public.kf_booking_reviews ADD CONSTRAINT kf_booking_reviews_assigned_to_fkey
      FOREIGN KEY (assigned_to) REFERENCES public.profiles(id);
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.kf_booking_reviews') IS NOT NULL AND to_regclass('public.profiles') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kf_booking_reviews_reviewed_by_fkey') THEN
    ALTER TABLE public.kf_booking_reviews ADD CONSTRAINT kf_booking_reviews_reviewed_by_fkey
      FOREIGN KEY (reviewed_by) REFERENCES public.profiles(id);
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.kf_partner_availability') IS NOT NULL AND to_regclass('public.kf_partners') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kf_partner_availability_partner_id_fkey') THEN
    ALTER TABLE public.kf_partner_availability ADD CONSTRAINT kf_partner_availability_partner_id_fkey
      FOREIGN KEY (partner_id) REFERENCES public.kf_partners(id);
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.kf_partners') IS NOT NULL AND to_regclass('public.profiles') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kf_partners_user_id_fkey') THEN
    ALTER TABLE public.kf_partners ADD CONSTRAINT kf_partners_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.profiles(id);
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.kf_pricing_costs') IS NOT NULL AND to_regclass('public.kf_pricing_tiers') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kf_pricing_costs_tier_id_fkey') THEN
    ALTER TABLE public.kf_pricing_costs ADD CONSTRAINT kf_pricing_costs_tier_id_fkey
      FOREIGN KEY (tier_id) REFERENCES public.kf_pricing_tiers(id);
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.kf_pricing_regions') IS NOT NULL AND to_regclass('public.kf_pricing_tiers') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kf_pricing_regions_tier_id_fkey') THEN
    ALTER TABLE public.kf_pricing_regions ADD CONSTRAINT kf_pricing_regions_tier_id_fkey
      FOREIGN KEY (tier_id) REFERENCES public.kf_pricing_tiers(id);
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.kf_pricing_rules') IS NOT NULL AND to_regclass('public.profiles') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kf_pricing_rules_created_by_fkey') THEN
    ALTER TABLE public.kf_pricing_rules ADD CONSTRAINT kf_pricing_rules_created_by_fkey
      FOREIGN KEY (created_by) REFERENCES public.profiles(id);
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.krankenfahrt_providers') IS NOT NULL AND to_regclass('public.profiles') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'krankenfahrt_providers_user_id_fkey') THEN
    ALTER TABLE public.krankenfahrt_providers ADD CONSTRAINT krankenfahrt_providers_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.profiles(id);
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.krankenfahrt_reviews') IS NOT NULL AND to_regclass('public.profiles') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'krankenfahrt_reviews_customer_id_fkey') THEN
    ALTER TABLE public.krankenfahrt_reviews ADD CONSTRAINT krankenfahrt_reviews_customer_id_fkey
      FOREIGN KEY (customer_id) REFERENCES public.profiles(id);
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.krankenfahrt_reviews') IS NOT NULL AND to_regclass('public.krankenfahrten') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'krankenfahrt_reviews_krankenfahrt_id_fkey') THEN
    ALTER TABLE public.krankenfahrt_reviews ADD CONSTRAINT krankenfahrt_reviews_krankenfahrt_id_fkey
      FOREIGN KEY (krankenfahrt_id) REFERENCES public.krankenfahrten(id);
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.krankenfahrt_reviews') IS NOT NULL AND to_regclass('public.krankenfahrt_providers') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'krankenfahrt_reviews_provider_id_fkey') THEN
    ALTER TABLE public.krankenfahrt_reviews ADD CONSTRAINT krankenfahrt_reviews_provider_id_fkey
      FOREIGN KEY (provider_id) REFERENCES public.krankenfahrt_providers(id);
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.krankenfahrten') IS NOT NULL AND to_regclass('public.care_recipients') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'krankenfahrten_care_recipient_id_fkey') THEN
    ALTER TABLE public.krankenfahrten ADD CONSTRAINT krankenfahrten_care_recipient_id_fkey
      FOREIGN KEY (care_recipient_id) REFERENCES public.care_recipients(id);
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.krankenfahrten') IS NOT NULL AND to_regclass('public.profiles') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'krankenfahrten_customer_id_fkey') THEN
    ALTER TABLE public.krankenfahrten ADD CONSTRAINT krankenfahrten_customer_id_fkey
      FOREIGN KEY (customer_id) REFERENCES public.profiles(id);
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.krankenfahrten') IS NOT NULL AND to_regclass('public.fahrzeuge') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'krankenfahrten_fahrzeug_id_fkey') THEN
    ALTER TABLE public.krankenfahrten ADD CONSTRAINT krankenfahrten_fahrzeug_id_fkey
      FOREIGN KEY (fahrzeug_id) REFERENCES public.fahrzeuge(id);
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.krankenfahrten') IS NOT NULL AND to_regclass('public.krankenfahrt_providers') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'krankenfahrten_provider_id_fkey') THEN
    ALTER TABLE public.krankenfahrten ADD CONSTRAINT krankenfahrten_provider_id_fkey
      FOREIGN KEY (provider_id) REFERENCES public.krankenfahrt_providers(id);
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.mis_applicants') IS NOT NULL AND to_regclass('public.mis_job_postings') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mis_applicants_job_posting_id_fkey') THEN
    ALTER TABLE public.mis_applicants ADD CONSTRAINT mis_applicants_job_posting_id_fkey
      FOREIGN KEY (job_posting_id) REFERENCES public.mis_job_postings(id);
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.partner_visits') IS NOT NULL AND to_regclass('public.cooperation_partners') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'partner_visits_partner_id_fkey') THEN
    ALTER TABLE public.partner_visits ADD CONSTRAINT partner_visits_partner_id_fkey
      FOREIGN KEY (partner_id) REFERENCES public.cooperation_partners(id);
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.referrals') IS NOT NULL AND to_regclass('public.profiles') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'referrals_referred_id_fkey') THEN
    ALTER TABLE public.referrals ADD CONSTRAINT referrals_referred_id_fkey
      FOREIGN KEY (referred_id) REFERENCES public.profiles(id);
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.referrals') IS NOT NULL AND to_regclass('public.profiles') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'referrals_referrer_id_fkey') THEN
    ALTER TABLE public.referrals ADD CONSTRAINT referrals_referrer_id_fkey
      FOREIGN KEY (referrer_id) REFERENCES public.profiles(id);
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.satisfaction_calls') IS NOT NULL AND to_regclass('public.clients') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'satisfaction_calls_client_id_fkey') THEN
    ALTER TABLE public.satisfaction_calls ADD CONSTRAINT satisfaction_calls_client_id_fkey
      FOREIGN KEY (client_id) REFERENCES public.clients(id);
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.service_records') IS NOT NULL AND to_regclass('public.caregivers') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'service_records_caregiver_id_fkey') THEN
    ALTER TABLE public.service_records ADD CONSTRAINT service_records_caregiver_id_fkey
      FOREIGN KEY (caregiver_id) REFERENCES public.caregivers(id);
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.service_records') IS NOT NULL AND to_regclass('public.clients') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'service_records_client_id_fkey') THEN
    ALTER TABLE public.service_records ADD CONSTRAINT service_records_client_id_fkey
      FOREIGN KEY (client_id) REFERENCES public.clients(id);
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.service_records') IS NOT NULL AND to_regclass('public.verordnungen') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'service_records_verordnung_id_fkey') THEN
    ALTER TABLE public.service_records ADD CONSTRAINT service_records_verordnung_id_fkey
      FOREIGN KEY (verordnung_id) REFERENCES public.verordnungen(id);
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.substitution_requests') IS NOT NULL AND to_regclass('public.absences') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'substitution_requests_absence_id_fkey') THEN
    ALTER TABLE public.substitution_requests ADD CONSTRAINT substitution_requests_absence_id_fkey
      FOREIGN KEY (absence_id) REFERENCES public.absences(id);
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.substitution_requests') IS NOT NULL AND to_regclass('public.assignments') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'substitution_requests_assignment_id_fkey') THEN
    ALTER TABLE public.substitution_requests ADD CONSTRAINT substitution_requests_assignment_id_fkey
      FOREIGN KEY (assignment_id) REFERENCES public.assignments(id);
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.substitution_requests') IS NOT NULL AND to_regclass('public.clients') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'substitution_requests_client_id_fkey') THEN
    ALTER TABLE public.substitution_requests ADD CONSTRAINT substitution_requests_client_id_fkey
      FOREIGN KEY (client_id) REFERENCES public.clients(id);
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.substitution_requests') IS NOT NULL AND to_regclass('public.caregivers') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'substitution_requests_original_caregiver_id_fkey') THEN
    ALTER TABLE public.substitution_requests ADD CONSTRAINT substitution_requests_original_caregiver_id_fkey
      FOREIGN KEY (original_caregiver_id) REFERENCES public.caregivers(id);
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.substitution_requests') IS NOT NULL AND to_regclass('public.caregivers') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'substitution_requests_substitute_caregiver_id_fkey') THEN
    ALTER TABLE public.substitution_requests ADD CONSTRAINT substitution_requests_substitute_caregiver_id_fkey
      FOREIGN KEY (substitute_caregiver_id) REFERENCES public.caregivers(id);
  END IF;
END $$;

-- ── RLS-Lücke schließen (Befund Shadow-DB-Replay 2026-08-02) ─────────
-- Diese 6 MIS-Tabellen stammen aus 20260302_mis_schema.sql, das für sie
-- KEIN `ENABLE ROW LEVEL SECURITY` setzt (5 von 17 Tabellen dort haben
-- es, diese nicht). Live ist RLS auf allen 124 public-Tabellen aktiv —
-- es wurde also nachträglich im Dashboard eingeschaltet und nie ins Repo
-- zurückgeschrieben.
--
-- Auswirkung auf jede aus dem Repo gebaute DB: 20260801_phase3 legt für
-- mis_budget_items, mis_capa, mis_financial_reports, mis_purchase_orders
-- und mis_suppliers zwar die RESTRICTIVE org_fence-Policy an — ohne
-- aktives RLS wird sie aber nie ausgewertet. Die Mandantentrennung wäre
-- auf diesen Tabellen wirkungslos.
ALTER TABLE public.mis_ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mis_budget_items     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mis_capa             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mis_financial_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mis_purchase_orders  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mis_suppliers        ENABLE ROW LEVEL SECURITY;

-- ── RLS aktivieren ──
ALTER TABLE public.abrechnung_zertifikate ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.abrechnungslaeufe ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.absences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.caregiver_bonuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.caregiver_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.caregiver_initials_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.caregiver_qualifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.caregivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_preferred_substitutes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cooperation_partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.datenannahmestellen ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fahrzeuge ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fcm_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hygienebox_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kf_booking_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kf_feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kf_partner_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kf_partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kf_pricing_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kf_pricing_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kf_pricing_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kf_pricing_regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kf_pricing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kf_pricing_surcharges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kf_pricing_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kf_review_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kf_service_doc_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.krankenfahrt_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.krankenfahrt_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.krankenfahrten ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medikamentenplan ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mis_applicants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mis_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mis_complaints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mis_job_postings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mis_privacy_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mis_privacy_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mis_privacy_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mis_privacy_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mis_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notfall_access_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notfall_info ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.satisfaction_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.substitution_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_conversations ENABLE ROW LEVEL SECURITY;

COMMIT;
