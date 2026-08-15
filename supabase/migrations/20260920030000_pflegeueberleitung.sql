-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Pflegeüberleitungsbogen — strukturierte Übergabe an Klinik/
--            Kurzzeitpflege/Nachversorger bei Einweisung, Verlegung oder
--            Aufnahmestopp (Expertenstandard "Entlassungsmanagement").
-- Datum:     2026-08-15
-- Projekt:   Alltagsengel UG
-- IDEMPOTENT / RLS-Muster identisch zu 20260818030000_wunddokumentation.
-- Rollback:  20260920030001_rollback_pflegeueberleitung.sql
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS pflegeueberleitungen (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT current_org_id(),
  client_id       uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  anlass          text NOT NULL,
  ziel_einrichtung text,
  uebergabe_am     timestamptz NOT NULL DEFAULT now(),

  diagnosen                 text,
  medikamentenplan_beigefuegt boolean NOT NULL DEFAULT false,
  hilfsmittel                text,
  mobilitaet                 text,
  kommunikation               text,
  ernaehrung                  text,
  besonderheiten_pflege       text,
  risiken                     text,

  ansprechpartner_abgebend    text,
  ansprechpartner_uebernehmend text,

  dokumente_mitgegeben  jsonb NOT NULL DEFAULT '[]'::jsonb,

  status text NOT NULL DEFAULT 'entwurf',

  erstellt_von  uuid NOT NULL REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ueberleitung_anlass_check CHECK (anlass IN (
    'krankenhauseinweisung','kurzzeitpflege','verlegung_pflegeheim',
    'arztbesuch','reha','sonstige'
  )),
  CONSTRAINT ueberleitung_status_check CHECK (status IN ('entwurf','abgeschlossen')),
  CONSTRAINT ueberleitung_dokumente_array_check CHECK (jsonb_typeof(dokumente_mitgegeben) = 'array')
);

CREATE INDEX IF NOT EXISTS idx_pflegeueberleitungen_org    ON pflegeueberleitungen(organization_id);
CREATE INDEX IF NOT EXISTS idx_pflegeueberleitungen_client ON pflegeueberleitungen(client_id, uebergabe_am);

ALTER TABLE pflegeueberleitungen ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pflegeueberleitungen' AND policyname = 'admin_pflegeueberleitungen') THEN
    CREATE POLICY admin_pflegeueberleitungen ON pflegeueberleitungen FOR ALL
      USING (is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pflegeueberleitungen' AND policyname = 'org_fence_pflegeueberleitungen') THEN
    CREATE POLICY org_fence_pflegeueberleitungen ON pflegeueberleitungen AS RESTRICTIVE FOR ALL
      USING (organization_id = current_org_id());
  END IF;
  DROP POLICY IF EXISTS engel_pflegeueberleitungen_select ON pflegeueberleitungen;
  CREATE POLICY engel_pflegeueberleitungen_select ON pflegeueberleitungen FOR SELECT
    USING (engel_hat_aktiven_klienten(client_id));
END $$;

DROP TRIGGER IF EXISTS trg_updated_at_pflegeueberleitungen ON pflegeueberleitungen;
CREATE TRIGGER trg_updated_at_pflegeueberleitungen BEFORE UPDATE ON pflegeueberleitungen
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
