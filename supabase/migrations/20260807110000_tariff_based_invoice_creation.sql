-- ════════════════════════════════════════════════════════════════════════════
-- Migration: Tarif-basierte Rechnungserstellung
-- Datum: 2026-08-07
-- Branch: feature/unified-invoice-creation
--
-- FACHLICHE ENTSCHEIDUNG (Yusuf, 2026-08-07):
-- billing_tariffs ist die fuehrende und verbindliche Preisquelle.
-- service_records.amount darf NICHT als Fallback verwendet werden.
-- Kein Tarif = keine Rechnung (MISSING_VALID_TARIFF).
-- Mehrere gleich-spezifische Tarife = keine Rechnung (AMBIGUOUS_TARIFF).
--
-- Aenderungen:
-- 1. invoice_items: Neue Spalten fuer Tarif-Tracking
-- 2. create_invoice_draft_atomic: Neugeschrieben mit Tarif-Aufloesung
--
-- BESTEHENDE DATEN: Nicht veraendert. Neue Spalten sind NULLable.
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- 1. invoice_items: Tarif-Tracking-Spalten hinzufuegen
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.invoice_items
  ADD COLUMN IF NOT EXISTS tariff_id UUID REFERENCES public.billing_tariffs(id);

ALTER TABLE public.invoice_items
  ADD COLUMN IF NOT EXISTS price_source TEXT DEFAULT 'service_records';

ALTER TABLE public.invoice_items
  ADD COLUMN IF NOT EXISTS tariff_gueltig_ab DATE;

ALTER TABLE public.invoice_items
  ADD COLUMN IF NOT EXISTS tariff_gueltig_bis DATE;

ALTER TABLE public.invoice_items
  ADD COLUMN IF NOT EXISTS tariff_preis_cent INTEGER;

ALTER TABLE public.invoice_items
  ADD COLUMN IF NOT EXISTS tariff_einheit TEXT;

ALTER TABLE public.invoice_items
  ADD COLUMN IF NOT EXISTS tariff_verguetungsart TEXT;

ALTER TABLE public.invoice_items
  ADD COLUMN IF NOT EXISTS abweichung_cent INTEGER DEFAULT 0;

ALTER TABLE public.invoice_items
  ADD COLUMN IF NOT EXISTS abweichung_grund TEXT;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Alte Funktion entfernen und neu erstellen
