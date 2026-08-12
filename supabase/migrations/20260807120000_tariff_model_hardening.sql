-- ════════════════════════════════════════════════════════════════════════════
-- Migration: Tariff-Model-Hardening
-- Datum: 2026-08-07
-- Branch: feature/tariff-hardening
--
-- ZWECK: Production-Readiness-Hardening des Billing-/Tarifmodells
-- 1. Kontrollierter Katalog fuer leistungsart/rechtsgrundlage
-- 2. IK-Validierung (Luhn-Pruefziffer) fuer Klienten und Tarife
-- 3. Bundesland-Hardcoding entfernen (dynamisch aus Organization)
-- 4. Zuschlagsberechnung implementieren (Default 0)
-- 5. ist_aktiv Spalte + erweiterter Overlap-Constraint
-- 6. Korrektur-Audit-Pflichtfelder
--
-- BESTEHENDE DATEN: Nicht zerstoert. Neue Spalten haben Defaults.
-- KEINE erfundenen Preise. KEINE Production-Migration.
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Kontrollierter Katalog: Leistungsarten
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.billing_leistungsarten (
  code        TEXT PRIMARY KEY,
  bezeichnung TEXT NOT NULL,
  ist_aktiv   BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.billing_leistungsarten IS
  'Kontrollierter Katalog der erlaubten Leistungsarten fuer billing_tariffs und service_records.';

-- Seed: Alle Werte aus service_records CHECK + zusaetzliche Tarif-relevante
INSERT INTO public.billing_leistungsarten (code, bezeichnung, sort_order) VALUES
  ('alltagsbegleitung',    'Alltagsbegleitung',         1),
  ('betreuung_45a',        'Betreuung nach §45a SGB XI', 2),
  ('verhinderungspflege',  'Verhinderungspflege',        3),
  ('hauswirtschaft',       'Hauswirtschaftliche Versorgung', 4),
  ('einkaufsservice',      'Einkaufsservice',            5),
  ('begleitservice',       'Begleitservice',             6),
  ('nachtbetreuung',       'Nachtbetreuung',             7),
  ('wochenendbetreuung',   'Wochenendbetreuung',         8),
  ('krankenfahrt',         'Krankenfahrt',               9),
  ('demenzbetreuung',      'Demenzbetreuung',           10),
  ('wegepauschale',        'Wegepauschale',             11),
  ('sonstige',             'Sonstige Leistung',         99)
ON CONFLICT (code) DO NOTHING;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Kontrollierter Katalog: Rechtsgrundlagen
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.billing_rechtsgrundlagen (
  code        TEXT PRIMARY KEY,
  bezeichnung TEXT NOT NULL,
  ist_aktiv   BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.billing_rechtsgrundlagen IS
  'Kontrollierter Katalog der erlaubten Rechtsgrundlagen fuer billing_tariffs.';

INSERT INTO public.billing_rechtsgrundlagen (code, bezeichnung, sort_order) VALUES
  ('§45b SGB XI', 'Entlastungsleistungen',      1),
  ('§39 SGB XI',  'Verhinderungspflege',         2),
  ('§36 SGB XI',  'Haeusliche Pflegehilfe',      3),
  ('privat',      'Privatzahler (ohne Kasse)',    4)
ON CONFLICT (code) DO NOTHING;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. FK-Constraints auf billing_tariffs → Katalog
--    Bestehende Daten: billing_tariffs ist auf Production leer → kein Risiko.
--    Falls doch Daten existieren, werden sie durch die FK nicht geloescht.
-- ────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_tariff_leistungsart'
  ) THEN
    ALTER TABLE public.billing_tariffs
      ADD CONSTRAINT fk_tariff_leistungsart
      FOREIGN KEY (leistungsart)
      REFERENCES public.billing_leistungsarten(code);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_tariff_rechtsgrundlage'
  ) THEN
    ALTER TABLE public.billing_tariffs
      ADD CONSTRAINT fk_tariff_rechtsgrundlage
      FOREIGN KEY (rechtsgrundlage)
      REFERENCES public.billing_rechtsgrundlagen(code);
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. IK-Validierung: PL/pgSQL-Funktion (Luhn-Pruefziffer nach §293 SGB V)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.validate_ik_nummer(p_ik TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE
AS $fn$
DECLARE
  v_cleaned TEXT;
  v_digits  INTEGER[];
  v_weights INTEGER[] := ARRAY[2, 1, 2, 1, 2, 1];
  v_sum     INTEGER := 0;
  v_product INTEGER;
  i         INTEGER;
BEGIN
  -- NULL ist erlaubt (optionales Feld)
  IF p_ik IS NULL THEN
    RETURN TRUE;
  END IF;

  -- Whitespace entfernen
  v_cleaned := regexp_replace(p_ik, '\s', '', 'g');

  -- Muss exakt 9 Ziffern sein
  IF v_cleaned !~ '^\d{9}$' THEN
    RETURN FALSE;
  END IF;

  -- Ziffern in Array
  FOR i IN 1..9 LOOP
    v_digits[i] := CAST(substring(v_cleaned FROM i FOR 1) AS INTEGER);
  END LOOP;

  -- Luhn-Pruefziffer ueber Stellen 3-8 (Index 3..8)
  FOR i IN 1..6 LOOP
    v_product := v_digits[i + 2] * v_weights[i];
    IF v_product > 9 THEN
      v_sum := v_sum + v_product - 9;
    ELSE
      v_sum := v_sum + v_product;
    END IF;
  END LOOP;

  -- Pruefziffer (Stelle 9) muss Summe mod 10 entsprechen
  RETURN v_digits[9] = (v_sum % 10);
END;
$fn$;

COMMENT ON FUNCTION public.validate_ik_nummer IS
  'IK-Nummer-Validierung: 9 Ziffern + Luhn-Pruefziffer (§293 SGB V). NULL erlaubt.';

-- ────────────────────────────────────────────────────────────────────────────
-- 5. CHECK-Constraints fuer IK-Validierung
-- ────────────────────────────────────────────────────────────────────────────

-- clients.pflegekasse_ik: NULL erlaubt, sonst Luhn-gueltig
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_client_ik_valid'
  ) THEN
    ALTER TABLE public.clients
      ADD CONSTRAINT chk_client_ik_valid
      CHECK (pflegekasse_ik IS NULL OR validate_ik_nummer(pflegekasse_ik));
  END IF;
