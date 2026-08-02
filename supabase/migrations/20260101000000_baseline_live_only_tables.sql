-- ════════════════════════════════════════════════════════════════════
-- BASELINE: Tabellen, die bisher NUR live in Supabase existierten
-- ════════════════════════════════════════════════════════════════════
--
-- Warum diese Datei existiert
-- ---------------------------
-- 61 Tabellen des Betriebssystems wurden historisch direkt im Supabase-
-- SQL-Editor angelegt und nie als Migration ins Repo zurückgeschrieben.
-- Ein Replay von supabase/migrations/ auf einer leeren Datenbank ist
-- deshalb bisher abgebrochen (z.B. `relation "public.clients" does not
-- exist` in 20260719_eylem_audit_complete_features.sql).
--
-- Diese Datei schließt die Lücke. Sie ist aus dem Live-Schema des
-- Projekts nnwyktkqibdjxgimjyuq rekonstruiert (PostgREST-OpenAPI-
-- Introspektion am 2026-08-02): Spalten, Typen, Defaults, NOT-NULL und
-- Primary Keys. Fremdschlüssel folgen separat in
-- 20260802000100_baseline_live_only_constraints.sql, weil manche Ziel-
-- tabellen erst von späteren Migrationen angelegt werden.
--
-- Dateiname-Präfix 20260101000000 ist Absicht: die Datei muss VOR allen
-- datierten Migrationen laufen, die auf diese Tabellen zugreifen.
--
-- organization_id
-- ---------------
-- Bewusst NICHT enthalten für die 30 Tabellen, die im tenant_tables-
-- Array von 20260801_phase3_multi_mandant_saas.sql stehen — diese
-- Migration legt Spalte, Default (current_org_id()), FK, NOT NULL,
-- Index und RESTRICTIVE org_fence-Policy selbst an. Eine zweite Quelle
-- der Wahrheit wäre hier ein Wartungsrisiko.
--
-- Alles CREATE TABLE IF NOT EXISTS → auf der bestehenden Produktions-
-- DB wäre die Datei ein No-Op. Sie wurde dort NICHT angewendet.
-- ════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS public.abrechnung_zertifikate (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ik_nummer text NOT NULL,
    typ text NOT NULL,
    zertifikat_url text,
    zertifikat_pem text,
    gueltig_ab date,
    gueltig_bis date,
    fingerprint text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.abrechnungslaeufe (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    abrechnungsmonat text NOT NULL,
    kostentraeger_ik text NOT NULL,
    kostentraeger_name text,
    status text DEFAULT 'erstellt'::text NOT NULL,
    anzahl_faelle integer,
    gesamtbetrag_cent integer,
    rechnungsnummer text,
    datenannahmestelle_ik text,
    datenannahmestelle_name text,
    logischer_dateiname text,
    edifact_datei_url text,
    auftragsdatei_url text,
    fehlerprotokoll text,
    erstellt_am timestamp with time zone DEFAULT now(),
    uebermittelt_am timestamp with time zone,
    antwort_am timestamp with time zone,
    created_by uuid,
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.absences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    caregiver_id uuid NOT NULL,
    absence_type text NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    reason text,
    reported_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.app_settings (
    key text NOT NULL,
    value jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    PRIMARY KEY (key)
);

CREATE TABLE IF NOT EXISTS public.applications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    first_name text NOT NULL,
    last_name text NOT NULL,
    email text,
    phone text,
    source text,
    referred_by_caregiver_id uuid,
    position text DEFAULT 'alltagsbegleiter'::text,
    status text DEFAULT 'neu'::text,
    notes text,
    documents jsonb,
    interview_date date,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    caregiver_id uuid NOT NULL,
    weekday integer,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    service_type text NOT NULL,
    is_recurring boolean DEFAULT true,
    valid_from date DEFAULT CURRENT_DATE,
    valid_until date,
    status text DEFAULT 'active'::text,
    created_at timestamp with time zone DEFAULT now(),
    verordnung_id uuid,
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.budget_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    budget_id uuid NOT NULL,
    service_record_id uuid,
    budget_source text NOT NULL,
    amount numeric NOT NULL,
    transaction_type text NOT NULL,
    description text,
    date date DEFAULT CURRENT_DATE NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.caregiver_bonuses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    caregiver_id uuid NOT NULL,
    bonus_type text NOT NULL,
    description text,
    points integer DEFAULT 0,
    reward_type text,
    reward_value numeric,
    awarded_date date DEFAULT CURRENT_DATE,
    awarded_by text,
    created_at timestamp with time zone DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.caregiver_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    caregiver_id uuid NOT NULL,
    document_type text NOT NULL,
    title text NOT NULL,
    document_url text,
    issued_date date,
    valid_until date,
    reminder_sent boolean DEFAULT false,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.caregiver_initials_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    caregiver_id uuid NOT NULL,
    initials text NOT NULL,
    valid_from date DEFAULT CURRENT_DATE NOT NULL,
    valid_until date,
    changed_reason text,
    created_at timestamp with time zone DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.caregiver_qualifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    caregiver_id uuid NOT NULL,
    qualification_type text NOT NULL,
    title text NOT NULL,
    issued_date date,
    valid_until date,
    document_url text,
    reminder_60_sent boolean DEFAULT false,
    reminder_30_sent boolean DEFAULT false,
    reminder_7_sent boolean DEFAULT false,
    status text DEFAULT 'valid'::text,
    created_at timestamp with time zone DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.caregivers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    first_name text NOT NULL,
    last_name text NOT NULL,
    initials text NOT NULL,
    phone text,
    email text,
    address text,
    city text,
    zip_code text,
    has_drivers_license boolean DEFAULT false,
    has_vehicle boolean DEFAULT false,
    languages text[],
    qualifications jsonb,
    status text DEFAULT 'active'::text,
    emergency_pool boolean DEFAULT false,
    emergency_pool_bonus_rate numeric DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    is_nurse boolean DEFAULT false,
    nurse_title text,
    nurse_registration_number text,
    nurse_certificate_url text,
    lifetime_registration_number text,
    ik_nummer text,
    qualification_level text DEFAULT 'betreuungskraft_45a'::text,
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.chat_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ride_id uuid NOT NULL,
    sender_id uuid NOT NULL,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.client_budgets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    year integer NOT NULL,
    monthly_amount numeric DEFAULT 131.0,
    annual_amount numeric DEFAULT 1572.0,
    carryover_amount numeric DEFAULT 0,
    carryover_expires date,
    used_amount numeric DEFAULT 0,
    used_from_carryover numeric DEFAULT 0,
    private_amount numeric DEFAULT 0,
    status text DEFAULT 'active'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    combined_annual_amount numeric DEFAULT 3539.0,
    combined_used_amount numeric DEFAULT 0,
    combined_type text DEFAULT 'verhinderung'::text,
    requires_application boolean DEFAULT false,
    application_submitted boolean DEFAULT false,
    application_approved boolean DEFAULT false,
    application_notes text,
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.client_preferred_substitutes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    caregiver_id uuid NOT NULL,
    priority integer DEFAULT 1,
    created_at timestamp with time zone DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.clients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    customer_number text NOT NULL,
    first_name text NOT NULL,
    last_name text NOT NULL,
    date_of_birth date,
    address text,
    city text,
    zip_code text,
    phone text,
    email text,
    care_level integer,
    care_level_since date,
    insurance_name text,
    insurance_number text,
    notes text,
    status text DEFAULT 'active'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    pipeline_status text DEFAULT 'active'::text,
    source text,
    assigned_engel text,
    monthly_hours numeric,
    contract_start date,
    last_contact date,
    allergies text,
    medications text,
    mobility_status text,
    dietary_restrictions text,
    medical_conditions text,
    emergency_contact_name text,
    emergency_contact_phone text,
    emergency_contact_relationship text,
    next_of_kin_name text,
    next_of_kin_phone text,
    next_of_kin_email text,
    next_of_kin_relationship text,
    hausarzt_name text,
    hausarzt_phone text,
    versichertennummer text,
    pflegekasse_name text,
    pflegekasse_ik text,
    pflegegrad integer,
    geburtsdatum date,
    krankenkasse text,
    krankenkasse_ik text,
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.conversions (
    id bigint NOT NULL,
    label text NOT NULL,
    value numeric DEFAULT 0,
    currency text DEFAULT 'EUR'::text,
    gclid text,
    email_hash text,
    phone_hash text,
    ip text,
    user_agent text,
    created_at timestamp with time zone DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.cooperation_partners (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    address text,
    city text,
    zip_code text,
    phone text,
    email text,
    website text,
    contact_person text,
    last_visit date,
    visit_notes text,
    next_visit date,
    visited_by text,
    status text DEFAULT 'active'::text,
    materials_left jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.datenannahmestellen (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    ik_nummer text,
    sftp_host text,
    sftp_port integer DEFAULT 22,
    sftp_user text,
    sftp_verzeichnis text,
    antwort_verzeichnis text,
    sftp_key_url text,
    kim_adresse text,
    zustaendig_fuer text[],
    aktiv boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.fahrzeuge (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider_id uuid NOT NULL,
    kennzeichen text NOT NULL,
    marke text NOT NULL,
    modell text NOT NULL,
    baujahr integer,
    farbe text,
    sitze integer DEFAULT 4,
    rollstuhl_geeignet boolean DEFAULT false,
    tragestuhl_geeignet boolean DEFAULT false,
    liegend_transport boolean DEFAULT false,
    klimaanlage boolean DEFAULT true,
    tuev_bis date,
    versicherung_bis date,
    foto_url text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.fcm_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token text NOT NULL,
    platform text DEFAULT 'android'::text NOT NULL,
    device_info text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.hygienebox_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    delivery_address text NOT NULL,
    pflegegrad integer NOT NULL,
    insurance_company text NOT NULL,
    insurance_number text,
    products jsonb NOT NULL,
    consent boolean DEFAULT false,
    status text DEFAULT 'submitted'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.invoice_disputes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    invoice_id uuid NOT NULL,
    original_amount numeric NOT NULL,
    paid_amount numeric NOT NULL,
    difference numeric,
    reason text,
    can_appeal boolean DEFAULT true,
    missing_document text,
    budget_exceeded boolean DEFAULT false,
    charge_private boolean DEFAULT false,
    status text DEFAULT 'open'::text,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    resolved_at timestamp with time zone,
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.invoice_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    invoice_id uuid NOT NULL,
    service_record_id uuid,
    description text NOT NULL,
    date date NOT NULL,
    duration_minutes integer,
    amount numeric NOT NULL,
    budget_type text,
    created_at timestamp with time zone DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.invoices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    invoice_number text NOT NULL,
    client_id uuid NOT NULL,
    insurance_name text,
    insurance_number text,
    period_start date NOT NULL,
    period_end date NOT NULL,
    total_amount numeric NOT NULL,
    budget_amount numeric DEFAULT 0,
    private_amount numeric DEFAULT 0,
    status text DEFAULT 'draft'::text,
    sent_at timestamp with time zone,
    paid_at timestamp with time zone,
    paid_amount numeric,
    rejection_reason text,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    verordnung_id uuid,
    soll_betrag_cent integer,
    ist_betrag_cent integer,
    kuerzung_cent integer DEFAULT 0,
    kuerzung_grund text,
    bezahlt boolean DEFAULT false,
    bezahlt_am date,
    versand_elektronisch boolean DEFAULT false,
    versand_post boolean DEFAULT false,
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.kf_booking_reviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    booking_id uuid NOT NULL,
    review_reason text NOT NULL,
    severity text DEFAULT 'warning'::text NOT NULL,
    review_flags jsonb NOT NULL,
    pricing_snapshot jsonb,
    margin_info jsonb,
    status text DEFAULT 'pending'::text,
    assigned_to uuid,
    reviewed_at timestamp with time zone,
    reviewed_by uuid,
    reviewer_notes text,
    created_at timestamp with time zone DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.kf_feature_flags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    flag_name text NOT NULL,
    description text,
    enabled boolean DEFAULT false,
    rollout_percentage integer DEFAULT 0,
    rollout_strategy text DEFAULT 'all'::text,
    allowed_users text[],
    effective_from timestamp with time zone,
    effective_to timestamp with time zone,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.kf_partner_availability (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    partner_id uuid,
    available_date date NOT NULL,
    start_time time without time zone DEFAULT '06:00:00'::time without time zone NOT NULL,
    end_time time without time zone DEFAULT '22:00:00'::time without time zone NOT NULL,
    vehicle_type text,
    max_trips integer DEFAULT 5,
    booked_trips integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.kf_partners (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    name text NOT NULL,
    company_name text,
    email text,
    phone text,
    vehicle_types text[],
    service_areas jsonb,
    coverage_plz text[],
    available_hours jsonb,
    max_bookings_per_day integer DEFAULT 20,
    rating numeric DEFAULT 0,
    total_trips integer DEFAULT 0,
    commission_rate numeric DEFAULT 15.0,
    verified boolean DEFAULT false,
    enabled boolean DEFAULT true,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.kf_pricing_audit (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid,
    action text NOT NULL,
    old_values jsonb,
    new_values jsonb,
    actor_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.kf_pricing_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    key text NOT NULL,
    value jsonb NOT NULL,
    description text,
    enabled boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.kf_pricing_costs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tier_id uuid,
    fuel_cost_per_km numeric DEFAULT 0.25 NOT NULL,
    driver_rate_per_km numeric DEFAULT 0.5 NOT NULL,
    vehicle_cost_per_km numeric DEFAULT 0.15 NOT NULL,
    driver_rate_per_min numeric DEFAULT 0.03 NOT NULL,
    fixed_overhead numeric DEFAULT 5.0 NOT NULL,
    effective_from date DEFAULT CURRENT_DATE NOT NULL,
    effective_to date,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.kf_pricing_regions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    region_code text NOT NULL,
    region_name text NOT NULL,
    tier_id uuid,
    price_multiplier numeric DEFAULT 1.0 NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.kf_pricing_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    description text,
    rule_type text NOT NULL,
    priority integer DEFAULT 0,
    condition_json jsonb NOT NULL,
    pricing_adjustments jsonb NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    active boolean DEFAULT true,
    starts_at timestamp with time zone,
    ends_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.kf_pricing_surcharges (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    description text,
    surcharge_type text NOT NULL,
    value numeric DEFAULT 0 NOT NULL,
    applies_to text[],
    enabled boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.kf_pricing_tiers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    description text,
    base_price numeric DEFAULT 0 NOT NULL,
    per_km_rate numeric DEFAULT 0 NOT NULL,
    min_price numeric DEFAULT 0 NOT NULL,
    wait_per_min numeric DEFAULT 0 NOT NULL,
    surcharge_amount numeric DEFAULT 0 NOT NULL,
    icon text,
    enabled boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.kf_review_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    description text,
    trigger_type text DEFAULT 'condition'::text NOT NULL,
    trigger_field text,
    trigger_operator text,
    trigger_value text,
    trigger_condition jsonb NOT NULL,
    severity text DEFAULT 'warning'::text,
    action text DEFAULT 'flag'::text,
    enabled boolean DEFAULT true,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.kf_service_doc_requirements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    service_type text NOT NULL,
    required_documents jsonb NOT NULL,
    optional_documents jsonb,
    validation_rules jsonb,
    enabled boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.krankenfahrt_providers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    company_name text NOT NULL,
    license_number text,
    tax_id text,
    address text,
    city text DEFAULT 'Frankfurt'::text,
    phone text,
    email text,
    is_verified boolean DEFAULT false,
    is_active boolean DEFAULT true,
    service_area_km integer DEFAULT 50,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    status text DEFAULT 'pending'::text NOT NULL,
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.krankenfahrt_reviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    krankenfahrt_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    provider_id uuid NOT NULL,
    rating integer NOT NULL,
    comment text,
    puenktlichkeit integer,
    freundlichkeit integer,
    fahrzeug_zustand integer,
    created_at timestamp with time zone DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.krankenfahrten (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid NOT NULL,
    abholadresse text NOT NULL,
    zieladresse text NOT NULL,
    datum date NOT NULL,
    uhrzeit time without time zone NOT NULL,
    rueckfahrt boolean DEFAULT false,
    rollstuhl_benoetig boolean DEFAULT false,
    tragestuhl_benoetig boolean DEFAULT false,
    hinweise text,
    payment_method text NOT NULL,
    insurance_type text,
    insurance_provider text,
    total_amount numeric NOT NULL,
    status text DEFAULT 'pending'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    provider_id uuid,
    fahrzeug_id uuid,
    fahrer_notizen text,
    pricing_snapshot jsonb,
    care_recipient_id uuid,
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.login_rate_limits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    key text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    first_attempt timestamp with time zone DEFAULT now() NOT NULL,
    locked_until timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.medikamentenplan (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    medikament_name text NOT NULL,
    wirkstoff text,
    dosierung text NOT NULL,
    einheit text DEFAULT 'mg'::text,
    einnahme_morgens boolean DEFAULT false,
    einnahme_mittags boolean DEFAULT false,
    einnahme_abends boolean DEFAULT false,
    einnahme_nachts boolean DEFAULT false,
    einnahme_hinweis text,
    verordnet_von text,
    beginn_datum date,
    end_datum date,
    dauermedikation boolean DEFAULT true,
    aktiv boolean DEFAULT true,
    notizen text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.mis_applicants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    first_name text NOT NULL,
    last_name text NOT NULL,
    email text DEFAULT ''::text,
    phone text DEFAULT ''::text,
    position text DEFAULT 'Alltagsbegleiter/in'::text NOT NULL,
    status text DEFAULT 'eingang'::text NOT NULL,
    source text DEFAULT 'Initiativbewerbung'::text,
    notes text DEFAULT ''::text,
    rating integer DEFAULT 0,
    documents jsonb,
    job_posting_id uuid,
    applied_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.mis_availability (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    engel_id uuid NOT NULL,
    engel_name text DEFAULT ''::text NOT NULL,
    wochentag integer NOT NULL,
    von time without time zone NOT NULL,
    bis time without time zone NOT NULL,
    wiederholend boolean DEFAULT true,
    gueltig_ab date,
    gueltig_bis date,
    created_at timestamp with time zone DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.mis_complaints (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    category text DEFAULT 'sonstiges'::text NOT NULL,
    priority text DEFAULT 'normal'::text NOT NULL,
    status text DEFAULT 'eingegangen'::text NOT NULL,
    customer_name text DEFAULT ''::text NOT NULL,
    angel_name text DEFAULT ''::text NOT NULL,
    reported_by text DEFAULT ''::text NOT NULL,
    assigned_to text DEFAULT ''::text NOT NULL,
    incident_date date,
    due_date date,
    resolved_date timestamp with time zone,
    closed_date timestamp with time zone,
    corrective_action text DEFAULT ''::text NOT NULL,
    preventive_action text DEFAULT ''::text NOT NULL,
    root_cause text DEFAULT ''::text NOT NULL,
    notes text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.mis_job_postings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text DEFAULT ''::text,
    location text DEFAULT 'Hagen'::text,
    position_type text DEFAULT 'Alltagsbegleiter/in'::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    channels text[],
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.mis_privacy_audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    action text NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid,
    performed_by text,
    details jsonb,
    created_at timestamp with time zone DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.mis_privacy_consents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    person_name text NOT NULL,
    person_type text DEFAULT 'kunde'::text NOT NULL,
    consent_type text NOT NULL,
    status text DEFAULT 'erteilt'::text NOT NULL,
    granted_at timestamp with time zone DEFAULT now(),
    revoked_at timestamp with time zone,
    channel text DEFAULT 'app'::text,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.mis_privacy_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    purpose text NOT NULL,
    legal_basis text DEFAULT 'Art. 6 Abs. 1 lit. b DSGVO'::text NOT NULL,
    data_categories text[],
    affected_persons text[],
    recipients text[],
    retention_period text,
    toms text,
    third_country_transfer boolean DEFAULT false,
    responsible_person text,
    status text DEFAULT 'active'::text,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.mis_privacy_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    requester_name text NOT NULL,
    request_type text NOT NULL,
    status text DEFAULT 'offen'::text NOT NULL,
    description text,
    assigned_to text,
    due_date timestamp with time zone,
    completed_at timestamp with time zone,
    response_notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.mis_shifts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    engel_id uuid,
    engel_name text DEFAULT ''::text NOT NULL,
    kunde_id uuid,
    kunde_name text DEFAULT ''::text NOT NULL,
    datum date NOT NULL,
    start_zeit time without time zone NOT NULL,
    end_zeit time without time zone NOT NULL,
    typ text NOT NULL,
    status text DEFAULT 'offen'::text NOT NULL,
    notizen text DEFAULT ''::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.notfall_access_attempts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    success boolean NOT NULL,
    attempted_at timestamp with time zone DEFAULT now() NOT NULL,
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.notfall_info (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    blutgruppe text,
    allergien text,
    vorerkrankungen text,
    notfallkontakt_name text,
    notfallkontakt_telefon text,
    notfallkontakt_beziehung text,
    versicherung text,
    versicherungsnummer text,
    hausarzt_name text,
    hausarzt_telefon text,
    notfall_pin text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.partner_visits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    partner_id uuid NOT NULL,
    visit_date date NOT NULL,
    visited_by text NOT NULL,
    notes text,
    materials_left text[],
    next_visit date,
    created_at timestamp with time zone DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    endpoint text NOT NULL,
    p256dh text NOT NULL,
    auth text NOT NULL,
    user_agent text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.referrals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    referrer_id uuid NOT NULL,
    referred_id uuid NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    bonus_amount numeric DEFAULT 20 NOT NULL,
    referrer_credited boolean DEFAULT false,
    referred_credited boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    completed_at timestamp with time zone,
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.satisfaction_calls (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    call_type text NOT NULL,
    call_date date NOT NULL,
    called_by text,
    satisfaction_rating integer,
    is_punctual boolean,
    feels_comfortable boolean,
    keep_caregiver boolean,
    suggestions text,
    notes text,
    next_call_date date,
    created_at timestamp with time zone DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.service_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    caregiver_id uuid NOT NULL,
    date date NOT NULL,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    duration_minutes integer,
    service_type text NOT NULL,
    budget_type text NOT NULL,
    amount numeric,
    client_signature text,
    caregiver_initials text NOT NULL,
    gps_lat numeric,
    gps_lng numeric,
    notes text,
    status text DEFAULT 'draft'::text,
    completeness_check jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    verordnung_id uuid,
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.substitution_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    assignment_id uuid,
    absence_id uuid,
    client_id uuid NOT NULL,
    original_caregiver_id uuid NOT NULL,
    date date NOT NULL,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    service_type text NOT NULL,
    substitute_caregiver_id uuid,
    status text DEFAULT 'open'::text,
    escalation_level integer DEFAULT 0,
    client_notified boolean DEFAULT false,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    resolved_at timestamp with time zone,
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.whatsapp_conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    wa_phone text NOT NULL,
    wa_msg_id text,
    direction text NOT NULL,
    body text NOT NULL,
    raw jsonb,
    ai_model text,
    escalated boolean DEFAULT false,
    escalation_reason text,
    rate_limited boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    PRIMARY KEY (id)
);

COMMIT;