-- ────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.create_invoice_draft_atomic(UUID, UUID, TEXT, TEXT, UUID, TEXT, TEXT);

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Neue Funktion: Tarif-basierte atomare Rechnungserstellung
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_invoice_draft_atomic(
  p_client_id        UUID,
  p_org_id           UUID,
  p_period_month     TEXT,        -- Format: YYYY-MM
  p_budget_type      TEXT,
  p_actor_id         UUID,
  p_insurance_name   TEXT DEFAULT NULL,
  p_insurance_number TEXT DEFAULT NULL
)
RETURNS public.create_invoice_draft_result
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result           public.create_invoice_draft_result;
  v_idemp_key        TEXT;
  v_existing_id      UUID;
  v_period_start     DATE;
  v_period_end       DATE;
  v_year             INTEGER;
  v_month            INTEGER;
  v_inv_number       TEXT;
  v_invoice_id       UUID;
  v_total            NUMERIC := 0;
  v_budget_total     NUMERIC := 0;
  v_private_total    NUMERIC := 0;
  v_line_count       INTEGER := 0;
  v_rec              RECORD;
  v_tariff           RECORD;
  v_tariff_count     INTEGER;
  v_best_score       INTEGER;
  v_second_score     INTEGER;
  v_rechtsgrundlage  TEXT;
  v_client_ik        TEXT;
  v_item_amount      NUMERIC;
  v_audit_payload    JSONB;
  v_now              TIMESTAMPTZ := now();
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
  SELECT pflegekasse_ik INTO v_client_ik
    FROM public.clients
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

  -- Rechtsgrundlage aus budget_type ableiten
  v_rechtsgrundlage := CASE p_budget_type
    WHEN 'entlastung'          THEN '§45b SGB XI'
    WHEN 'verhinderung'        THEN '§39 SGB XI'
    WHEN 'carryover'           THEN '§45b SGB XI'
    WHEN 'haeusliche_pflege_36' THEN '§36 SGB XI'
    WHEN 'private'             THEN NULL
    ELSE NULL
  END;

  -- ═══ 1. Idempotenz-Pruefung ═══
  v_idemp_key := 'inv_' || p_client_id || '_' || p_period_month
                 || '_' || p_budget_type || '_v2';

  SELECT id INTO v_existing_id
    FROM public.invoices
    WHERE idempotency_key = v_idemp_key
      AND deleted_at IS NULL;

  IF v_existing_id IS NOT NULL THEN
    SELECT v_existing_id,
           COALESCE(invoice_number_formatted, invoice_number),
           total_amount,
           0,
           TRUE
      INTO v_result
      FROM public.invoices
      WHERE id = v_existing_id;
    RETURN v_result;
  END IF;

  -- ═══ 2. Service Records pruefen ═══
  SELECT COUNT(*)
    INTO v_line_count
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

  -- ═══ 3. Tarif-Aufloesung und Preisberechnung pro Service Record ═══
  -- Fuer jede Leistung wird der spezifischste gueltige Tarif ermittelt.
  -- Kein Tarif oder Mehrdeutigkeit = Abbruch (vollstaendiger Rollback).

  -- Rechnungsnummer VOR der Schleife generieren (wird bei Fehler zurueckgerollt)
  v_inv_number := public.next_billing_number(p_org_id, 'RE', v_year);

  -- Rechnung erstellen (noch mit total_amount=0, wird am Ende aktualisiert)
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
    0,  -- wird nach Schleife aktualisiert
    0,
    0,
    'entwurf',
    1,
    v_idemp_key,
    p_org_id,
    v_now,
    v_now
  )
  RETURNING id INTO v_invoice_id;

  -- Pro Service Record: Tarif aufloesen und Position erstellen
  FOR v_rec IN
    SELECT sr.id, sr.service_type, sr.date, sr.duration_minutes,
           sr.budget_type, sr.amount AS original_amount,
           sr.start_time, sr.end_time
    FROM public.service_records sr
    WHERE sr.client_id = p_client_id
      AND sr.budget_type = p_budget_type
      AND sr.status IN ('signed', 'complete')
      AND sr.date >= v_period_start
      AND sr.date <= v_period_end
    ORDER BY sr.date, sr.start_time
  LOOP
    -- ── Tarif-Aufloesung mit Spezifitaets-Scoring ──
    -- Berechne Score: Kostentraeger +10, Bundesland +5, Qualifikation +3, Vertrag +2
    -- Negative Scores = nicht passender spezifischer Tarif → ausfiltern
    SELECT INTO v_tariff
      bt.id,
      bt.preis_cent,
      bt.einheit,
      bt.verguetungsart,
      bt.gueltig_ab,
      bt.gueltig_bis,
      bt.zuschlag_wochenende_prozent,
      bt.zuschlag_feiertag_prozent,
      bt.zuschlag_nacht_prozent,
      (
        CASE
          WHEN bt.kostentraeger_ik IS NOT NULL AND bt.kostentraeger_ik = v_client_ik THEN 10
          WHEN bt.kostentraeger_ik IS NOT NULL THEN -100
          ELSE 0
        END +
        CASE
          WHEN bt.bundesland IS NOT NULL AND LOWER(bt.bundesland) = 'hessen' THEN 5
          WHEN bt.bundesland IS NOT NULL THEN -100
          ELSE 0
        END +
        CASE
          WHEN bt.qualifikation IS NOT NULL THEN -100
          ELSE 0
        END +
        CASE
          WHEN bt.vertrag_referenz IS NOT NULL THEN -100
          ELSE 0
        END
      ) AS specificity_score
    FROM public.billing_tariffs bt
    WHERE bt.organization_id = p_org_id
      AND LOWER(bt.leistungsart) = LOWER(v_rec.service_type)
      AND (
        (v_rechtsgrundlage IS NOT NULL AND bt.rechtsgrundlage = v_rechtsgrundlage)
        OR
        (v_rechtsgrundlage IS NULL AND p_budget_type = 'private')
      )
      AND bt.gueltig_ab <= v_rec.date
      AND (bt.gueltig_bis IS NULL OR bt.gueltig_bis >= v_rec.date)
      AND bt.deleted_at IS NULL
      AND (
        CASE
          WHEN bt.kostentraeger_ik IS NOT NULL AND bt.kostentraeger_ik = v_client_ik THEN 10
          WHEN bt.kostentraeger_ik IS NOT NULL THEN -100
          ELSE 0
        END +
        CASE
          WHEN bt.bundesland IS NOT NULL AND LOWER(bt.bundesland) = 'hessen' THEN 5
          WHEN bt.bundesland IS NOT NULL THEN -100
          ELSE 0
        END +
        CASE
          WHEN bt.qualifikation IS NOT NULL THEN -100
          ELSE 0
        END +
        CASE
          WHEN bt.vertrag_referenz IS NOT NULL THEN -100
          ELSE 0
        END
      ) >= 0
    ORDER BY specificity_score DESC, bt.gueltig_ab DESC
    LIMIT 1;

    IF NOT FOUND THEN
      -- MISSING_VALID_TARIFF: Kein gueltiger Tarif
      -- Audit-Eintrag ueber den fehlgeschlagenen Versuch
      INSERT INTO public.billing_audit_trail (
        organization_id, entity_type, entity_id, action,
        new_state, actor_id, created_at
      ) VALUES (
        p_org_id, 'tariff_lookup', p_client_id, 'missing_tariff',
        jsonb_build_object(
          'error_code', 'MISSING_VALID_TARIFF',
          'service_record_id', v_rec.id,
          'service_type', v_rec.service_type,
          'budget_type', p_budget_type,
          'rechtsgrundlage', v_rechtsgrundlage,
          'date', v_rec.date,
          'period_month', p_period_month,
          'client_id', p_client_id,
          'kostentraeger_ik', v_client_ik
        ),
        p_actor_id, v_now
      );

      RAISE EXCEPTION 'MISSING_VALID_TARIFF: Kein gueltiger Tarif fuer Leistungsart "%" (%), Rechtsgrundlage "%", Datum %, Kostentraeger "%". Rechnung kann nicht erstellt werden.',
        v_rec.service_type, LOWER(v_rec.service_type), COALESCE(v_rechtsgrundlage, 'keine (privat)'), v_rec.date, COALESCE(v_client_ik, 'kein IK');
    END IF;

    -- ── Mehrdeutigkeits-Pruefung ──
    -- Gibt es einen zweiten Tarif mit gleichem Score?
    SELECT COUNT(*) INTO v_tariff_count
    FROM public.billing_tariffs bt
    WHERE bt.organization_id = p_org_id
      AND LOWER(bt.leistungsart) = LOWER(v_rec.service_type)
      AND (
        (v_rechtsgrundlage IS NOT NULL AND bt.rechtsgrundlage = v_rechtsgrundlage)
        OR
        (v_rechtsgrundlage IS NULL AND p_budget_type = 'private')
      )
      AND bt.gueltig_ab <= v_rec.date
      AND (bt.gueltig_bis IS NULL OR bt.gueltig_bis >= v_rec.date)
      AND bt.deleted_at IS NULL
      AND (
        CASE
          WHEN bt.kostentraeger_ik IS NOT NULL AND bt.kostentraeger_ik = v_client_ik THEN 10
          WHEN bt.kostentraeger_ik IS NOT NULL THEN -100
          ELSE 0
        END +
        CASE
          WHEN bt.bundesland IS NOT NULL AND LOWER(bt.bundesland) = 'hessen' THEN 5
          WHEN bt.bundesland IS NOT NULL THEN -100
          ELSE 0
        END +
        CASE
          WHEN bt.qualifikation IS NOT NULL THEN -100
          ELSE 0
        END +
        CASE
          WHEN bt.vertrag_referenz IS NOT NULL THEN -100
          ELSE 0
        END
      ) = v_tariff.specificity_score;

    IF v_tariff_count > 1 THEN
      -- AMBIGUOUS_TARIFF: Mehrere gleichwertige Tarife
      INSERT INTO public.billing_audit_trail (
        organization_id, entity_type, entity_id, action,
        new_state, actor_id, created_at
      ) VALUES (
        p_org_id, 'tariff_lookup', p_client_id, 'ambiguous_tariff',
        jsonb_build_object(
          'error_code', 'AMBIGUOUS_TARIFF',
          'service_record_id', v_rec.id,
          'service_type', v_rec.service_type,
          'matching_tariff_count', v_tariff_count,
          'specificity_score', v_tariff.specificity_score,
          'date', v_rec.date,
          'period_month', p_period_month
        ),
        p_actor_id, v_now
      );

      RAISE EXCEPTION 'AMBIGUOUS_TARIFF: % gleichwertige Tarife gefunden fuer Leistungsart "%", Datum %. Eindeutiger Tarif erforderlich.',
        v_tariff_count, v_rec.service_type, v_rec.date;
    END IF;

    -- ── Preis berechnen (abhaengig von verguetungsart) ──
    v_item_amount := CASE v_tariff.verguetungsart
      WHEN 'zeit_stunde' THEN
        ROUND((v_tariff.preis_cent::NUMERIC / 100.0) * (COALESCE(v_rec.duration_minutes, 60)::NUMERIC / 60.0), 2)
      WHEN 'zeit_minute' THEN
        ROUND((v_tariff.preis_cent::NUMERIC / 100.0) * COALESCE(v_rec.duration_minutes, 60)::NUMERIC, 2)
      WHEN 'leistungskomplex' THEN
        ROUND(v_tariff.preis_cent::NUMERIC / 100.0, 2)
      WHEN 'pauschale' THEN
        ROUND(v_tariff.preis_cent::NUMERIC / 100.0, 2)
      WHEN 'wegepauschale' THEN
        ROUND(v_tariff.preis_cent::NUMERIC / 100.0, 2)
      ELSE
        ROUND(v_tariff.preis_cent::NUMERIC / 100.0, 2)
    END;

    -- TODO: Zuschlagsberechnung (Wochenende/Feiertag/Nacht) hier erweitern

    -- ── Rechnungsposition erstellen mit Tarif-Metadaten ──
    INSERT INTO public.invoice_items (
      invoice_id,
      service_record_id,
      description,
      date,
      duration_minutes,
      amount,
      budget_type,
      organization_id,
      created_at,
      -- Tarif-Tracking (neu)
      tariff_id,
      price_source,
      tariff_gueltig_ab,
      tariff_gueltig_bis,
      tariff_preis_cent,
      tariff_einheit,
      tariff_verguetungsart,
      abweichung_cent,
      abweichung_grund
    ) VALUES (
      v_invoice_id,
      v_rec.id,
      v_rec.service_type || ' am ' || v_rec.date,
      v_rec.date,
      v_rec.duration_minutes,
      v_item_amount,
      v_rec.budget_type,
      p_org_id,
      v_now,
      -- Tarif-Tracking
      v_tariff.id,
      'billing_tariffs',
      v_tariff.gueltig_ab,
      v_tariff.gueltig_bis,
      v_tariff.preis_cent,
      v_tariff.einheit,
      v_tariff.verguetungsart,
      CASE
        WHEN v_rec.original_amount IS NOT NULL
        THEN ROUND((v_item_amount - v_rec.original_amount) * 100)::INTEGER
        ELSE 0
      END,
      CASE
        WHEN v_rec.original_amount IS NOT NULL AND
             ABS(v_item_amount - v_rec.original_amount) > 0.01
        THEN 'Tarif-Preis weicht von service_records.amount ab (Tarif: ' ||
             v_item_amount || ' EUR, App: ' || v_rec.original_amount || ' EUR)'
        ELSE NULL
      END
    );

    -- Totals akkumulieren
    v_total := v_total + v_item_amount;
    IF v_rec.budget_type = 'private' THEN
      v_private_total := v_private_total + v_item_amount;
    ELSE
      v_budget_total := v_budget_total + v_item_amount;
    END IF;

  END LOOP;

  -- ═══ 4. Rechnung mit korrekten Totals aktualisieren ═══
  UPDATE public.invoices
    SET total_amount = v_total,
        budget_amount = v_budget_total,
        private_amount = v_private_total
    WHERE id = v_invoice_id;

  -- ═══ 5. Service Records auf 'invoiced' setzen ═══
  UPDATE public.service_records
    SET status = 'invoiced',
        updated_at = v_now
    WHERE client_id = p_client_id
      AND budget_type = p_budget_type
      AND status IN ('signed', 'complete')
      AND date >= v_period_start
      AND date <= v_period_end;

  -- ═══ 6. Audit-Trail (verpflichtend, Teil der Transaktion) ═══
  v_audit_payload := jsonb_build_object(
    'invoice_number', v_inv_number,
    'client_id',      p_client_id,
    'period',         p_period_month,
    'budget_type',    p_budget_type,
    'total_amount',   v_total,
    'line_count',     v_line_count,
    'price_source',   'billing_tariffs',
    'rechtsgrundlage', v_rechtsgrundlage
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

-- pgcrypto fuer digest() / SHA-256 (idempotent)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

COMMENT ON FUNCTION public.create_invoice_draft_atomic IS
  'Tarif-basierte atomare Rechnungserstellung v2: Preis aus billing_tariffs (fuehrend), kein Fallback auf service_records.amount. MISSING_VALID_TARIFF/AMBIGUOUS_TARIFF bei fehlenden/mehrdeutigen Tarifen. SECURITY DEFINER, nur service_role.';

-- ────────────────────────────────────────────────────────────────────────────
-- 4. Overlap-Constraint: Verhindert konkurrierende aktive Tarife
--    fuer dieselbe Org + Leistungsart + Rechtsgrundlage + Kostentraeger
--    mit ueberlappenden Gueltigkeitszeitraeumen.
-- ────────────────────────────────────────────────────────────────────────────

-- Exclusion Constraint benoetigt btree_gist Extension
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Hilfsfunktion: erzeugt ein daterange aus gueltig_ab/gueltig_bis
-- (gueltig_bis NULL = unbegrenzter Tarif → '9999-12-31')
CREATE OR REPLACE FUNCTION public.tariff_validity_range(
  p_ab DATE, p_bis DATE
) RETURNS daterange
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $fn$
  SELECT daterange(p_ab, COALESCE(p_bis, '9999-12-31'::DATE), '[]');
$fn$;

-- Exclusion Constraint: keine ueberlappenden Tarife fuer gleiche Kombination
-- Verwendet COALESCE fuer kostentraeger_ik (NULL = 'allgemein')
ALTER TABLE public.billing_tariffs
  ADD CONSTRAINT no_overlapping_tariffs
  EXCLUDE USING gist (
    organization_id WITH =,
    leistungsart    WITH =,
    rechtsgrundlage WITH =,
    COALESCE(kostentraeger_ik, '__ALL__') WITH =,
    tariff_validity_range(gueltig_ab, gueltig_bis) WITH &&
  )
  WHERE (deleted_at IS NULL);
