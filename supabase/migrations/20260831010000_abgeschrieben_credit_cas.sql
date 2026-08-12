-- ============================================================================
-- D1+D3+D6: Abgeschrieben-Status + atomare Gutschrift/Korrektur-RPCs
-- 2026-08-12  (Betriebsabnahme Kategorie D)
-- ============================================================================

-- ──────────────────────────────────────────────────────────────────────────────
-- D6: 'abgeschrieben' in invoices_status_check
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_status_check CHECK (
  status IN (
    'draft', 'sent', 'paid', 'partial', 'rejected', 'disputed',
    'entwurf', 'geprueft', 'freigegeben', 'uebermittelt',
    'quittiert', 'abgelehnt', 'bezahlt', 'teilweise_bezahlt',
    'gekuerzt', 'korrektur_erforderlich', 'erneut_eingereicht',
    'akzeptiert', 'storniert', 'strittig',
    'abgeschrieben'
  )
);

-- ──────────────────────────────────────────────────────────────────────────────
-- D6: Trigger um 'abgeschrieben' erweitern
-- ──────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.validate_invoice_status_transition()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.frozen_at IS NOT NULL AND (
    NEW.total_amount IS DISTINCT FROM OLD.total_amount OR
    NEW.client_id IS DISTINCT FROM OLD.client_id OR
    NEW.period_start IS DISTINCT FROM OLD.period_start OR
    NEW.period_end IS DISTINCT FROM OLD.period_end
  ) THEN
    RAISE EXCEPTION 'Festgeschriebene Rechnung darf inhaltlich nicht veraendert werden. Erstellen Sie eine Korrekturrechnung.';
  END IF;

  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  IF OLD.status IN ('bezahlt', 'storniert', 'akzeptiert', 'abgeschrieben') THEN
    RAISE EXCEPTION 'Rechnung im Status % kann nicht mehr geaendert werden', OLD.status;
  END IF;

  IF OLD.status = 'entwurf' AND NEW.status NOT IN ('geprueft', 'storniert') THEN
    RAISE EXCEPTION 'Ungueltiger Statusuebergang: % -> %', OLD.status, NEW.status;
  END IF;
  IF OLD.status = 'geprueft' AND NEW.status NOT IN ('freigegeben', 'entwurf', 'storniert') THEN
    RAISE EXCEPTION 'Ungueltiger Statusuebergang: % -> %', OLD.status, NEW.status;
  END IF;
  IF OLD.status = 'freigegeben' AND NEW.status NOT IN ('uebermittelt', 'storniert', 'abgeschrieben') THEN
    RAISE EXCEPTION 'Ungueltiger Statusuebergang: % -> %', OLD.status, NEW.status;
  END IF;
  IF OLD.status = 'uebermittelt' AND NEW.status NOT IN ('quittiert', 'abgelehnt', 'storniert', 'abgeschrieben') THEN
    RAISE EXCEPTION 'Ungueltiger Statusuebergang: % -> %', OLD.status, NEW.status;
  END IF;
  IF OLD.status = 'quittiert' AND NEW.status NOT IN ('bezahlt', 'teilweise_bezahlt', 'gekuerzt', 'strittig', 'storniert', 'abgeschrieben') THEN
    RAISE EXCEPTION 'Ungueltiger Statusuebergang: % -> %', OLD.status, NEW.status;
  END IF;
  IF OLD.status = 'teilweise_bezahlt' AND NEW.status NOT IN ('bezahlt', 'storniert', 'korrektur_erforderlich', 'strittig', 'abgeschrieben') THEN
    RAISE EXCEPTION 'Ungueltiger Statusuebergang: % -> %', OLD.status, NEW.status;
  END IF;
  IF OLD.status = 'gekuerzt' AND NEW.status NOT IN ('korrektur_erforderlich', 'akzeptiert', 'storniert', 'strittig', 'abgeschrieben') THEN
    RAISE EXCEPTION 'Ungueltiger Statusuebergang: % -> %', OLD.status, NEW.status;
  END IF;
  IF OLD.status = 'abgelehnt' AND NEW.status NOT IN ('erneut_eingereicht', 'storniert', 'abgeschrieben') THEN
    RAISE EXCEPTION 'Ungueltiger Statusuebergang: % -> %', OLD.status, NEW.status;
  END IF;
  IF OLD.status = 'korrektur_erforderlich' AND NEW.status NOT IN ('entwurf', 'storniert', 'abgeschrieben') THEN
    RAISE EXCEPTION 'Ungueltiger Statusuebergang: % -> %', OLD.status, NEW.status;
  END IF;
  IF OLD.status = 'strittig' AND NEW.status NOT IN ('gekuerzt', 'korrektur_erforderlich', 'abgelehnt', 'akzeptiert', 'bezahlt', 'storniert', 'abgeschrieben') THEN
    RAISE EXCEPTION 'Ungueltiger Statusuebergang: % -> %', OLD.status, NEW.status;
  END IF;
  IF OLD.status = 'erneut_eingereicht' AND NEW.status NOT IN ('uebermittelt', 'storniert', 'abgeschrieben') THEN
    RAISE EXCEPTION 'Ungueltiger Statusuebergang: % -> %', OLD.status, NEW.status;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ──────────────────────────────────────────────────────────────────────────────