END $$;

-- billing_tariffs.kostentraeger_ik: NULL erlaubt (generischer Tarif), sonst Luhn-gueltig
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_tariff_ik_valid'
  ) THEN
    ALTER TABLE public.billing_tariffs
      ADD CONSTRAINT chk_tariff_ik_valid
      CHECK (kostentraeger_ik IS NULL OR validate_ik_nummer(kostentraeger_ik));
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 6. billing_tariffs: ist_aktiv-Spalte + Overlap-Constraint erweitern
-- ────────────────────────────────────────────────────────────────────────────

-- ist_aktiv-Spalte
ALTER TABLE public.billing_tariffs
  ADD COLUMN IF NOT EXISTS ist_aktiv BOOLEAN NOT NULL DEFAULT TRUE;

-- Alten Overlap-Constraint entfernen und erweiterten anlegen
-- (jetzt mit Bundesland-Dimension und ist_aktiv-Filter)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'no_overlapping_tariffs'
  ) THEN
    ALTER TABLE public.billing_tariffs DROP CONSTRAINT no_overlapping_tariffs;
  END IF;
END $$;

ALTER TABLE public.billing_tariffs
  ADD CONSTRAINT no_overlapping_tariffs
  EXCLUDE USING gist (
    organization_id WITH =,
    leistungsart    WITH =,
    rechtsgrundlage WITH =,
    COALESCE(kostentraeger_ik, '__ALL__') WITH =,
    COALESCE(bundesland, '__ALL__')       WITH =,
    tariff_validity_range(gueltig_ab, gueltig_bis) WITH &&
  )
  WHERE (deleted_at IS NULL AND ist_aktiv = TRUE);

