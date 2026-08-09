-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: SIS — Strukturierte Informationssammlung
--            (Assessments + 6 Themenfelder + Risikomatrix)
-- Datum:     2026-08-18
-- Projekt:   Alltagsengel UG
-- ═══════════════════════════════════════════════════════════════════════════
-- IDEMPOTENT: Alle Statements mit IF NOT EXISTS / IF EXISTS Guards.
-- BESTEHENDE DATEN: Keine Löschung, nur neue Tabellen.
-- RLS: is_admin() (KEINE profiles-Subqueries — 42P17-Vorgeschichte),
--      org_fence RESTRICTIVE über current_org_id(), Engel-SELECT über
--      aktive assignments. anon erhält keinerlei Grants.
-- Trigger-Funktionen: LANGUAGE plpgsql, SET search_path, KEIN SECURITY DEFINER.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- TEIL 1: sis_assessments — Kopfsatz je Informationssammlung
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS sis_assessments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT current_org_id(),
  client_id       uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  assessment_datum date NOT NULL DEFAULT CURRENT_DATE,
  assessment_typ   text NOT NULL DEFAULT 'erstgespraech',
  versorgungsform  text NOT NULL DEFAULT 'ambulant',
  erhoben_von      uuid NOT NULL REFERENCES auth.users(id),

  -- Einstieg aus Sicht der pflegebedürftigen Person
  -- („Was bewegt Sie im Augenblick? Was brauchen Sie? …")
  eingangsfrage    text,

  status           text NOT NULL DEFAULT 'entwurf',
  abgeschlossen_am timestamptz,
  abgeschlossen_von uuid REFERENCES auth.users(id),
  gesperrt         boolean NOT NULL DEFAULT false,
  bemerkung        text,

  erstellt_von  uuid NOT NULL REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT sis_assessments_typ_check
    CHECK (assessment_typ IN ('erstgespraech','folgegespraech','wiederaufnahme','anlassbezogen')),
  CONSTRAINT sis_assessments_versorgungsform_check
    CHECK (versorgungsform IN ('ambulant','stationaer','tagespflege')),
  CONSTRAINT sis_assessments_status_check
    CHECK (status IN ('entwurf','abgeschlossen','gesperrt'))
);

CREATE INDEX IF NOT EXISTS idx_sis_assessments_client ON sis_assessments(client_id);
CREATE INDEX IF NOT EXISTS idx_sis_assessments_org    ON sis_assessments(organization_id);
CREATE INDEX IF NOT EXISTS idx_sis_assessments_status ON sis_assessments(status);

-- ═══════════════════════════════════════════════════════════════════════════
-- TEIL 2: sis_themenfelder — je Assessment max. 6 Themenfelder
--   1 Kognitive und kommunikative Fähigkeiten
--   2 Mobilität und Beweglichkeit
--   3 Krankheitsbezogene Anforderungen und Belastungen
--   4 Selbstversorgung
--   5 Leben in sozialen Beziehungen
--   6 Haushaltsführung (nur ambulant)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS sis_themenfelder (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT current_org_id(),
  assessment_id   uuid NOT NULL REFERENCES sis_assessments(id) ON DELETE CASCADE,

  feld_nr              integer NOT NULL,
  sicht_klient         text,   -- Wahrnehmung der pflegebedürftigen Person
  einschaetzung_pflege text,   -- fachliche Einschätzung der Pflegefachkraft
  handlungsbedarf      boolean,
  bemerkung            text,

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT sis_themenfelder_feld_nr_check CHECK (feld_nr BETWEEN 1 AND 6),
  CONSTRAINT sis_themenfelder_unique UNIQUE (assessment_id, feld_nr)
);

