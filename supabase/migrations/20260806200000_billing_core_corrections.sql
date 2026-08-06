-- ============================================================================
-- Migration: Billing Core – Rechnungsfestschreibung & Korrekturprozess
-- PR #35 – 2026-08-06
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 2.1  billing_tariffs – Tarif- und Vertragsversionierung
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.billing_tariffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL DEFAULT current_org_id()
    REFERENCES public.organizations(id),

  -- Zuordnung
  kostentraeger_ik TEXT,
  leistungsart TEXT NOT NULL,
  rechtsgrundlage TEXT NOT NULL,
  bundesland TEXT,
  vertragsgebiet TEXT,
  vertrag_referenz TEXT,
  qualifikation TEXT,

  -- Verguetung
  verguetungsart TEXT NOT NULL
    CHECK (verguetungsart IN (
      'zeit_stunde','zeit_minute','leistungskomplex',
      'pauschale','wegepauschale','zuschlag'
    )),
  preis_cent INTEGER NOT NULL,
  einheit TEXT,

  -- Zuschlagsregeln
  zuschlag_wochenende_prozent NUMERIC(5,2) DEFAULT 0,
  zuschlag_feiertag_prozent   NUMERIC(5,2) DEFAULT 0,
  zuschlag_nacht_prozent      NUMERIC(5,2) DEFAULT 0,
  nacht_von TIME DEFAULT '20:00',
  nacht_bis TIME DEFAULT '06:00',
  kombinations_abschlag_prozent NUMERIC(5,2) DEFAULT 0,

  -- Gueltigkeit
  gueltig_ab DATE NOT NULL,
  gueltig_bis DATE,

  -- Audit
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  UUID REFERENCES auth.users(id),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ,

  CONSTRAINT valid_period   CHECK (gueltig_bis IS NULL OR gueltig_bis >= gueltig_ab),
  CONSTRAINT positive_price CHECK (preis_cent >= 0)
);

CREATE INDEX IF NOT EXISTS idx_billing_tariffs_lookup
  ON public.billing_tariffs (organization_id, leistungsart, rechtsgrundlage, gueltig_ab)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_billing_tariffs_org
  ON public.billing_tariffs (organization_id);

-- ────────────────────────────────────────────────────────────────────────────
-- 2.2  invoice_snapshots – Unveraenderliche Rechnungs-Snapshots
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.invoice_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL DEFAULT current_org_id()
    REFERENCES public.organizations(id),

  invoice_id UUID NOT NULL REFERENCES public.invoices(id),
  version    INTEGER NOT NULL DEFAULT 1,

  snapshot      JSONB NOT NULL,
  snapshot_type TEXT NOT NULL
    CHECK (snapshot_type IN ('festschreibung','storno','korrektur','gutschrift')),

  bezug_snapshot_id UUID REFERENCES public.invoice_snapshots(id),

  checksum TEXT NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),

  CONSTRAINT unique_invoice_version UNIQUE (invoice_id, version)
);

