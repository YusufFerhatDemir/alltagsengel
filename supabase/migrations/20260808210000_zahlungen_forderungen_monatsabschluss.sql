-- ════════════════════════════════════════════════════════════════════
-- Zahlungseingänge, Forderungsmanagement, Monatsabschluss-Erweiterung
-- ════════════════════════════════════════════════════════════════════
-- Neue Tabellen:
--   payments              – Zahlungseingänge (manuell, Überweisung, Sammel)
--   payment_allocations   – Zuordnung Zahlung → Rechnung(en)
--   dunning_entries       – Mahnstufen-Protokoll
--   payment_differences   – Kassenkürzungen / Differenzen
-- Erweiterungen:
--   invoices              – neue Spalten für Forderungsmanagement
--   monthly_closings      – erweiterte Ampel-Felder
-- ════════════════════════════════════════════════════════════════════

BEGIN;

-- ──────────────────────────────────────────────────────────────────
-- 0) Legacy-payments aus initial-setup.sql erkennen und umbenennen
-- ──────────────────────────────────────────────────────────────────
DO $legacy_check$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'booking_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'organization_id'
  ) THEN
    DROP POLICY IF EXISTS "Kullanıcı kendi ödemelerini okuyabilir" ON public.payments;
    DROP POLICY IF EXISTS "Admin ödemeleri yönetebilir" ON public.payments;
    ALTER TABLE public.payments RENAME TO legacy_stripe_payments;
  END IF;
END
$legacy_check$;

-- ──────────────────────────────────────────────────────────────────
-- 1) PAYMENTS — Zahlungseingänge
-- ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.payments (
    id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid NOT NULL,

    payment_date    date NOT NULL,
    amount_cents    integer NOT NULL CHECK (amount_cents > 0),

    payment_method  text NOT NULL DEFAULT 'ueberweisung'
        CHECK (payment_method IN (
            'ueberweisung', 'lastschrift', 'bar', 'scheck',
            'kassen_sammelueberweisung', 'rueckzahlung'
        )),

    payer_type      text NOT NULL DEFAULT 'kunde'
        CHECK (payer_type IN ('kunde', 'kostentraeger', 'sonstiger')),
    payer_name      text,
    payer_reference text,

    bank_reference  text,
    verwendungszweck text,

    matching_status text NOT NULL DEFAULT 'nicht_zugeordnet'
        CHECK (matching_status IN (
            'automatisch_zugeordnet', 'zuordnung_vorschlag',
            'manuell_zugeordnet', 'manuelle_pruefung',
            'nicht_zugeordnet', 'teilweise_zugeordnet'
        )),

    allocated_cents integer NOT NULL DEFAULT 0,
    unallocated_cents integer GENERATED ALWAYS AS (amount_cents - allocated_cents) STORED,

    notes           text,
    created_by      uuid REFERENCES auth.users(id),
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    deleted_at      timestamptz
);

CREATE INDEX IF NOT EXISTS idx_payments_org ON public.payments(organization_id);
CREATE INDEX IF NOT EXISTS idx_payments_date ON public.payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_payments_matching ON public.payments(matching_status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_payments_bank_ref ON public.payments(bank_reference) WHERE bank_reference IS NOT NULL;

-- ──────────────────────────────────────────────────────────────────
-- 2) PAYMENT_ALLOCATIONS — Zuordnung Zahlung → Rechnung
-- ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.payment_allocations (
    id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid NOT NULL,
    payment_id      uuid NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
    invoice_id      uuid NOT NULL REFERENCES public.invoices(id),

    amount_cents    integer NOT NULL CHECK (amount_cents > 0),

    allocation_type text NOT NULL DEFAULT 'vollzahlung'
        CHECK (allocation_type IN (
            'vollzahlung', 'teilzahlung', 'ueberzahlung',
            'sammelzahlung_anteil', 'gutschrift_verrechnung'
        )),

    allocated_by    uuid REFERENCES auth.users(id),
    allocated_at    timestamptz NOT NULL DEFAULT now(),
    notes           text,

    created_at      timestamptz NOT NULL DEFAULT now(),

    UNIQUE(payment_id, invoice_id)
);

CREATE INDEX IF NOT EXISTS idx_alloc_payment ON public.payment_allocations(payment_id);
CREATE INDEX IF NOT EXISTS idx_alloc_invoice ON public.payment_allocations(invoice_id);
CREATE INDEX IF NOT EXISTS idx_alloc_org ON public.payment_allocations(organization_id);