CREATE INDEX IF NOT EXISTS idx_sis_themenfelder_assessment ON sis_themenfelder(assessment_id);
CREATE INDEX IF NOT EXISTS idx_sis_themenfelder_org        ON sis_themenfelder(organization_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- TEIL 3: sis_risikomatrix — je Assessment 5 pflegesensitive Risiken
--   dekubitus, sturz, inkontinenz, schmerz, ernaehrung
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS sis_risikomatrix (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT current_org_id(),
  assessment_id   uuid NOT NULL REFERENCES sis_assessments(id) ON DELETE CASCADE,

  risiko                text NOT NULL,
  risiko_vorhanden      text NOT NULL DEFAULT 'unklar',  -- fachliche Ersteinschätzung
  weitere_einschaetzung boolean NOT NULL DEFAULT false,  -- vertieftes Assessment notwendig?
  bemerkung             text,

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT sis_risikomatrix_risiko_check
    CHECK (risiko IN ('dekubitus','sturz','inkontinenz','schmerz','ernaehrung')),
  CONSTRAINT sis_risikomatrix_vorhanden_check
    CHECK (risiko_vorhanden IN ('ja','nein','unklar')),
  CONSTRAINT sis_risikomatrix_unique UNIQUE (assessment_id, risiko)
);

CREATE INDEX IF NOT EXISTS idx_sis_risikomatrix_assessment ON sis_risikomatrix(assessment_id);
CREATE INDEX IF NOT EXISTS idx_sis_risikomatrix_org        ON sis_risikomatrix(organization_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- TEIL 4: updated_at-Trigger (Funktion set_updated_at() existiert bereits)
-- ═══════════════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_updated_at_sis_assessments ON sis_assessments;
CREATE TRIGGER trg_updated_at_sis_assessments BEFORE UPDATE ON sis_assessments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_updated_at_sis_themenfelder ON sis_themenfelder;
CREATE TRIGGER trg_updated_at_sis_themenfelder BEFORE UPDATE ON sis_themenfelder
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_updated_at_sis_risikomatrix ON sis_risikomatrix;
CREATE TRIGGER trg_updated_at_sis_risikomatrix BEFORE UPDATE ON sis_risikomatrix
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- TEIL 5: Sperr-Schutz — gesperrte SIS ist unveränderlich, inkl. Kindzeilen
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION prevent_locked_sis_edit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.gesperrt = true AND NEW.gesperrt = true THEN
    RAISE EXCEPTION 'Gesperrte Informationssammlung kann nicht bearbeitet werden.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_locked_sis ON sis_assessments;
CREATE TRIGGER trg_locked_sis BEFORE UPDATE ON sis_assessments
  FOR EACH ROW EXECUTE FUNCTION prevent_locked_sis_edit();

-- Kindzeilen (Themenfelder/Risikomatrix): Schreibschutz, wenn Kopfsatz gesperrt
CREATE OR REPLACE FUNCTION prevent_locked_sis_child_edit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_assessment_id uuid;
  v_gesperrt boolean;
BEGIN
  v_assessment_id := COALESCE(NEW.assessment_id, OLD.assessment_id);
  SELECT gesperrt INTO v_gesperrt FROM sis_assessments WHERE id = v_assessment_id;
  IF v_gesperrt = true THEN
    RAISE EXCEPTION 'Informationssammlung ist gesperrt — Änderung nicht möglich.';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_locked_sis_themenfelder ON sis_themenfelder;
CREATE TRIGGER trg_locked_sis_themenfelder
  BEFORE INSERT OR UPDATE OR DELETE ON sis_themenfelder
  FOR EACH ROW EXECUTE FUNCTION prevent_locked_sis_child_edit();

DROP TRIGGER IF EXISTS trg_locked_sis_risikomatrix ON sis_risikomatrix;
CREATE TRIGGER trg_locked_sis_risikomatrix
  BEFORE INSERT OR UPDATE OR DELETE ON sis_risikomatrix
  FOR EACH ROW EXECUTE FUNCTION prevent_locked_sis_child_edit();

-- ═══════════════════════════════════════════════════════════════════════════
-- TEIL 6: RLS
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE sis_assessments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE sis_themenfelder ENABLE ROW LEVEL SECURITY;
ALTER TABLE sis_risikomatrix ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  -- Admin: voller Zugriff (is_admin() statt profiles-Subquery, s. Kopfkommentar)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sis_assessments' AND policyname = 'admin_sis_assessments') THEN
    CREATE POLICY admin_sis_assessments ON sis_assessments FOR ALL
      USING (is_admin()) WITH CHECK (is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sis_themenfelder' AND policyname = 'admin_sis_themenfelder') THEN
    CREATE POLICY admin_sis_themenfelder ON sis_themenfelder FOR ALL
      USING (is_admin()) WITH CHECK (is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sis_risikomatrix' AND policyname = 'admin_sis_risikomatrix') THEN
    CREATE POLICY admin_sis_risikomatrix ON sis_risikomatrix FOR ALL
      USING (is_admin()) WITH CHECK (is_admin());
  END IF;

  -- Mandanten-Zaun (RESTRICTIVE): schneidet jede permissive Policy auf die Org
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sis_assessments' AND policyname = 'org_fence_sis_assessments') THEN
    CREATE POLICY org_fence_sis_assessments ON sis_assessments AS RESTRICTIVE FOR ALL
      USING (organization_id = current_org_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sis_themenfelder' AND policyname = 'org_fence_sis_themenfelder') THEN
    CREATE POLICY org_fence_sis_themenfelder ON sis_themenfelder AS RESTRICTIVE FOR ALL
      USING (organization_id = current_org_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sis_risikomatrix' AND policyname = 'org_fence_sis_risikomatrix') THEN
    CREATE POLICY org_fence_sis_risikomatrix ON sis_risikomatrix AS RESTRICTIVE FOR ALL
      USING (organization_id = current_org_id());
  END IF;

  -- Engel: Lesezugriff auf SIS ihrer aktiv zugewiesenen Kunden
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sis_assessments' AND policyname = 'engel_sis_assessments_select') THEN
    CREATE POLICY engel_sis_assessments_select ON sis_assessments FOR SELECT
      USING (client_id IN (
        SELECT a.client_id FROM assignments a
        JOIN caregivers cg ON cg.id = a.caregiver_id
        WHERE cg.user_id = auth.uid() AND a.status IN ('active','GEPLANT','BESTAETIGT','UNTERWEGS','GESTARTET')
      ));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sis_themenfelder' AND policyname = 'engel_sis_themenfelder_select') THEN
    CREATE POLICY engel_sis_themenfelder_select ON sis_themenfelder FOR SELECT
      USING (assessment_id IN (
        SELECT s.id FROM sis_assessments s
        JOIN assignments a ON a.client_id = s.client_id
        JOIN caregivers cg ON cg.id = a.caregiver_id
        WHERE cg.user_id = auth.uid() AND a.status IN ('active','GEPLANT','BESTAETIGT','UNTERWEGS','GESTARTET')
      ));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sis_risikomatrix' AND policyname = 'engel_sis_risikomatrix_select') THEN
    CREATE POLICY engel_sis_risikomatrix_select ON sis_risikomatrix FOR SELECT
      USING (assessment_id IN (
        SELECT s.id FROM sis_assessments s
        JOIN assignments a ON a.client_id = s.client_id
        JOIN caregivers cg ON cg.id = a.caregiver_id
        WHERE cg.user_id = auth.uid() AND a.status IN ('active','GEPLANT','BESTAETIGT','UNTERWEGS','GESTARTET')
      ));
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- TEIL 7: Grants — anon hat auf SIS-Tabellen NICHTS verloren
-- (Supabase-Default-Privileges würden anon sonst Tabellenrechte geben;
--  RLS würde zwar auf 0 Zeilen schneiden, wir entziehen trotzdem hart.)
-- ═══════════════════════════════════════════════════════════════════════════

REVOKE ALL ON sis_assessments  FROM anon;
REVOKE ALL ON sis_themenfelder FROM anon;
REVOKE ALL ON sis_risikomatrix FROM anon;

-- Trigger-Funktionen nicht über PostgREST-RPC aufrufbar machen
REVOKE ALL ON FUNCTION prevent_locked_sis_edit() FROM anon, authenticated;
REVOKE ALL ON FUNCTION prevent_locked_sis_child_edit() FROM anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- TEIL 8: Dokumentation
-- ═══════════════════════════════════════════════════════════════════════════

COMMENT ON TABLE sis_assessments  IS 'SIS — Strukturierte Informationssammlung: Kopfsatz je Assessment (Eingangsfrage, Status, Sperre).';
COMMENT ON TABLE sis_themenfelder IS 'SIS-Themenfelder 1-6 (6 = Haushaltsführung nur ambulant): Sicht der Person + fachliche Einschätzung.';
COMMENT ON TABLE sis_risikomatrix IS 'SIS-Risikomatrix: Ersteinschätzung Dekubitus/Sturz/Inkontinenz/Schmerz/Ernährung + Bedarf an vertiefter Einschätzung.';