CREATE INDEX IF NOT EXISTS idx_invoice_snapshots_invoice
  ON public.invoice_snapshots (invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_snapshots_org
  ON public.invoice_snapshots (organization_id);

-- ────────────────────────────────────────────────────────────────────────────
-- 2.3  invoice_corrections – Korrekturen, Storno, Gutschriften
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.invoice_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL DEFAULT current_org_id()
    REFERENCES public.organizations(id),

  original_invoice_id   UUID NOT NULL REFERENCES public.invoices(id),
  correction_invoice_id UUID REFERENCES public.invoices(id),

  correction_type TEXT NOT NULL
    CHECK (correction_type IN ('storno','teilstorno','korrektur','gutschrift')),

  original_amount_cents  INTEGER NOT NULL,
  corrected_amount_cents INTEGER NOT NULL DEFAULT 0,
  difference_cents       INTEGER GENERATED ALWAYS AS (corrected_amount_cents - original_amount_cents) STORED,

  reason      TEXT NOT NULL,
  reason_code TEXT,

  status TEXT NOT NULL DEFAULT 'entwurf'
    CHECK (status IN ('entwurf','freigegeben','uebermittelt','verarbeitet')),

  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES auth.users(id),

  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_invoice_corrections_original
  ON public.invoice_corrections (original_invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_corrections_org
  ON public.invoice_corrections (organization_id);

-- ────────────────────────────────────────────────────────────────────────────
-- 2.4  invoice_line_snapshots – Positions-Snapshots mit eingefrorenen Preisen
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.invoice_line_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL DEFAULT current_org_id()
    REFERENCES public.organizations(id),

  invoice_snapshot_id UUID NOT NULL
    REFERENCES public.invoice_snapshots(id) ON DELETE CASCADE,

  position_nummer      INTEGER NOT NULL,
  service_record_id    UUID,
  service_record_item_id UUID,

  leistungsart   TEXT NOT NULL,
  leistungsdatum DATE NOT NULL,
  leistung_von   TIME,
  leistung_bis   TIME,
  menge          NUMERIC(10,2) NOT NULL DEFAULT 1,
  einheit        TEXT NOT NULL,

  tarif_id          UUID,
  einzelpreis_cent  INTEGER NOT NULL,
  zuschlag_prozent  NUMERIC(5,2) DEFAULT 0,
  zuschlag_grund    TEXT,
  gesamtpreis_cent  INTEGER NOT NULL,

  betreuer_name          TEXT,
  betreuer_qualifikation TEXT,

  verordnung_id    UUID,
  rechtsgrundlage  TEXT,
  budget_typ       TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoice_line_snapshots_snapshot
  ON public.invoice_line_snapshots (invoice_snapshot_id);
CREATE INDEX IF NOT EXISTS idx_invoice_line_snapshots_org
  ON public.invoice_line_snapshots (organization_id);

-- ────────────────────────────────────────────────────────────────────────────
-- 2.5  billing_number_sequences – Eindeutige Rechnungsnummern
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.billing_number_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  prefix      TEXT    NOT NULL DEFAULT 'RE',
  year        INTEGER NOT NULL,
  last_number INTEGER NOT NULL DEFAULT 0,

  CONSTRAINT unique_org_prefix_year UNIQUE (organization_id, prefix, year)
);

-- ────────────────────────────────────────────────────────────────────────────
-- 2.6  billing_audit_trail – Revisionssichere Aenderungshistorie
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.billing_audit_trail (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL DEFAULT current_org_id()
    REFERENCES public.organizations(id),

  entity_type    TEXT NOT NULL,
  entity_id      UUID NOT NULL,
  action         TEXT NOT NULL,

  previous_state JSONB,
  new_state      JSONB,
  reason         TEXT,

  actor_id   UUID NOT NULL REFERENCES auth.users(id),
  actor_role TEXT,
  actor_ip   TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  checksum TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_billing_audit_entity
  ON public.billing_audit_trail (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_billing_audit_org
  ON public.billing_audit_trail (organization_id);
CREATE INDEX IF NOT EXISTS idx_billing_audit_time
  ON public.billing_audit_trail (created_at);

-- ────────────────────────────────────────────────────────────────────────────
-- 2.7  Erweitere invoices-Tabelle
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS invoice_number_formatted TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS frozen_at TIMESTAMPTZ;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS correction_of UUID REFERENCES public.invoices(id);
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS correction_type TEXT
  CHECK (correction_type IN ('storno','teilstorno','korrektur','gutschrift'));
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS transmission_status TEXT DEFAULT 'nicht_uebermittelt'
  CHECK (transmission_status IN (
    'nicht_uebermittelt','in_uebermittlung','uebermittelt','quittiert','abgelehnt'
  ));
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_idempotency
  ON public.invoices (idempotency_key)
  WHERE idempotency_key IS NOT NULL AND deleted_at IS NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- 2.8  RLS-Policies
-- ────────────────────────────────────────────────────────────────────────────

-- === billing_tariffs ===
ALTER TABLE public.billing_tariffs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "billing_tariffs_org_fence" ON public.billing_tariffs
  AS RESTRICTIVE FOR ALL TO authenticated
  USING  (organization_id = current_org_id())
  WITH CHECK (organization_id = current_org_id());

CREATE POLICY "billing_tariffs_select" ON public.billing_tariffs
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "billing_tariffs_insert" ON public.billing_tariffs
  FOR INSERT TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "billing_tariffs_update" ON public.billing_tariffs
  FOR UPDATE TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- === invoice_snapshots ===
ALTER TABLE public.invoice_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoice_snapshots_org_fence" ON public.invoice_snapshots
  AS RESTRICTIVE FOR ALL TO authenticated
  USING  (organization_id = current_org_id())
  WITH CHECK (organization_id = current_org_id());

CREATE POLICY "invoice_snapshots_select" ON public.invoice_snapshots
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "invoice_snapshots_insert" ON public.invoice_snapshots
  FOR INSERT TO authenticated
  WITH CHECK (is_admin());

-- Kein UPDATE/DELETE auf Snapshots (unveraenderlich)

-- === invoice_corrections ===
ALTER TABLE public.invoice_corrections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoice_corrections_org_fence" ON public.invoice_corrections
  AS RESTRICTIVE FOR ALL TO authenticated
  USING  (organization_id = current_org_id())
  WITH CHECK (organization_id = current_org_id());

CREATE POLICY "invoice_corrections_select" ON public.invoice_corrections
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "invoice_corrections_insert" ON public.invoice_corrections
  FOR INSERT TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "invoice_corrections_update" ON public.invoice_corrections
  FOR UPDATE TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- === invoice_line_snapshots ===
ALTER TABLE public.invoice_line_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoice_line_snapshots_org_fence" ON public.invoice_line_snapshots
  AS RESTRICTIVE FOR ALL TO authenticated
  USING  (organization_id = current_org_id())
  WITH CHECK (organization_id = current_org_id());

CREATE POLICY "invoice_line_snapshots_select" ON public.invoice_line_snapshots
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "invoice_line_snapshots_insert" ON public.invoice_line_snapshots
  FOR INSERT TO authenticated
  WITH CHECK (is_admin());

-- Kein UPDATE/DELETE (unveraenderlich)

-- === billing_number_sequences ===
ALTER TABLE public.billing_number_sequences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "billing_number_sequences_org_fence" ON public.billing_number_sequences
  AS RESTRICTIVE FOR ALL TO authenticated
  USING  (organization_id = current_org_id())
  WITH CHECK (organization_id = current_org_id());

CREATE POLICY "billing_number_sequences_select" ON public.billing_number_sequences
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "billing_number_sequences_insert" ON public.billing_number_sequences
  FOR INSERT TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "billing_number_sequences_update" ON public.billing_number_sequences
  FOR UPDATE TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- === billing_audit_trail ===
ALTER TABLE public.billing_audit_trail ENABLE ROW LEVEL SECURITY;

CREATE POLICY "billing_audit_trail_org_fence" ON public.billing_audit_trail
  AS RESTRICTIVE FOR ALL TO authenticated
  USING  (organization_id = current_org_id())
  WITH CHECK (organization_id = current_org_id());

CREATE POLICY "billing_audit_trail_select" ON public.billing_audit_trail
  FOR SELECT TO authenticated
  USING (true);

-- INSERT fuer alle authentifizierten Nutzer (Audit schreiben)
CREATE POLICY "billing_audit_trail_insert" ON public.billing_audit_trail
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Kein UPDATE/DELETE auf Audit-Trail (Manipulationsschutz)

-- ────────────────────────────────────────────────────────────────────────────
-- 2.9  Statusmaschine-Funktion (Trigger)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.validate_invoice_status_transition()
RETURNS TRIGGER AS $$
BEGIN
  -- Erlaubte Uebergaenge (deutsche Statuswerte des neuen Abrechnungskerns)
  -- Alte Rechnungen mit status='draft' fallen durch ALLE IF-Bloecke
  -- und werden ohne Einschraenkung durchgelassen (Abwaertskompatibilitaet).

  IF OLD.status = 'entwurf' AND NEW.status NOT IN ('geprueft', 'storniert') THEN
    RAISE EXCEPTION 'Ungueltiger Statusuebergang: % -> %', OLD.status, NEW.status;
  END IF;

  IF OLD.status = 'geprueft' AND NEW.status NOT IN ('freigegeben', 'entwurf', 'storniert') THEN
    RAISE EXCEPTION 'Ungueltiger Statusuebergang: % -> %', OLD.status, NEW.status;
  END IF;

  IF OLD.status = 'freigegeben' AND NEW.status NOT IN ('uebermittelt', 'storniert') THEN
    RAISE EXCEPTION 'Ungueltiger Statusuebergang: % -> %', OLD.status, NEW.status;
  END IF;

  IF OLD.status = 'uebermittelt' AND NEW.status NOT IN ('quittiert', 'abgelehnt', 'storniert') THEN
    RAISE EXCEPTION 'Ungueltiger Statusuebergang: % -> %', OLD.status, NEW.status;
  END IF;

  IF OLD.status = 'quittiert' AND NEW.status NOT IN ('bezahlt', 'teilweise_bezahlt', 'gekuerzt', 'storniert') THEN
    RAISE EXCEPTION 'Ungueltiger Statusuebergang: % -> %', OLD.status, NEW.status;
  END IF;

  IF OLD.status = 'teilweise_bezahlt' AND NEW.status NOT IN ('bezahlt', 'storniert', 'korrektur_erforderlich') THEN
    RAISE EXCEPTION 'Ungueltiger Statusuebergang: % -> %', OLD.status, NEW.status;
  END IF;

  IF OLD.status = 'gekuerzt' AND NEW.status NOT IN ('korrektur_erforderlich', 'akzeptiert', 'storniert') THEN
    RAISE EXCEPTION 'Ungueltiger Statusuebergang: % -> %', OLD.status, NEW.status;
  END IF;

  IF OLD.status = 'abgelehnt' AND NEW.status NOT IN ('erneut_eingereicht', 'storniert') THEN
    RAISE EXCEPTION 'Ungueltiger Statusuebergang: % -> %', OLD.status, NEW.status;
  END IF;

  IF OLD.status = 'korrektur_erforderlich' AND NEW.status NOT IN ('entwurf', 'storniert') THEN
    RAISE EXCEPTION 'Ungueltiger Statusuebergang: % -> %', OLD.status, NEW.status;
  END IF;

  -- Endgueltige Status: kein Weg zurueck
  IF OLD.status IN ('bezahlt', 'storniert', 'akzeptiert') THEN
    RAISE EXCEPTION 'Rechnung im Status % kann nicht mehr geaendert werden', OLD.status;
  END IF;

  -- Festschreibungs-Schutz
  IF OLD.frozen_at IS NOT NULL AND (
    NEW.total_amount IS DISTINCT FROM OLD.total_amount OR
    NEW.client_id    IS DISTINCT FROM OLD.client_id OR
    NEW.period_start IS DISTINCT FROM OLD.period_start OR
    NEW.period_end   IS DISTINCT FROM OLD.period_end
  ) THEN
    RAISE EXCEPTION 'Festgeschriebene Rechnung darf inhaltlich nicht veraendert werden. Erstellen Sie eine Korrekturrechnung.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger nur auf Status-Aenderungen
DROP TRIGGER IF EXISTS trg_validate_invoice_status ON public.invoices;
CREATE TRIGGER trg_validate_invoice_status
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status
     OR OLD.total_amount IS DISTINCT FROM NEW.total_amount
     OR OLD.client_id IS DISTINCT FROM NEW.client_id
     OR OLD.period_start IS DISTINCT FROM NEW.period_start
     OR OLD.period_end IS DISTINCT FROM NEW.period_end)
  EXECUTE FUNCTION public.validate_invoice_status_transition();

-- ────────────────────────────────────────────────────────────────────────────
-- Hilfsfunktion: Naechste Rechnungsnummer (atomisch)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.next_billing_number(
  p_org_id UUID,
  p_prefix TEXT DEFAULT 'RE',
  p_year   INTEGER DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next INTEGER;
BEGIN
  INSERT INTO public.billing_number_sequences (organization_id, prefix, year, last_number)
  VALUES (p_org_id, p_prefix, p_year, 1)
  ON CONFLICT (organization_id, prefix, year)
  DO UPDATE SET last_number = billing_number_sequences.last_number + 1
  RETURNING last_number INTO v_next;

  RETURN p_prefix || '-' || p_year || '-' || LPAD(v_next::TEXT, 5, '0');
END;
$$;
