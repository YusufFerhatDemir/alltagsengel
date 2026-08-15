-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Fixierungsprotokoll — freiheitsentziehende_massnahmen +
--            fem_ueberwachungen (Betreuungsrecht §1831 BGB / früher §1906 BGB:
--            Fixierungen/Bettgitter/sedierende Medikation brauchen
--            richterliche Genehmigung + dokumentierte Überwachung)
-- Datum:     2026-08-15
-- Projekt:   Alltagsengel UG
-- ═══════════════════════════════════════════════════════════════════════════
-- IDEMPOTENT: Alle Statements mit IF NOT EXISTS / IF EXISTS Guards.
-- RLS:       is_admin() (SECURITY DEFINER, KEINE profiles-Subquery — 42P17!)
--            + org_fence current_org_id() RESTRICTIVE
--            + Engel-SELECT über aktive assignments (engel_hat_aktiven_klienten,
--              identisch zu 20260818030000_wunddokumentation definiert).
-- Rollback:  20260920000001_rollback_freiheitsentziehende_massnahmen.sql
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.engel_hat_aktiven_klienten(p_client_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM assignments a
    JOIN caregivers cg ON cg.id = a.caregiver_id
    WHERE a.client_id = p_client_id
      AND cg.user_id = auth.uid()
      AND a.status IN ('active','GEPLANT','BESTAETIGT','UNTERWEGS','GESTARTET')
  );
$$;

REVOKE ALL ON FUNCTION public.engel_hat_aktiven_klienten(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.engel_hat_aktiven_klienten(uuid) TO authenticated, service_role;


-- ═══════════════════════════════════════════════════════════════════════════
-- TEIL 1: freiheitsentziehende_massnahmen — Stammdaten der Maßnahme
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS freiheitsentziehende_massnahmen (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT current_org_id(),
  client_id       uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  art     text NOT NULL,
  grund   text NOT NULL,

  beginn_am timestamptz NOT NULL DEFAULT now(),
  ende_am   timestamptz,

  -- Rechtsgrundlage §1831 BGB
  richterlich_genehmigt      boolean NOT NULL DEFAULT false,
  genehmigung_aktenzeichen   text,
  genehmigung_gueltig_bis    date,
  eilfall                    boolean NOT NULL DEFAULT false,
  eilfall_nachtraeglich_beantragt_am date,

  einwilligung_betreuer  boolean NOT NULL DEFAULT false,
  betreuer_name          text,

  arzt_informiert boolean NOT NULL DEFAULT false,
  arzt_id         uuid REFERENCES aerzte_praxen(id) ON DELETE SET NULL,

  ueberwachungsintervall_minuten int NOT NULL DEFAULT 30,

  status            text NOT NULL DEFAULT 'aktiv',
  beendigungsgrund  text,

  bemerkung     text,
  erstellt_von  uuid NOT NULL REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT fem_art_check CHECK (art IN (
    'bettgitter','gurtfixierung','fixierweste','sedierende_medikation',
    'bewegungseinschraenkender_stuhl','einschliessung','sonstige'
  )),
  CONSTRAINT fem_status_check CHECK (status IN ('aktiv','beendet')),
  CONSTRAINT fem_ende_konsistenz_check CHECK ((status = 'beendet') = (ende_am IS NOT NULL)),
  CONSTRAINT fem_intervall_check CHECK (ueberwachungsintervall_minuten > 0),
  CONSTRAINT fem_zeitraum_check CHECK (ende_am IS NULL OR ende_am >= beginn_am)
);

CREATE INDEX IF NOT EXISTS idx_fem_org     ON freiheitsentziehende_massnahmen(organization_id);
CREATE INDEX IF NOT EXISTS idx_fem_client  ON freiheitsentziehende_massnahmen(client_id);
CREATE INDEX IF NOT EXISTS idx_fem_status  ON freiheitsentziehende_massnahmen(status);

ALTER TABLE freiheitsentziehende_massnahmen ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'freiheitsentziehende_massnahmen' AND policyname = 'admin_fem') THEN
    CREATE POLICY admin_fem ON freiheitsentziehende_massnahmen FOR ALL
      USING (is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'freiheitsentziehende_massnahmen' AND policyname = 'org_fence_fem') THEN
    CREATE POLICY org_fence_fem ON freiheitsentziehende_massnahmen AS RESTRICTIVE FOR ALL
      USING (organization_id = current_org_id());
  END IF;
  DROP POLICY IF EXISTS engel_fem_select ON freiheitsentziehende_massnahmen;
  CREATE POLICY engel_fem_select ON freiheitsentziehende_massnahmen FOR SELECT
    USING (engel_hat_aktiven_klienten(client_id));
END $$;

DROP TRIGGER IF EXISTS trg_updated_at_fem ON freiheitsentziehende_massnahmen;
CREATE TRIGGER trg_updated_at_fem BEFORE UPDATE ON freiheitsentziehende_massnahmen
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ═══════════════════════════════════════════════════════════════════════════
-- TEIL 2: fem_ueberwachungen — periodische Kontrolle während der Maßnahme
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS fem_ueberwachungen (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT current_org_id(),
  massnahme_id    uuid NOT NULL REFERENCES freiheitsentziehende_massnahmen(id) ON DELETE CASCADE,

  kontrolliert_am  timestamptz NOT NULL DEFAULT now(),
  kontrolliert_von uuid NOT NULL REFERENCES auth.users(id),

  zustand_klient                text,
  verletzungen                  boolean NOT NULL DEFAULT false,
  verletzungen_beschreibung     text,
  massnahme_weiterhin_erforderlich boolean NOT NULL DEFAULT true,

  bemerkung  text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fem_ueberwachungen_org       ON fem_ueberwachungen(organization_id);
CREATE INDEX IF NOT EXISTS idx_fem_ueberwachungen_massnahme ON fem_ueberwachungen(massnahme_id, kontrolliert_am);

ALTER TABLE fem_ueberwachungen ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'fem_ueberwachungen' AND policyname = 'admin_fem_ueberwachungen') THEN
    CREATE POLICY admin_fem_ueberwachungen ON fem_ueberwachungen FOR ALL
      USING (is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'fem_ueberwachungen' AND policyname = 'org_fence_fem_ueberwachungen') THEN
    CREATE POLICY org_fence_fem_ueberwachungen ON fem_ueberwachungen AS RESTRICTIVE FOR ALL
      USING (organization_id = current_org_id());
  END IF;
  DROP POLICY IF EXISTS engel_fem_ueberwachungen_select ON fem_ueberwachungen;
  CREATE POLICY engel_fem_ueberwachungen_select ON fem_ueberwachungen FOR SELECT
    USING (EXISTS (
      SELECT 1 FROM freiheitsentziehende_massnahmen m
      WHERE m.id = massnahme_id AND engel_hat_aktiven_klienten(m.client_id)
    ));
  DROP POLICY IF EXISTS engel_fem_ueberwachungen_insert ON fem_ueberwachungen;
  CREATE POLICY engel_fem_ueberwachungen_insert ON fem_ueberwachungen FOR INSERT
    WITH CHECK (
      kontrolliert_von = auth.uid()
      AND EXISTS (
        SELECT 1 FROM freiheitsentziehende_massnahmen m
        WHERE m.id = massnahme_id AND engel_hat_aktiven_klienten(m.client_id)
      )
    );
END $$;
