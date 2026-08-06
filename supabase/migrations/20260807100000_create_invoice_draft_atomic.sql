-- ════════════════════════════════════════════════════════════════════════════
-- Migration: Atomare Rechnungserstellung via transaktionale RPC
-- Datum: 2026-08-07
-- Branch: feature/unified-invoice-creation
--
-- Erstellt eine SECURITY DEFINER PostgreSQL-Funktion, die in einer
-- einzigen Transaktion folgende Schritte atomar ausfuehrt:
--   1. Idempotenz-Pruefung (idempotency_key)
--   2. Rechnungsnummer generieren (next_billing_number)
--   3. Rechnung erstellen (invoices)
--   4. Rechnungspositionen erstellen (invoice_items)
--   5. Audit-Trail schreiben (billing_audit_trail)
--   6. Service Records als 'invoiced' markieren
--
-- Bei einem Fehler in JEDEM dieser Schritte wird die gesamte
-- Transaktion zurueckgerollt. Keine halbfertigen Rechnungen.
--
-- ROLLBACK: DROP FUNCTION public.create_invoice_draft_atomic(...);
--           (siehe 20260807100001_rollback_create_invoice_draft_atomic.sql)
--
-- BESTEHENDE DATEN: Keine Aenderung. Nur neue Funktion.
-- RLS: Nicht betroffen. Funktion laeuft als SECURITY DEFINER.
-- BERECHTIGUNGEN: Nur service_role darf die Funktion aufrufen.
-- ════════════════════════════════════════════════════════════════════════════