-- D3: Atomare Gutschrift-RPC (verhindert Race Condition bei parallelen Gutschriften)
-- ──────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_credit_note_atomic(
  p_invoice_id      UUID,
  p_amount_cents    INTEGER,
  p_reason          TEXT,
  p_actor_id        UUID,
  p_org_id          UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_original         RECORD;
  v_original_cents   INTEGER;
  v_already_credited INTEGER;
  v_remaining        INTEGER;
BEGIN
  -- Sperre die Originalrechnung (verhindert parallele Gutschriften)
  SELECT * INTO v_original
  FROM invoices
  WHERE id = p_invoice_id
    AND organization_id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rechnung nicht gefunden oder falsche Organisation.';
  END IF;

  IF v_original.status IN ('storniert', 'abgeschrieben') THEN
    RAISE EXCEPTION 'Rechnung im Status % — Gutschrift nicht moeglich.', v_original.status;
  END IF;

  v_original_cents := ROUND(v_original.total_amount * 100)::INTEGER;

  -- Berechne bereits gutgeschriebene Cents (mit FOR UPDATE auf corrections)
  SELECT COALESCE(SUM(v_original_cents - COALESCE(corrected_amount_cents, v_original_cents)), 0)
  INTO v_already_credited
  FROM invoice_corrections
  WHERE original_invoice_id = p_invoice_id
    AND correction_type = 'gutschrift'
    AND deleted_at IS NULL
  FOR UPDATE;

  v_remaining := v_original_cents - v_already_credited;

  IF p_amount_cents > v_remaining THEN
    RAISE EXCEPTION 'Gutschriftbetrag (% Cent) uebersteigt verfuegbaren Betrag (% Cent).', p_amount_cents, v_remaining;
  END IF;

  -- Ergebnis: die geprüften Werte zurückgeben (Insert erfolgt im App-Layer)
  RETURN jsonb_build_object(
    'original_amount_cents', v_original_cents,
    'already_credited_cents', v_already_credited,
    'remaining_cents', v_remaining,
    'validated', TRUE
  );
END;
$$;

-- Nur service_role darf die RPC ausfuehren
REVOKE ALL ON FUNCTION public.create_credit_note_atomic(UUID, INTEGER, TEXT, UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_credit_note_atomic(UUID, INTEGER, TEXT, UUID, UUID) FROM anon;
REVOKE ALL ON FUNCTION public.create_credit_note_atomic(UUID, INTEGER, TEXT, UUID, UUID) FROM authenticated;

-- ──────────────────────────────────────────────────────────────────────────────
-- D3: Atomare Korrektur-Validierung (verhindert Race mit Storno/Abschreibung)
-- ──────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.validate_correction_atomic(
  p_invoice_id      UUID,
  p_org_id          UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_original RECORD;
BEGIN
  SELECT * INTO v_original
  FROM invoices
  WHERE id = p_invoice_id
    AND organization_id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rechnung nicht gefunden oder falsche Organisation.';
  END IF;

  IF v_original.status IN ('storniert', 'abgeschrieben') THEN
    RAISE EXCEPTION 'Rechnung im Status % — Korrektur nicht moeglich.', v_original.status;
  END IF;

  RETURN jsonb_build_object(
    'status', v_original.status,
    'total_amount', v_original.total_amount,
    'validated', TRUE
  );
END;
$$;

REVOKE ALL ON FUNCTION public.validate_correction_atomic(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_correction_atomic(UUID, UUID) FROM anon;
REVOKE ALL ON FUNCTION public.validate_correction_atomic(UUID, UUID) FROM authenticated;
