-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Vitalwerte-Modul — vital_signs + vital_sign_thresholds
-- Datum:     2026-08-18
-- Projekt:   Alltagsengel UG
-- ═══════════════════════════════════════════════════════════════════════════
-- IDEMPOTENT: Alle Statements mit IF NOT EXISTS / IF EXISTS Guards.
-- BESTEHENDE DATEN: Keine Löschung, nur neue Tabellen.
-- org_fence: current_org_id() RESTRICTIVE (Konvention aus Phase 3).
-- RLS: bewusst KEINE profiles-Subqueries (42P17-Rekursionsfalle) —
--      Admin-Zugriff läuft über is_admin(), Engel über assignments.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- TEIL 1: vital_signs — Einzelmessungen
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS vital_signs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL DEFAULT current_org_id(),
  client_id        uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  -- Messung
  type             text NOT NULL,
  value            numeric(8,2) NOT NULL,
  -- Nur Blutdruck: value = systolisch, value_secondary = diastolisch
  value_secondary  numeric(8,2),
  unit             text NOT NULL,
  measured_at      timestamptz NOT NULL DEFAULT now(),
  measured_by      uuid NOT NULL REFERENCES auth.users(id),
  measured_by_name text,
  measured_by_role text,
  notes            text,

  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT vital_signs_type_check CHECK (type IN (
    'blutdruck','puls','temperatur','blutzucker','spo2',
    'gewicht','atemfrequenz','schmerz','trinkmenge','ausscheidung'
  )),
  CONSTRAINT vital_signs_value_check CHECK (value >= 0),
  -- Blutdruck braucht beide Werte; alle anderen Typen haben keinen Zweitwert
  CONSTRAINT vital_signs_secondary_required_check CHECK (type <> 'blutdruck' OR value_secondary IS NOT NULL),
  CONSTRAINT vital_signs_secondary_only_bp_check CHECK (value_secondary IS NULL OR type = 'blutdruck'),
  CONSTRAINT vital_signs_secondary_value_check CHECK (value_secondary IS NULL OR value_secondary >= 0)
);

CREATE INDEX IF NOT EXISTS idx_vital_signs_client_type_time ON vital_signs(client_id, type, measured_at DESC);
CREATE INDEX IF NOT EXISTS idx_vital_signs_org_time ON vital_signs(organization_id, measured_at DESC);

ALTER TABLE vital_signs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'vital_signs' AND policyname = 'admin_vital_signs') THEN
    CREATE POLICY admin_vital_signs ON vital_signs FOR ALL
      USING (is_admin()) WITH CHECK (is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'vital_signs' AND policyname = 'org_fence_vital_signs') THEN
    CREATE POLICY org_fence_vital_signs ON vital_signs AS RESTRICTIVE FOR ALL
      USING (organization_id = current_org_id());
  END IF;
  -- Engel sehen/erfassen Vitalwerte nur für aktiv zugewiesene Klienten.
  -- WICHTIG: eigene_caregiver_ids() (SECURITY DEFINER) statt caregivers-Join —
  -- caregivers hat für Engel KEINE Lesepolicy (nur Admin + org_fence), ein
  -- direkter Join liefert unter RLS 0 Zeilen und würde jede Engel-Erfassung
  -- blockieren. assignments ist per assignments_engel_read lesbar.
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'vital_signs' AND policyname = 'engel_vital_signs_select') THEN
    CREATE POLICY engel_vital_signs_select ON vital_signs FOR SELECT
      USING (client_id IN (
        SELECT a.client_id FROM assignments a
        WHERE a.caregiver_id IN (SELECT eigene_caregiver_ids())
          AND a.status IN ('active','GEPLANT','BESTAETIGT','UNTERWEGS','GESTARTET')
      ));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'vital_signs' AND policyname = 'engel_vital_signs_insert') THEN
    CREATE POLICY engel_vital_signs_insert ON vital_signs FOR INSERT
      WITH CHECK (measured_by = auth.uid() AND client_id IN (
        SELECT a.client_id FROM assignments a
        WHERE a.caregiver_id IN (SELECT eigene_caregiver_ids())
          AND a.status IN ('active','GEPLANT','BESTAETIGT','UNTERWEGS','GESTARTET')
      ));
  END IF;
  -- BEWUSST KEINE Kunden-Lesepolicy: vital_signs.notes kann interne
  -- Pflegevermerke enthalten, und es gibt keine kundengerichtete UI. Least
  -- Privilege — eine Kundensicht braucht erst ein Sichtbarkeitsmodell (analog
  -- pflege_verlauf.sichtbarkeit), dann eine gezielte Policy ohne notes.
