-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK zu 20261013000000_rechnung_stornierte_nachweise.sql
-- Stellt create_invoice_draft_atomic v9 wieder her.
--
-- WARNUNG: mit v9 werden STORNIERTE Leistungsnachweise wieder fakturiert
-- (proof_status/billing_status='STORNIERT' bleibt ungeprueft, weil ein Storno
-- `status` auf 'signed' stehen laesst). Nur einspielen, wenn v10 einen
-- konkreten Schaden anrichtet.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

DROP FUNCTION IF EXISTS public.create_invoice_draft_atomic(UUID, UUID, TEXT, TEXT, UUID, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.create_invoice_draft_atomic(
  p_client_id        UUID,
  p_org_id           UUID,
  p_period_month     TEXT,
  p_budget_type      TEXT,
  p_actor_id         UUID,
  p_insurance_name   TEXT DEFAULT NULL,
  p_insurance_number TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
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
  v_unsigned         INTEGER := 0;
  v_unsigned_ids     TEXT;
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

  SELECT pflegekasse_ik, zip_code
    INTO v_client_ik, v_client_plz
    FROM public.clients
    WHERE id = p_client_id AND organization_id = p_org_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Klient % gehoert nicht zu Organisation % oder existiert nicht',
      p_client_id, p_org_id;
  END IF;

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

  v_year  := EXTRACT(YEAR  FROM (p_period_month || '-01')::DATE);
  v_month := EXTRACT(MONTH FROM (p_period_month || '-01')::DATE);
  v_period_start := (p_period_month || '-01')::DATE;
  v_period_end   := (v_period_start + INTERVAL '1 month' - INTERVAL '1 day')::DATE;

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
    RETURN (
      SELECT jsonb_build_object(
        'success', true,
        'invoice_id', v_existing_id,
        'invoice_number', COALESCE(invoice_number_formatted, invoice_number),
        'total_amount', total_amount,
        'line_count', 0,
        'already_exists', true
      )
      FROM public.invoices
      WHERE id = v_existing_id
    );
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

  -- ═══ 2b. FAIL-CLOSED: Unterschriftsnachweis (H-1) ═══
  -- v9-Fix: Bei fehlender Unterschrift wird der Audit-Eintrag geschrieben
  -- und ein Fehler-JSON zurueckgegeben STATT RAISE EXCEPTION.
  -- Dadurch wird der Audit-Eintrag COMMITTED (kein Rollback).
  -- Der Aufrufer (invoice-engine.ts) prueft success=false und wirft den Fehler.
  WITH ohne_unterschrift AS (
    SELECT sr.id, sr.date
      FROM public.service_records sr
     WHERE sr.client_id = p_client_id
       AND sr.budget_type = p_budget_type
       AND sr.status IN ('signed', 'complete')
       AND sr.date >= v_period_start
       AND sr.date <= v_period_end
       AND sr.proof_status IS DISTINCT FROM 'UNTERSCHRIEBEN'
       AND sr.signature_hash IS NULL
  )
  SELECT (SELECT COUNT(*) FROM ohne_unterschrift),
         (SELECT string_agg(t.id::TEXT || ' (' || t.date::TEXT || ')', ', ' ORDER BY t.date)
            FROM (SELECT o.id, o.date FROM ohne_unterschrift o ORDER BY o.date LIMIT 20) t)
    INTO v_unsigned, v_unsigned_ids;

  IF v_unsigned > 0 THEN
    INSERT INTO public.billing_audit_trail (
      organization_id, entity_type, entity_id, action,
      new_state, actor_id, created_at, checksum
    ) VALUES (
      p_org_id, 'invoice_draft', p_client_id, 'missing_signature',
      jsonb_build_object(
        'error_code', 'MISSING_SIGNATURE',
        'client_id', p_client_id,
        'period_month', p_period_month,
        'budget_type', p_budget_type,
        'rechtsgrundlage', v_rechtsgrundlage,
        'unsigned_count', v_unsigned,
        'line_count', v_line_count,
        'service_record_ids', v_unsigned_ids
      ),
      p_actor_id, v_now,
      encode(extensions.digest(('missing_signature' || p_client_id::TEXT || p_period_month
        || p_budget_type || p_actor_id::TEXT || v_now::TEXT)::bytea, 'sha256'), 'hex')
    );

    RETURN jsonb_build_object(
      'success', false,
      'error', 'MISSING_SIGNATURE',
      'message', format(
        'MISSING_SIGNATURE: %s von %s Leistungsnachweis(en) fuer Klient %s, Zeitraum %s, Budget %s sind nicht unterschrieben (proof_status <> ''UNTERSCHRIEBEN'' UND signature_hash IS NULL). Ohne Unterschriftsnachweis wird keine Rechnung erstellt. Betroffen: %s',
        v_unsigned, v_line_count, p_client_id, p_period_month, p_budget_type,
        COALESCE(v_unsigned_ids, 'unbekannt')
      ),
      'unsigned_count', v_unsigned,
      'line_count', v_line_count,
      'service_record_ids', v_unsigned_ids
    );
  END IF;

  -- ═══ 3. Tarif-Aufloesung und Preisberechnung pro Service Record ═══
  -- Tarif-Fehler (MISSING_VALID_TARIFF, AMBIGUOUS_TARIFF) behalten RAISE,
  -- da zu diesem Zeitpunkt bereits Rechnungsdaten angelegt sind die bei
  -- Fehler zurueckgerollt werden muessen. Der Audit-Eintrag wird ebenfalls
  -- zurueckgerollt — das ist eine bekannte Einschraenkung, aber der
  -- Fehlercode im RAISE ist jetzt korrekt (dank tariff_lookup im Constraint).
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
      AND LOWER(bt.leistungsart) = public.tarif_leistungsart(v_rec.service_type)
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

    SELECT COUNT(*) INTO v_tariff_count
    FROM public.billing_tariffs bt
    WHERE bt.organization_id = p_org_id
      AND LOWER(bt.leistungsart) = public.tarif_leistungsart(v_rec.service_type)
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

    v_base_amount := CASE v_tariff.verguetungsart
      WHEN 'zeit_stunde' THEN
        ROUND((v_tariff.preis_cent::NUMERIC / 100.0) * (COALESCE(v_rec.duration_minutes, 60)::NUMERIC / 60.0), 2)
      WHEN 'zeit_minute' THEN
        ROUND((v_tariff.preis_cent::NUMERIC / 100.0) * COALESCE(v_rec.duration_minutes, 60)::NUMERIC, 2)
      ELSE
        ROUND(v_tariff.preis_cent::NUMERIC / 100.0, 2)
    END;

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
    'rpc_version',       'v9_audit_persistenz'
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

  RETURN jsonb_build_object(
    'success', true,
    'invoice_id', v_invoice_id,
    'invoice_number', v_inv_number,
    'total_amount', v_total,
    'line_count', v_line_count,
    'already_exists', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_invoice_draft_atomic(UUID, UUID, TEXT, TEXT, UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.create_invoice_draft_atomic IS
  'Tarif-basierte atomare Rechnungserstellung v9: wie v8 (Unterschrifts-FAIL-CLOSED), '
  'aber bei MISSING_SIGNATURE wird der Audit-Eintrag persistiert statt mit RAISE '
  'zurueckgerollt. Rueckgabe JSONB statt composite type — bei Fehler '
  'success=false mit error/message, bei Erfolg success=true mit Rechnungsdaten. '
  'SECURITY DEFINER, nur service_role.';

COMMIT;

COMMIT;