-- ────────────────────────────────────────────────────────────────────────────
-- 7. Feiertage-Tabelle (fuer Feiertagszuschlag-Pruefung)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.billing_feiertage (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  datum       DATE NOT NULL,
  bezeichnung TEXT NOT NULL,
  bundesland  TEXT,  -- NULL = bundesweit
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Eindeutigkeit ueber (datum, bundesland) mit NULL = bundesweit.
-- Als UNIQUE-CONSTRAINT nicht moeglich: Constraints duerfen in PostgreSQL
-- keine Ausdruecke enthalten (COALESCE) — das warf
--   ERROR: syntax error at or near "("
-- und machte die gesamte Migration unanwendbar. Ein UNIQUE INDEX kann es.
CREATE UNIQUE INDEX IF NOT EXISTS unique_feiertag_datum_bl
  ON public.billing_feiertage (datum, COALESCE(bundesland, '__ALL__'));

COMMENT ON TABLE public.billing_feiertage IS
  'Feiertage fuer Zuschlagsberechnung. bundesland NULL = bundesweit.';

-- ────────────────────────────────────────────────────────────────────────────
-- 8. RPC-Funktion: Komplett neu mit allen Hardening-Aenderungen
--    - Dynamisches Bundesland aus organizations
--    - Zuschlagsberechnung (Wochenende/Feiertag/Nacht, Default 0)
--    - ist_aktiv-Filter
--    - Katalog-Validierung (automatisch durch FK)
-- ────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.create_invoice_draft_atomic(UUID, UUID, TEXT, TEXT, UUID, TEXT, TEXT);

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
  v_rechtsgrundlage  TEXT;
  v_client_ik        TEXT;
  v_org_bundesland   TEXT;   -- NEU: dynamisch aus Organization
  v_item_amount      NUMERIC;
  v_zuschlag_prozent NUMERIC := 0;  -- NEU: Zuschlagsberechnung
  v_zuschlag_grund   TEXT;          -- NEU: Zuschlagsgrund
  v_base_amount      NUMERIC;       -- NEU: Basis vor Zuschlag
  v_is_wochenende    BOOLEAN;       -- NEU
  v_is_feiertag      BOOLEAN;       -- NEU
  v_is_nachtzeit     BOOLEAN;       -- NEU
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

  -- ═══ NEU: Bundesland dynamisch aus Organization laden ═══
  SELECT LOWER(COALESCE(bundesland, '')) INTO v_org_bundesland
    FROM public.organizations
    WHERE id = p_org_id;

  -- Zeitraum berechnen
  v_year  := EXTRACT(YEAR  FROM (p_period_month || '-01')::DATE);
  v_month := EXTRACT(MONTH FROM (p_period_month || '-01')::DATE);
  v_period_start := (p_period_month || '-01')::DATE;
  v_period_end   := (v_period_start + INTERVAL '1 month' - INTERVAL '1 day')::DATE;

  -- Rechtsgrundlage aus budget_type ableiten
  v_rechtsgrundlage := CASE p_budget_type
    WHEN 'entlastung'           THEN '§45b SGB XI'
    WHEN 'verhinderung'         THEN '§39 SGB XI'
    WHEN 'carryover'            THEN '§45b SGB XI'
    WHEN 'haeusliche_pflege_36' THEN '§36 SGB XI'
    WHEN 'private'              THEN NULL
    ELSE NULL
  END;

  -- ═══ 1. Idempotenz-Pruefung ═══
  v_idemp_key := 'inv_' || p_client_id || '_' || p_period_month
                 || '_' || p_budget_type || '_v3';

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
    -- ── Tarif-Aufloesung mit Spezifitaets-Scoring ──
    -- NEU: Bundesland dynamisch, ist_aktiv geprueft
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
      AND (
        (v_rechtsgrundlage IS NOT NULL AND bt.rechtsgrundlage = v_rechtsgrundlage)
        OR
        (v_rechtsgrundlage IS NULL AND p_budget_type = 'private')
      )
      AND bt.gueltig_ab <= v_rec.date
      AND (bt.gueltig_bis IS NULL OR bt.gueltig_bis >= v_rec.date)
      AND bt.deleted_at IS NULL
      AND bt.ist_aktiv = TRUE   -- NEU: nur aktive Tarife
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
          'org_bundesland', v_org_bundesland
        ),
        p_actor_id, v_now,
        encode(extensions.digest(('missing_tariff' || v_rec.id::TEXT || v_rec.service_type || v_rec.date::TEXT || p_actor_id::TEXT || v_now::TEXT)::bytea, 'sha256'), 'hex')
      );

      RAISE EXCEPTION 'MISSING_VALID_TARIFF: Kein gueltiger Tarif fuer Leistungsart "%" (%), Rechtsgrundlage "%", Datum %, Kostentraeger "%", Bundesland "%". Rechnung kann nicht erstellt werden.',
        v_rec.service_type, LOWER(v_rec.service_type), COALESCE(v_rechtsgrundlage, 'keine (privat)'), v_rec.date, COALESCE(v_client_ik, 'kein IK'), COALESCE(v_org_bundesland, 'nicht gesetzt');
    END IF;

    -- ── Mehrdeutigkeits-Pruefung ──
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
      AND bt.ist_aktiv = TRUE   -- NEU
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
          'period_month', p_period_month
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
      WHEN 'leistungskomplex' THEN
        ROUND(v_tariff.preis_cent::NUMERIC / 100.0, 2)
      WHEN 'pauschale' THEN
        ROUND(v_tariff.preis_cent::NUMERIC / 100.0, 2)
      WHEN 'wegepauschale' THEN
        ROUND(v_tariff.preis_cent::NUMERIC / 100.0, 2)
      ELSE
        ROUND(v_tariff.preis_cent::NUMERIC / 100.0, 2)
    END;

    -- ── NEU: Zuschlagsberechnung ──
    -- Default = 0%. Nur aktiv wenn explizite Werte > 0 im Tarif hinterlegt sind.
    v_zuschlag_prozent := 0;
    v_zuschlag_grund := NULL;

    -- Wochenende pruefen (0=Sonntag, 6=Samstag)
    v_is_wochenende := EXTRACT(DOW FROM v_rec.date) IN (0, 6);

    -- Feiertag pruefen (aus billing_feiertage, bundesland-bewusst)
    v_is_feiertag := EXISTS (
      SELECT 1 FROM public.billing_feiertage f
      WHERE f.datum = v_rec.date
        AND (f.bundesland IS NULL OR LOWER(f.bundesland) = v_org_bundesland)
    );

    -- Feiertag hat Vorrang vor Wochenende
    IF v_is_feiertag AND COALESCE(v_tariff.zuschlag_feiertag_prozent, 0) > 0 THEN
      v_zuschlag_prozent := v_tariff.zuschlag_feiertag_prozent;
      v_zuschlag_grund := 'feiertag';
    ELSIF v_is_wochenende AND COALESCE(v_tariff.zuschlag_wochenende_prozent, 0) > 0 THEN
      v_zuschlag_prozent := v_tariff.zuschlag_wochenende_prozent;
      v_zuschlag_grund := 'wochenende';
    END IF;

    -- Nachtzuschlag (kumulativ, wenn start_time in Nachtzeit)
    v_is_nachtzeit := FALSE;
    IF v_rec.start_time IS NOT NULL AND COALESCE(v_tariff.zuschlag_nacht_prozent, 0) > 0 THEN
      -- Nachtzeit: nacht_von bis nacht_bis (ueber Mitternacht moeglich)
      IF v_tariff.nacht_von > v_tariff.nacht_bis THEN
        -- z.B. 20:00 - 06:00 (ueber Mitternacht)
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

    -- Zuschlag auf Basis anwenden
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
    'invoice_number', v_inv_number,
    'client_id',      p_client_id,
    'period',         p_period_month,
    'budget_type',    p_budget_type,
    'total_amount',   v_total,
    'line_count',     v_line_count,
    'price_source',   'billing_tariffs',
    'rechtsgrundlage', v_rechtsgrundlage,
    'org_bundesland',  v_org_bundesland
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

  -- ═══ Ergebnis ═══
  v_result.invoice_id     := v_invoice_id;
  v_result.invoice_number := v_inv_number;
  v_result.total_amount   := v_total;
  v_result.line_count     := v_line_count;
  v_result.already_exists := FALSE;

  RETURN v_result;
END;
$$;

-- Berechtigungen
REVOKE ALL ON FUNCTION public.create_invoice_draft_atomic(UUID, UUID, TEXT, TEXT, UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.create_invoice_draft_atomic IS
  'Tarif-basierte atomare Rechnungserstellung v3: Dynamisches Bundesland, Zuschlagsberechnung, ist_aktiv-Filter, Katalog-FK-Validierung. SECURITY DEFINER, nur service_role.';