END $$;

DROP TRIGGER IF EXISTS trg_updated_at_vital_signs ON vital_signs;
CREATE TRIGGER trg_updated_at_vital_signs BEFORE UPDATE ON vital_signs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ═══════════════════════════════════════════════════════════════════════════
-- TEIL 2: vital_sign_thresholds — Grenzwerte pro Klient & Vitaltyp
-- ═══════════════════════════════════════════════════════════════════════════
-- Zwei Stufen: Warnung (warn) und Kritisch (critical). Kritisch liegt immer
-- außerhalb der Warnstufe. Für Blutdruck gelten die *_secondary-Spalten
-- zusätzlich für den diastolischen Wert.

CREATE TABLE IF NOT EXISTS vital_sign_thresholds (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL DEFAULT current_org_id(),
  client_id        uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  type             text NOT NULL,

  min_warn              numeric(8,2),
  max_warn              numeric(8,2),
  min_critical          numeric(8,2),
  max_critical          numeric(8,2),
  min_warn_secondary     numeric(8,2),
  max_warn_secondary     numeric(8,2),
  min_critical_secondary numeric(8,2),
  max_critical_secondary numeric(8,2),

  enabled          boolean NOT NULL DEFAULT true,
  notes            text,
  created_by       uuid REFERENCES auth.users(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT vital_sign_thresholds_type_check CHECK (type IN (
    'blutdruck','puls','temperatur','blutzucker','spo2',
    'gewicht','atemfrequenz','schmerz','trinkmenge','ausscheidung'
  )),
  -- Pro Klient und Vitaltyp genau ein Grenzwert-Satz
  CONSTRAINT vital_sign_thresholds_client_type_unique UNIQUE (client_id, type),
  -- Konsistenz: min < max und kritisch außerhalb von warn (nur wenn beide gesetzt)
  CONSTRAINT vital_sign_thresholds_warn_order_check
    CHECK (min_warn IS NULL OR max_warn IS NULL OR min_warn < max_warn),
  CONSTRAINT vital_sign_thresholds_critical_order_check
    CHECK (min_critical IS NULL OR max_critical IS NULL OR min_critical < max_critical),
  CONSTRAINT vital_sign_thresholds_min_nesting_check
    CHECK (min_critical IS NULL OR min_warn IS NULL OR min_critical <= min_warn),
  CONSTRAINT vital_sign_thresholds_max_nesting_check
    CHECK (max_critical IS NULL OR max_warn IS NULL OR max_critical >= max_warn),
  CONSTRAINT vital_sign_thresholds_secondary_only_bp_check CHECK (
    type = 'blutdruck' OR (
      min_warn_secondary IS NULL AND max_warn_secondary IS NULL
      AND min_critical_secondary IS NULL AND max_critical_secondary IS NULL
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_vital_sign_thresholds_client ON vital_sign_thresholds(client_id);
CREATE INDEX IF NOT EXISTS idx_vital_sign_thresholds_org ON vital_sign_thresholds(organization_id);

ALTER TABLE vital_sign_thresholds ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'vital_sign_thresholds' AND policyname = 'admin_vital_sign_thresholds') THEN
    CREATE POLICY admin_vital_sign_thresholds ON vital_sign_thresholds FOR ALL
      USING (is_admin()) WITH CHECK (is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'vital_sign_thresholds' AND policyname = 'org_fence_vital_sign_thresholds') THEN
    CREATE POLICY org_fence_vital_sign_thresholds ON vital_sign_thresholds AS RESTRICTIVE FOR ALL
      USING (organization_id = current_org_id());
  END IF;
  -- Engel lesen Grenzwerte ihrer zugewiesenen Klienten (für die Alarm-Anzeige).
  -- eigene_caregiver_ids() statt caregivers-Join (s. Begründung bei vital_signs).
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'vital_sign_thresholds' AND policyname = 'engel_vital_sign_thresholds_select') THEN
    CREATE POLICY engel_vital_sign_thresholds_select ON vital_sign_thresholds FOR SELECT
      USING (client_id IN (
        SELECT a.client_id FROM assignments a
        WHERE a.caregiver_id IN (SELECT eigene_caregiver_ids())
          AND a.status IN ('active','GEPLANT','BESTAETIGT','UNTERWEGS','GESTARTET')
      ));
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_updated_at_vital_sign_thresholds ON vital_sign_thresholds;
CREATE TRIGGER trg_updated_at_vital_sign_thresholds BEFORE UPDATE ON vital_sign_thresholds
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
