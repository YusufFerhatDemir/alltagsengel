-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: D2-Fix — budget_type Alignment + Trigger-Erweiterung
-- Datum:     2026-08-12 (Gegenprüfung D2)
-- ═══════════════════════════════════════════════════════════════════════════
-- GRUND: Drei Probleme in D2-Implementierung gefunden:
--   1) service_records.budget_type = 'verhinderung', aber
--      client_budgets.budget_type = 'verhinderungspflege' → Join-Mismatch
--   2) update_budget_used_amount() Trigger nur für 'entlastung',
--      VP-Budget used_amount wird nie aktualisiert
--   3) combined_used_amount wird nie geschrieben
--
-- LÖSUNG:
--   1) service_records CHECK erweitern um 'verhinderungspflege'
--   2) Bestehende 'verhinderung' → 'verhinderungspflege' migrieren
--   3) Trigger für BEIDE Budget-Typen erweitern
--   4) combined_used_amount bei jeder Änderung aktualisieren
--
-- IDEMPOTENT: Guards überall.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. service_records: CHECK-Constraint erweitern ────────────────────────
-- Alte CHECK erlaubt: 'entlastung', 'verhinderung', 'carryover', 'private'
-- Neue CHECK erlaubt zusätzlich: 'verhinderungspflege'

DO $$ BEGIN
  -- Alte Constraint entfernen (Name kann variieren)
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'service_records'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%budget_type%'
  ) THEN
    EXECUTE (
      SELECT 'ALTER TABLE service_records DROP CONSTRAINT ' || quote_ident(conname)
      FROM pg_constraint
      WHERE conrelid = 'service_records'::regclass
        AND contype = 'c'
        AND pg_get_constraintdef(oid) ILIKE '%budget_type%'
      LIMIT 1
    );
  END IF;

  ALTER TABLE service_records
    ADD CONSTRAINT service_records_budget_type_check
    CHECK (budget_type IN ('entlastung', 'verhinderungspflege', 'carryover', 'private'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ── 2. Bestehende 'verhinderung' auf 'verhinderungspflege' migrieren ──────

UPDATE service_records
SET budget_type = 'verhinderungspflege'
WHERE budget_type = 'verhinderung';

-- ── 3. Trigger-Funktion: BEIDE Budget-Typen + combined_used_amount ────────

CREATE OR REPLACE FUNCTION public.update_budget_used_amount()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_client_id     UUID;
  v_org_id        UUID;
  v_budget_type   TEXT;
  v_year          INTEGER;
  v_new_used      NUMERIC;
  v_combined      NUMERIC;
BEGIN
  -- Bestimme client_id, org_id, budget_type je nach Operation
  IF TG_OP = 'DELETE' THEN
    v_client_id   := OLD.client_id;
    v_org_id      := OLD.organization_id;
    v_budget_type := OLD.budget_type;
  ELSE
    v_client_id   := NEW.client_id;
    v_org_id      := NEW.organization_id;
    v_budget_type := NEW.budget_type;
  END IF;

  -- Nur für trackbare Budget-Typen
  IF v_budget_type IS NULL OR v_budget_type NOT IN ('entlastung', 'verhinderungspflege') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Jahr aus dem Leistungsdatum
  IF TG_OP = 'DELETE' THEN
    v_year := EXTRACT(YEAR FROM OLD.date)::INTEGER;
  ELSE
    v_year := EXTRACT(YEAR FROM NEW.date)::INTEGER;
  END IF;

  -- Summe der abgerechneten Beträge für diesen Budget-Typ
  SELECT COALESCE(SUM(amount), 0) INTO v_new_used
  FROM service_records
  WHERE client_id = v_client_id
    AND organization_id = v_org_id
    AND budget_type = v_budget_type
    AND EXTRACT(YEAR FROM date) = v_year
    AND status IN ('completed', 'billed', 'paid');

  -- Budget-Zeile aktualisieren (oder anlegen falls nötig)
  UPDATE client_budgets
  SET used_amount = v_new_used,
      updated_at = NOW()
  WHERE client_id = v_client_id
    AND organization_id = v_org_id
    AND year = v_year
    AND budget_type = v_budget_type;

  -- combined_used_amount aktualisieren (Summe beider Typen)
  SELECT COALESCE(SUM(used_amount), 0) INTO v_combined
  FROM client_budgets
  WHERE client_id = v_client_id
    AND organization_id = v_org_id
    AND year = v_year
    AND budget_type IN ('entlastung', 'verhinderungspflege');

  UPDATE client_budgets
  SET combined_used_amount = v_combined,
      updated_at = NOW()
  WHERE client_id = v_client_id
    AND organization_id = v_org_id
    AND year = v_year
    AND budget_type IN ('entlastung', 'verhinderungspflege');

  RETURN COALESCE(NEW, OLD);
END;
$fn$;

COMMIT;