-- ──────────────────────────────────────────────────────────────────
-- 3) DUNNING_ENTRIES — Mahnstufen-Protokoll
-- ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.dunning_entries (
    id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid NOT NULL,
    invoice_id      uuid NOT NULL REFERENCES public.invoices(id),

    dunning_level   text NOT NULL DEFAULT 'offen'
        CHECK (dunning_level IN (
            'offen', 'erinnerung', 'mahnung_1', 'mahnung_2',
            'letzte_mahnung', 'inkasso_vorbereitung', 'bezahlt'
        )),

    due_date        date NOT NULL,
    days_overdue    integer NOT NULL DEFAULT 0,

    amount_due_cents    integer NOT NULL,
    amount_paid_cents   integer NOT NULL DEFAULT 0,
    amount_open_cents   integer GENERATED ALWAYS AS (amount_due_cents - amount_paid_cents) STORED,

    dunning_fee_cents   integer NOT NULL DEFAULT 0,

    last_dunning_at     timestamptz,
    next_dunning_at     date,

    block_dunning       boolean NOT NULL DEFAULT false,
    block_reason        text,

    notes               text,
    created_by          uuid REFERENCES auth.users(id),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),

    UNIQUE(invoice_id)
);

CREATE INDEX IF NOT EXISTS idx_dunning_org ON public.dunning_entries(organization_id);
CREATE INDEX IF NOT EXISTS idx_dunning_level ON public.dunning_entries(dunning_level) WHERE dunning_level NOT IN ('bezahlt');
CREATE INDEX IF NOT EXISTS idx_dunning_due ON public.dunning_entries(due_date) WHERE dunning_level NOT IN ('bezahlt');

-- ──────────────────────────────────────────────────────────────────
-- 4) PAYMENT_DIFFERENCES — Kassenkürzungen / Differenzen
-- ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.payment_differences (
    id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id     uuid NOT NULL,
    invoice_id          uuid NOT NULL REFERENCES public.invoices(id),

    soll_cents          integer NOT NULL,
    ist_cents           integer NOT NULL,
    differenz_cents     integer GENERATED ALWAYS AS (soll_cents - ist_cents) STORED,

    kuerzung_grund      text,
    kuerzung_kategorie  text CHECK (kuerzung_kategorie IS NULL OR kuerzung_kategorie IN (
        'budget_ueberschreitung', 'leistung_nicht_anerkannt',
        'formfehler', 'fehlende_unterlagen', 'tarifabweichung',
        'doppelabrechnung', 'sonstiges'
    )),

    widerspruch_status  text NOT NULL DEFAULT 'offen'
        CHECK (widerspruch_status IN (
            'offen', 'widerspruch_eingereicht', 'widerspruch_anerkannt',
            'widerspruch_abgelehnt', 'nachforderung', 'gutschrift',
            'abschreibung', 'erledigt'
        )),

    widerspruch_frist   date,
    widerspruch_at      timestamptz,
    widerspruch_notes   text,

    nachforderung_cents integer DEFAULT 0,
    gutschrift_cents    integer DEFAULT 0,
    abschreibung_cents  integer DEFAULT 0,

    resolved_at         timestamptz,
    resolved_by         uuid REFERENCES auth.users(id),

    created_by          uuid REFERENCES auth.users(id),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_diff_org ON public.payment_differences(organization_id);
CREATE INDEX IF NOT EXISTS idx_diff_invoice ON public.payment_differences(invoice_id);
CREATE INDEX IF NOT EXISTS idx_diff_status ON public.payment_differences(widerspruch_status) WHERE widerspruch_status NOT IN ('erledigt');

-- ──────────────────────────────────────────────────────────────────
-- 5) INVOICES — Erweiterungen für Forderungsmanagement
-- ──────────────────────────────────────────────────────────────────

DO $col_check$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'invoices' AND column_name = 'due_date') THEN
        ALTER TABLE public.invoices ADD COLUMN due_date date;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'invoices' AND column_name = 'payment_terms_days') THEN
        ALTER TABLE public.invoices ADD COLUMN payment_terms_days integer NOT NULL DEFAULT 30;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'invoices' AND column_name = 'dunning_level') THEN
        ALTER TABLE public.invoices ADD COLUMN dunning_level text NOT NULL DEFAULT 'offen';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'invoices' AND column_name = 'billing_type') THEN
        ALTER TABLE public.invoices ADD COLUMN billing_type text NOT NULL DEFAULT 'privat'
            CHECK (billing_type IN ('privat', 'kasse', 'misch', 'sozialamt', 'sonstiger_kostentraeger'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'invoices' AND column_name = 'kostentraeger_name') THEN
        ALTER TABLE public.invoices ADD COLUMN kostentraeger_name text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'invoices' AND column_name = 'kostentraeger_ik') THEN
        ALTER TABLE public.invoices ADD COLUMN kostentraeger_ik text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'invoices' AND column_name = 'bundesland') THEN
        ALTER TABLE public.invoices ADD COLUMN bundesland text;
    END IF;
