-- ════════════════════════════════════════════════════════════════════════════
-- Migration: Fail-Closed fuer tarif_status auf dem PRODUKTIVEN Rechnungsweg
-- Datum:     2026-08-31
--
-- BEFUND (zwei unabhaengige Agent-Audits bestaetigt am 2026-08-13)
--   Die Fail-Closed-Pruefung in lib/billing/core/price-resolver.ts wirkt nur,
--   wenn resolvePrice() tatsaechlich aufgerufen wird. Die echte Rechnungs-
--   erstellung laeuft aber ueber die SECURITY-DEFINER-RPC
--   create_invoice_draft_atomic() (zuletzt ersetzt in 20260808120002), die
--   ihre eigene Tarif-SQL-Abfrage faehrt und tarif_status NIE geprueft hat.
--   Ein 'blocked' oder 'unverified' Kassentarif konnte so trotzdem abgerechnet
--   werden — die Anwendungsschicht-Pruefung war umgehbar.
--
--   Dieselbe Luecke hat zaehle_kassentarife() (20260808120000): sie zaehlt
--   jeden aktiven Tarif als "gueltig", auch 'blocked'/'unverified' — die
--   Ein-Klick-Freischaltung (activate_insurance_billing) haette also auch
--   mit ausschliesslich gesperrten Tarifen durchlaufen koennen.
--
-- FIX
--   create_invoice_draft_atomic(): Kassentarife (rechtsgrundlage <> 'privat')
--   nur noch mit tarif_status = 'verified'. Privattarife: 'blocked' bleibt
--   gesperrt (Privatpreise sind sonst frei waehlbar, das aendert sich nicht).
--   NULL/unbekannte Werte fallen fail-closed durch die WHERE-Klausel raus,
--   weil tarif_status NOT NULL mit CHECK-Constraint ist — es gibt de facto
--   keinen anderen Wert als 'verified'/'unverified'/'blocked'.
--
--   zaehle_kassentarife(): zaehlt nur noch tarif_status = 'verified'.
--
-- Ansonsten identisch zur jeweils letzten Fassung (20260808120002 bzw.
-- 20260808120000) — keine sonstige Verhaltensaenderung.
--
-- Rollback: 20260831050001_rollback_fail_closed_tarif_status_rpcs.sql
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.create_invoice_draft_atomic(
  p_client_id        UUID,
  p_org_id           UUID,
  p_period_month     TEXT,
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
  v_rechtsgrundlage  TEXT;
  v_client_ik        TEXT;
  v_client_plz       TEXT;
  v_client_land      TEXT;
  v_org_bundesland   TEXT;
  v_land_quelle      TEXT;
  v_item_amount      NUMERIC;
  v_zuschlag_prozent NUMERIC := 0;
  v_zuschlag_grund   TEXT;
  v_base_amount      NUMERIC;
  v_is_wochenende    BOOLEAN;
  v_is_feiertag      BOOLEAN;
  v_is_nachtzeit     BOOLEAN;
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
  SELECT pflegekasse_ik, zip_code
    INTO v_client_ik, v_client_plz
    FROM public.clients
    WHERE id = p_client_id AND organization_id = p_org_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Klient % gehoert nicht zu Organisation % oder existiert nicht',
      p_client_id, p_org_id;
  END IF;

  -- Bundesland des KLIENTEN, nicht der Organisation (B4-Fix, 20260808120002)
  v_client_land := public.eindeutiges_bundesland_fuer_plz(v_client_plz);

  IF v_client_land IS NOT NULL THEN
    v_org_bundesland := v_client_land;
    v_land_quelle    := 'klient_plz';
  ELSE
    SELECT LOWER(COALESCE(bundesland, '')) INTO v_org_bundesland
      FROM public.organizations
      WHERE id = p_org_id;
    v_land_quelle := 'organisation_fallback';
  END IF;
  v_org_bundesland := COALESCE(v_org_bundesland, '');

  -- Zeitraum berechnen
  v_year  := EXTRACT(YEAR  FROM (p_period_month || '-01')::DATE);
  v_month := EXTRACT(MONTH FROM (p_period_month || '-01')::DATE);
  v_period_start := (p_period_month || '-01')::DATE;
  v_period_end   := (v_period_start + INTERVAL '1 month' - INTERVAL '1 day')::DATE;

  -- Rechtsgrundlage aus budget_type ableiten (P7: private → 'privat', nie NULL)
  v_rechtsgrundlage := CASE p_budget_type
    WHEN 'entlastung'           THEN '§45b SGB XI'
    WHEN 'verhinderung'         THEN '§39 SGB XI'
    WHEN 'carryover'            THEN '§45b SGB XI'
    WHEN 'haeusliche_pflege_36' THEN '§36 SGB XI'
    WHEN 'private'              THEN 'privat'
    ELSE NULL
  END;

  IF v_rechtsgrundlage IS NULL THEN
    RAISE EXCEPTION 'Unbekannter budget_type: "%". Erlaubt: entlastung, verhinderung, carryover, haeusliche_pflege_36, private.',
      p_budget_type;
  END IF;

  -- ═══ 1. Idempotenz-Pruefung ═══
  v_idemp_key := 'inv_' || p_client_id || '_' || p_period_month
                 || '_' || p_budget_type || '_v4';

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
  v_inv_number := public.next_billing_number(p_org_id, 'RE', v_year);

  INSERT INTO public.invoices (
    invoice_number, invoice_number_formatted, client_id,
    insurance_name, insurance_number,
    period_start, period_end,
    total_amount, budget_amount, private_amount,
    status, version, idempotency_key,
    organization_id, created_at, updated_at
  ) VALUES (
    v_inv_number, v_inv_number, p_client_id,
    p_insurance_name, p_insurance_number,
    v_period_start, v_period_end,
    0, 0, 0,
    'entwurf', 1, v_idemp_key,
    p_org_id, v_now, v_now
  )
  RETURNING id INTO v_invoice_id;

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
      bt.nacht_von,
      bt.nacht_bis,
      bt.tarifquelle,
      (
        CASE
          WHEN bt.kostentraeger_ik IS NOT NULL AND bt.kostentraeger_ik = v_client_ik THEN 10
          WHEN bt.kostentraeger_ik IS NOT NULL THEN -100
          ELSE 0
        END +
        CASE
          WHEN bt.bundesland IS NOT NULL AND v_org_bundesland <> '' AND LOWER(bt.bundesland) = v_org_bundesland THEN 5
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
      AND bt.rechtsgrundlage = v_rechtsgrundlage
      AND bt.gueltig_ab <= v_rec.date
      AND (bt.gueltig_bis IS NULL OR bt.gueltig_bis >= v_rec.date)
      AND bt.deleted_at IS NULL
      AND bt.ist_aktiv = TRUE
      -- ═══ FAIL-CLOSED: Kassentarife nur mit tarif_status = 'verified'.
      --     Privattarife: 'blocked' bleibt gesperrt, 'unverified' ist erlaubt
      --     (Privatpreise sind frei waehlbar, keine Kassen-Obergrenze). ═══
      AND (
        (v_rechtsgrundlage <> 'privat' AND bt.tarif_status = 'verified')
        OR (v_rechtsgrundlage = 'privat' AND bt.tarif_status <> 'blocked')
      )
      AND (
        CASE
          WHEN bt.kostentraeger_ik IS NOT NULL AND bt.kostentraeger_ik = v_client_ik THEN 10
          WHEN bt.kostentraeger_ik IS NOT NULL THEN -100
          ELSE 0
        END +
        CASE
          WHEN bt.bundesland IS NOT NULL AND v_org_bundesland <> '' AND LOWER(bt.bundesland) = v_org_bundesland THEN 5
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
      INSERT INTO public.billing_audit_trail (
        organization_id, entity_type, entity_id, action,
        new_state, actor_id, created_at, checksum
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
          'kostentraeger_ik', v_client_ik,
          'bundesland', v_org_bundesland,
          'bundesland_quelle', v_land_quelle,
          'client_plz', v_client_plz
        ),
        p_actor_id, v_now,
        encode(extensions.digest(('missing_tariff' || v_rec.id::TEXT || v_rec.service_type || v_rec.date::TEXT || p_actor_id::TEXT || v_now::TEXT)::bytea, 'sha256'), 'hex')
      );

      RAISE EXCEPTION 'MISSING_VALID_TARIFF: Kein gueltiger, verifizierter Tarif fuer Leistungsart "%" (%), Rechtsgrundlage "%", Datum %, Kostentraeger "%", Bundesland "%" (Quelle: %). Rechnung kann nicht erstellt werden.',
        v_rec.service_type, LOWER(v_rec.service_type), v_rechtsgrundlage, v_rec.date,
        COALESCE(v_client_ik, 'kein IK'),
        COALESCE(NULLIF(v_org_bundesland, ''), 'nicht bestimmbar'), v_land_quelle;
    END IF;

    -- ── Mehrdeutigkeits-Pruefung ──
    SELECT COUNT(*) INTO v_tariff_count
    FROM public.billing_tariffs bt
    WHERE bt.organization_id = p_org_id
      AND LOWER(bt.leistungsart) = LOWER(v_rec.service_type)
      AND bt.rechtsgrundlage = v_rechtsgrundlage
      AND bt.gueltig_ab <= v_rec.date
      AND (bt.gueltig_bis IS NULL OR bt.gueltig_bis >= v_rec.date)
      AND bt.deleted_at IS NULL
      AND bt.ist_aktiv = TRUE
      AND (
        (v_rechtsgrundlage <> 'privat' AND bt.tarif_status = 'verified')
        OR (v_rechtsgrundlage = 'privat' AND bt.tarif_status <> 'blocked')
      )
      AND (
        CASE
          WHEN bt.kostentraeger_ik IS NOT NULL AND bt.kostentraeger_ik = v_client_ik THEN 10
          WHEN bt.kostentraeger_ik IS NOT NULL THEN -100
          ELSE 0
        END +
        CASE
          WHEN bt.bundesland IS NOT NULL AND v_org_bundesland <> '' AND LOWER(bt.bundesland) = v_org_bundesland THEN 5
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
      INSERT INTO public.billing_audit_trail (
        organization_id, entity_type, entity_id, action,
        new_state, actor_id, created_at, checksum
      ) VALUES (
        p_org_id, 'tariff_lookup', p_client_id, 'ambiguous_tariff',
        jsonb_build_object(
          'error_code', 'AMBIGUOUS_TARIFF',
          'service_record_id', v_rec.id,
          'service_type', v_rec.service_type,
          'matching_tariff_count', v_tariff_count,
          'specificity_score', v_tariff.specificity_score,
          'date', v_rec.date,
          'period_month', p_period_month,
          'bundesland', v_org_bundesland
        ),
        p_actor_id, v_now,
        encode(extensions.digest(('ambiguous_tariff' || v_rec.id::TEXT || v_rec.service_type || v_rec.date::TEXT || p_actor_id::TEXT || v_now::TEXT)::bytea, 'sha256'), 'hex')
      );

      RAISE EXCEPTION 'AMBIGUOUS_TARIFF: % gleichwertige Tarife gefunden fuer Leistungsart "%", Datum %. Eindeutiger Tarif erforderlich.',
        v_tariff_count, v_rec.service_type, v_rec.date;
    END IF;

    -- ── Preis berechnen (Basis) ──
    v_base_amount := CASE v_tariff.verguetungsart
      WHEN 'zeit_stunde' THEN
        ROUND((v_tariff.preis_cent::NUMERIC / 100.0) * (COALESCE(v_rec.duration_minutes, 60)::NUMERIC / 60.0), 2)
      WHEN 'zeit_minute' THEN
        ROUND((v_tariff.preis_cent::NUMERIC / 100.0) * COALESCE(v_rec.duration_minutes, 60)::NUMERIC, 2)
      ELSE
        ROUND(v_tariff.preis_cent::NUMERIC / 100.0, 2)
    END;

    -- ── Zuschlagsberechnung ──
    v_zuschlag_prozent := 0;
    v_zuschlag_grund := NULL;

    v_is_wochenende := EXTRACT(DOW FROM v_rec.date) IN (0, 6);

    v_is_feiertag := EXISTS (
      SELECT 1 FROM public.billing_feiertage f
      WHERE f.datum = v_rec.date
        AND (f.bundesland IS NULL OR LOWER(f.bundesland) = v_org_bundesland)
    );

    IF v_is_feiertag AND COALESCE(v_tariff.zuschlag_feiertag_prozent, 0) > 0 THEN
      v_zuschlag_prozent := v_tariff.zuschlag_feiertag_prozent;
      v_zuschlag_grund := 'feiertag';
    ELSIF v_is_wochenende AND COALESCE(v_tariff.zuschlag_wochenende_prozent, 0) > 0 THEN
      v_zuschlag_prozent := v_tariff.zuschlag_wochenende_prozent;
      v_zuschlag_grund := 'wochenende';
    END IF;

    v_is_nachtzeit := FALSE;
    IF v_rec.start_time IS NOT NULL AND COALESCE(v_tariff.zuschlag_nacht_prozent, 0) > 0 THEN
      IF v_tariff.nacht_von > v_tariff.nacht_bis THEN
        v_is_nachtzeit := v_rec.start_time >= v_tariff.nacht_von OR v_rec.start_time < v_tariff.nacht_bis;
      ELSE
        v_is_nachtzeit := v_rec.start_time >= v_tariff.nacht_von AND v_rec.start_time < v_tariff.nacht_bis;
      END IF;

      IF v_is_nachtzeit THEN
        v_zuschlag_prozent := v_zuschlag_prozent + v_tariff.zuschlag_nacht_prozent;
        v_zuschlag_grund := CASE
          WHEN v_zuschlag_grund IS NOT NULL THEN v_zuschlag_grund || '+nacht'
          ELSE 'nacht'
        END;
      END IF;
    END IF;

    v_item_amount := ROUND(v_base_amount * (1 + v_zuschlag_prozent / 100.0), 2);

    -- ── Rechnungsposition erstellen mit Tarif-Metadaten ──
    INSERT INTO public.invoice_items (
      invoice_id, service_record_id, description, date,
      duration_minutes, amount, budget_type, organization_id, created_at,
      tariff_id, price_source,
      tariff_gueltig_ab, tariff_gueltig_bis,
      tariff_preis_cent, tariff_einheit, tariff_verguetungsart,
      abweichung_cent, abweichung_grund
    ) VALUES (
      v_invoice_id, v_rec.id,
      v_rec.service_type || ' am ' || v_rec.date
        || CASE WHEN v_zuschlag_grund IS NOT NULL THEN ' (' || v_zuschlag_grund || ' +' || v_zuschlag_prozent || '%)' ELSE '' END,
      v_rec.date,
      v_rec.duration_minutes, v_item_amount, v_rec.budget_type,
      p_org_id, v_now,
      v_tariff.id, 'billing_tariffs',
      v_tariff.gueltig_ab, v_tariff.gueltig_bis,
      v_tariff.preis_cent, v_tariff.einheit, v_tariff.verguetungsart,
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

  -- ═══ 6. Audit-Trail ═══
  v_audit_payload := jsonb_build_object(
    'invoice_number',    v_inv_number,
    'client_id',         p_client_id,
    'period',            p_period_month,
    'budget_type',       p_budget_type,
    'total_amount',      v_total,
    'line_count',        v_line_count,
    'price_source',      'billing_tariffs',
    'rechtsgrundlage',   v_rechtsgrundlage,
    'bundesland',        v_org_bundesland,
    'bundesland_quelle', v_land_quelle,
    'client_plz',        v_client_plz,
    'rpc_version',       'v6_tarif_status_fail_closed'
  );

  INSERT INTO public.billing_audit_trail (
    organization_id, entity_type, entity_id, action,
    previous_state, new_state, actor_id, created_at, checksum
  ) VALUES (
    p_org_id, 'invoice', v_invoice_id, 'created',
    NULL, v_audit_payload, p_actor_id, v_now,
    encode(
      extensions.digest(
        ('invoice' || v_invoice_id::TEXT || 'created' || v_audit_payload::TEXT
          || p_actor_id::TEXT || v_now::TEXT)::bytea,
        'sha256'
      ),
      'hex'
    )
  );

  v_result.invoice_id     := v_invoice_id;
  v_result.invoice_number := v_inv_number;
  v_result.total_amount   := v_total;
  v_result.line_count     := v_line_count;
  v_result.already_exists := FALSE;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.create_invoice_draft_atomic(UUID, UUID, TEXT, TEXT, UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.create_invoice_draft_atomic IS
  'Tarif-basierte atomare Rechnungserstellung v6: wie v5 (Bundesland aus '
  'Klienten-PLZ), zusaetzlich FAIL-CLOSED auf tarif_status — Kassentarife nur '
  'mit tarif_status=''verified'', Privattarife nur nicht ''blocked''. '
  'SECURITY DEFINER, nur service_role.';

-- ────────────────────────────────────────────────────────────────────────────
-- zaehle_kassentarife(): nur verifizierte Tarife zaehlen als "gueltig"
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.zaehle_kassentarife(
  p_org_id     UUID,
  p_bundesland TEXT,
  p_stichtag   DATE DEFAULT CURRENT_DATE
)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT COUNT(*)::INTEGER
    FROM public.billing_tariffs t
   WHERE t.organization_id = p_org_id
     AND t.rechtsgrundlage <> 'privat'
     AND t.ist_aktiv = TRUE
     AND t.deleted_at IS NULL
     AND t.tarif_status = 'verified'
     AND (t.bundesland IS NULL OR t.bundesland = p_bundesland)
     AND t.gueltig_ab <= p_stichtag
     AND (t.gueltig_bis IS NULL OR t.gueltig_bis >= p_stichtag);
$fn$;

COMMENT ON FUNCTION public.zaehle_kassentarife IS
  'Anzahl der am Stichtag gueltigen, aktiven UND verifizierten (tarif_status='
  '''verified'') Kassentarife einer Organisation fuer ein Bundesland (inkl. '
  'bundeslandunabhaengiger Tarife). FAIL-CLOSED: blocked/unverified zaehlen nicht.';

REVOKE ALL ON FUNCTION public.zaehle_kassentarife(UUID, TEXT, DATE)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.zaehle_kassentarife(UUID, TEXT, DATE)
  TO authenticated, service_role;