-- Typ fuer das Ergebnis der Funktion
DO $$ BEGIN
  CREATE TYPE public.create_invoice_draft_result AS (
    invoice_id     UUID,
    invoice_number TEXT,
    total_amount   NUMERIC,
    line_count     INTEGER,
    already_exists BOOLEAN
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- Hauptfunktion: create_invoice_draft_atomic
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_invoice_draft_atomic(
  p_client_id      UUID,
  p_org_id         UUID,
  p_period_month   TEXT,        -- Format: YYYY-MM
  p_budget_type    TEXT,
  p_actor_id       UUID,
  p_insurance_name TEXT DEFAULT NULL,
  p_insurance_number TEXT DEFAULT NULL
)
RETURNS public.create_invoice_draft_result
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result       public.create_invoice_draft_result;
  v_idemp_key    TEXT;
  v_existing_id  UUID;
  v_period_start DATE;
  v_period_end   DATE;
  v_year         INTEGER;
  v_month        INTEGER;
  v_inv_number   TEXT;
  v_invoice_id   UUID;
  v_total        NUMERIC := 0;
  v_budget_total NUMERIC := 0;
  v_private_total NUMERIC := 0;
  v_line_count   INTEGER := 0;
  v_rec          RECORD;
  v_audit_payload JSONB;
  v_now          TIMESTAMPTZ := now();
BEGIN
  -- ═══ 0. Eingabe-Validierung ═══
  IF p_client_id IS NULL THEN
    RAISE EXCEPTION 'client_id darf nicht NULL sein';
  END IF;
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'org_id darf nicht NULL sein';
  END IF;
  IF p_period_month IS NULL OR p_period_month !~ '^\d{4}-\d{2}$' THEN
    RAISE EXCEPTION 'period_month muss im Format YYYY-MM sein, erhalten: %', p_period_month;
  END IF;
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'actor_id darf nicht NULL sein';
  END IF;

  -- Mandantentrennung: Client muss zur angegebenen Organisation gehoeren
  PERFORM 1 FROM public.clients
    WHERE id = p_client_id AND organization_id = p_org_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Klient % gehoert nicht zu Organisation % oder existiert nicht',
      p_client_id, p_org_id;
  END IF;

  -- Zeitraum berechnen
  v_year  := EXTRACT(YEAR  FROM (p_period_month || '-01')::DATE);
  v_month := EXTRACT(MONTH FROM (p_period_month || '-01')::DATE);
  v_period_start := (p_period_month || '-01')::DATE;
  v_period_end   := (v_period_start + INTERVAL '1 month' - INTERVAL '1 day')::DATE;

  -- ═══ 1. Idempotenz-Pruefung ═══
  v_idemp_key := 'inv_' || p_client_id || '_' || p_period_month
                 || '_' || p_budget_type || '_v1';

  SELECT id INTO v_existing_id
    FROM public.invoices
    WHERE idempotency_key = v_idemp_key
      AND deleted_at IS NULL;

  IF v_existing_id IS NOT NULL THEN
    -- Bestehende Rechnung zurueckgeben
    SELECT v_existing_id,
           COALESCE(invoice_number_formatted, invoice_number),
           total_amount,
           0,       -- line_count (nicht erneut zaehlen)
           TRUE     -- already_exists
      INTO v_result
      FROM public.invoices
      WHERE id = v_existing_id;
    RETURN v_result;
  END IF;

  -- ═══ 2. Service Records pruefen ═══
  -- Zaehle abrechenbare Records und pruefe auf Null-Preise
  SELECT COUNT(*), COALESCE(SUM(amount), 0)
    INTO v_line_count, v_total
    FROM public.service_records
    WHERE client_id = p_client_id
      AND budget_type = p_budget_type
      AND status IN ('signed', 'complete')
      AND date >= v_period_start
      AND date <= v_period_end;

  IF v_line_count = 0 THEN
    RAISE EXCEPTION 'Keine abrechenbaren Leistungen fuer Klient %, Zeitraum %, Budget %',
      p_client_id, p_period_month, p_budget_type;
  END IF;

  -- Null-Preis-Schutz: kein Record mit amount=0 oder NULL
  PERFORM 1 FROM public.service_records
    WHERE client_id = p_client_id
      AND budget_type = p_budget_type
      AND status IN ('signed', 'complete')
      AND date >= v_period_start
      AND date <= v_period_end
      AND (amount IS NULL OR amount = 0);

  IF FOUND THEN
    RAISE EXCEPTION 'Leistungsnachweis(e) ohne Betrag (amount=0/null) fuer Klient %, Zeitraum %, Budget %. Rechnung kann nicht erstellt werden.',
      p_client_id, p_period_month, p_budget_type;
  END IF;

  -- Budget/Privat-Aufteilung berechnen
  SELECT COALESCE(SUM(amount), 0)
    INTO v_budget_total
    FROM public.service_records
    WHERE client_id = p_client_id
      AND budget_type = p_budget_type
      AND status IN ('signed', 'complete')
      AND date >= v_period_start
      AND date <= v_period_end
      AND budget_type != 'private';

  SELECT COALESCE(SUM(amount), 0)
    INTO v_private_total
    FROM public.service_records
    WHERE client_id = p_client_id
      AND budget_type = p_budget_type
      AND status IN ('signed', 'complete')
      AND date >= v_period_start
      AND date <= v_period_end
      AND budget_type = 'private';

  -- ═══ 3. Rechnungsnummer generieren (atomar, innerhalb der Transaktion) ═══
  v_inv_number := public.next_billing_number(p_org_id, 'RE', v_year);

  -- ═══ 4. Rechnung erstellen ═══
  INSERT INTO public.invoices (
    invoice_number,
    invoice_number_formatted,
    client_id,
    insurance_name,
    insurance_number,
    period_start,
    period_end,
    total_amount,
    budget_amount,
    private_amount,
    status,
    version,
    idempotency_key,
    organization_id,
    created_at,
    updated_at
  ) VALUES (
    v_inv_number,
    v_inv_number,
    p_client_id,
    p_insurance_name,
    p_insurance_number,
    v_period_start,
    v_period_end,
    v_total,
    v_budget_total,
    v_private_total,
    'entwurf',
    1,
    v_idemp_key,
    p_org_id,
    v_now,
    v_now
  )
  RETURNING id INTO v_invoice_id;

  -- ═══ 5. Rechnungspositionen erstellen ═══
  INSERT INTO public.invoice_items (
    invoice_id,
    service_record_id,
    description,
    date,
    duration_minutes,
    amount,
    budget_type,
    organization_id,
    created_at
  )
  SELECT
    v_invoice_id,
    sr.id,
    sr.service_type || ' am ' || sr.date,
    sr.date,
    sr.duration_minutes,
    sr.amount,
    sr.budget_type,
    p_org_id,
    v_now
  FROM public.service_records sr
  WHERE sr.client_id = p_client_id
    AND sr.budget_type = p_budget_type
    AND sr.status IN ('signed', 'complete')
    AND sr.date >= v_period_start
    AND sr.date <= v_period_end;

  -- ═══ 6. Service Records auf 'invoiced' setzen ═══
  UPDATE public.service_records
    SET status = 'invoiced',
        updated_at = v_now
    WHERE client_id = p_client_id
      AND budget_type = p_budget_type
      AND status IN ('signed', 'complete')
      AND date >= v_period_start
      AND date <= v_period_end;

  -- ═══ 7. Audit-Trail (verpflichtend, Teil der Transaktion) ═══
  v_audit_payload := jsonb_build_object(
    'invoice_number', v_inv_number,
    'client_id',      p_client_id,
    'period',         p_period_month,
    'budget_type',    p_budget_type,
    'total_amount',   v_total,
    'line_count',     v_line_count,
    'price_source',   'service_records'
  );

  INSERT INTO public.billing_audit_trail (
    organization_id,
    entity_type,
    entity_id,
    action,
    previous_state,
    new_state,
    actor_id,
    created_at,
    checksum
  ) VALUES (
    p_org_id,
    'invoice',
    v_invoice_id,
    'created',
    NULL,
    v_audit_payload,
    p_actor_id,
    v_now,
    -- SHA-256 Checksumme innerhalb PL/pgSQL
    encode(
      digest(
        'invoice' || v_invoice_id::TEXT || 'created' || v_audit_payload::TEXT
          || p_actor_id::TEXT || v_now::TEXT,
        'sha256'
      ),
      'hex'
    )
  );

  -- ═══ Ergebnis ═══
  v_result.invoice_id     := v_invoice_id;
  v_result.invoice_number := v_inv_number;
  v_result.total_amount   := v_total;
  v_result.line_count     := v_line_count;
  v_result.already_exists := FALSE;

  RETURN v_result;
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- Berechtigungen: Nur service_role (= adminClient) darf aufrufen
-- ────────────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.create_invoice_draft_atomic(UUID, UUID, TEXT, TEXT, UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;

-- pgcrypto fuer digest() / SHA-256
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ────────────────────────────────────────────────────────────────────────────
-- Idempotent-Check: Funktion kann gefahrlos erneut angewendet werden
-- ────────────────────────────────────────────────────────────────────────────
COMMENT ON FUNCTION public.create_invoice_draft_atomic IS
  'Atomare Rechnungserstellung: Invoice + Items + Audit + Idempotenz + Nummernvergabe in einer Transaktion. SECURITY DEFINER, nur service_role.';