END
$col_check$;

-- Index für Fälligkeitsabfragen
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON public.invoices(due_date) WHERE due_date IS NOT NULL AND status NOT IN ('bezahlt', 'storniert', 'akzeptiert');

-- ──────────────────────────────────────────────────────────────────
-- 6) MONTHLY_CLOSINGS — Erweiterte Felder
-- ──────────────────────────────────────────────────────────────────

DO $mc_ext$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'monthly_closings' AND column_name = 'organization_id') THEN
        ALTER TABLE public.monthly_closings ADD COLUMN organization_id uuid;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'monthly_closings' AND column_name = 'total_invoiced') THEN
        ALTER TABLE public.monthly_closings ADD COLUMN total_invoiced numeric DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'monthly_closings' AND column_name = 'total_paid') THEN
        ALTER TABLE public.monthly_closings ADD COLUMN total_paid numeric DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'monthly_closings' AND column_name = 'total_open') THEN
        ALTER TABLE public.monthly_closings ADD COLUMN total_open numeric DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'monthly_closings' AND column_name = 'missing_signatures') THEN
        ALTER TABLE public.monthly_closings ADD COLUMN missing_signatures integer DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'monthly_closings' AND column_name = 'blocked_records') THEN
        ALTER TABLE public.monthly_closings ADD COLUMN blocked_records integer DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'monthly_closings' AND column_name = 'finalized_at') THEN
        ALTER TABLE public.monthly_closings ADD COLUMN finalized_at timestamptz;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'monthly_closings' AND column_name = 'finalized_by') THEN
        ALTER TABLE public.monthly_closings ADD COLUMN finalized_by uuid REFERENCES auth.users(id);
    END IF;
END
$mc_ext$;

-- ──────────────────────────────────────────────────────────────────
-- 7) RLS Policies
-- ──────────────────────────────────────────────────────────────────

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dunning_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_differences ENABLE ROW LEVEL SECURITY;

-- Helper: is_admin() already exists from prior migrations

-- payments
DO $rls_pay$
BEGIN
    DROP POLICY IF EXISTS "payments_admin_all" ON public.payments;
    CREATE POLICY "payments_admin_all" ON public.payments
        FOR ALL USING (
            EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
        );
END
$rls_pay$;

-- payment_allocations
DO $rls_alloc$
BEGIN
    DROP POLICY IF EXISTS "alloc_admin_all" ON public.payment_allocations;
    CREATE POLICY "alloc_admin_all" ON public.payment_allocations
        FOR ALL USING (
            EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
        );
END
$rls_alloc$;

-- dunning_entries
DO $rls_dun$
BEGIN
    DROP POLICY IF EXISTS "dunning_admin_all" ON public.dunning_entries;
    CREATE POLICY "dunning_admin_all" ON public.dunning_entries
        FOR ALL USING (
            EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
        );
END
$rls_dun$;

-- payment_differences
DO $rls_diff$
BEGIN
    DROP POLICY IF EXISTS "diff_admin_all" ON public.payment_differences;
    CREATE POLICY "diff_admin_all" ON public.payment_differences
        FOR ALL USING (
            EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
        );
END
$rls_diff$;

-- ──────────────────────────────────────────────────────────────────
-- 8) Trigger: updated_at auto-update
-- ──────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $fn_upd$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$fn_upd$;

DO $trg$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_payments_updated_at') THEN
        CREATE TRIGGER trg_payments_updated_at BEFORE UPDATE ON public.payments
            FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_dunning_updated_at') THEN
        CREATE TRIGGER trg_dunning_updated_at BEFORE UPDATE ON public.dunning_entries
            FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_diff_updated_at') THEN
        CREATE TRIGGER trg_diff_updated_at BEFORE UPDATE ON public.payment_differences
            FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
    END IF;
END
$trg$;

-- ──────────────────────────────────────────────────────────────────
-- 9) Audit-Trail entity_type erweitern
-- ──────────────────────────────────────────────────────────────────

DO $audit_ext$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'billing_audit_trail' AND column_name = 'entity_type'
    ) THEN
        ALTER TABLE public.billing_audit_trail
            DROP CONSTRAINT IF EXISTS billing_audit_trail_entity_type_check;
        ALTER TABLE public.billing_audit_trail
            ADD CONSTRAINT billing_audit_trail_entity_type_check
            CHECK (entity_type IN (
                'invoice', 'tariff', 'correction', 'snapshot', 'credit_note',
                'payment', 'payment_allocation', 'dunning', 'payment_difference',
                'monthly_closing'
            ));
    END IF;
END
$audit_ext$;

COMMIT;
