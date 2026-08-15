-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Biografiebogen — Lebensgeschichte/Gewohnheiten des Klienten für
--            biografieorientierte Pflege (Standard-Instrument in der
--            Pflegedokumentation, insb. bei Demenz relevant).
-- Datum:     2026-08-15
-- Projekt:   Alltagsengel UG
-- IDEMPOTENT / RLS-Muster identisch zu 20260818030000_wunddokumentation.
-- Ein Bogen pro Klient (UNIQUE client_id) — Verlauf über updated_at, keine
-- Versionshistorie (analog Anamnese/SIS: fortlaufend gepflegtes Dokument).
-- Rollback:  20260920020001_rollback_biografiebogen.sql
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS biografiebogen (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT current_org_id(),
  client_id       uuid NOT NULL UNIQUE REFERENCES clients(id) ON DELETE CASCADE,

  beruflicher_werdegang     text,
  familienstand             text,
  wichtige_bezugspersonen   text,
  lebensereignisse          text,
  gewohnheiten_tagesablauf  text,
  vorlieben                 text,
  abneigungen               text,
  glaubensrichtung_werte    text,
  hobbies_interessen        text,
  haustiere                 text,
  biografische_besonderheiten text,

  gesperrt      boolean NOT NULL DEFAULT false,

  erstellt_von  uuid NOT NULL REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_biografiebogen_org ON biografiebogen(organization_id);

ALTER TABLE biografiebogen ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'biografiebogen' AND policyname = 'admin_biografiebogen') THEN
    CREATE POLICY admin_biografiebogen ON biografiebogen FOR ALL
      USING (is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'biografiebogen' AND policyname = 'org_fence_biografiebogen') THEN
    CREATE POLICY org_fence_biografiebogen ON biografiebogen AS RESTRICTIVE FOR ALL
      USING (organization_id = current_org_id());
  END IF;
  DROP POLICY IF EXISTS engel_biografiebogen_select ON biografiebogen;
  CREATE POLICY engel_biografiebogen_select ON biografiebogen FOR SELECT
    USING (engel_hat_aktiven_klienten(client_id));
END $$;

DROP TRIGGER IF EXISTS trg_updated_at_biografiebogen ON biografiebogen;
CREATE TRIGGER trg_updated_at_biografiebogen BEFORE UPDATE ON biografiebogen
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
