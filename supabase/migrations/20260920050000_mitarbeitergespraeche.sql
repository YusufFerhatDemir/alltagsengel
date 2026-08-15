-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Mitarbeitergespräche-Tracking — Jahresgespräche, Probezeit-,
--            Feedback-, Ziel- und Konfliktgespräche mit Wiedervorlage.
-- Datum:     2026-08-15
-- Projekt:   Alltagsengel UG
-- IDEMPOTENT. Admin-only (keine Engel-Policy) — Personalangelegenheit,
-- analog personal_urlaubskonto, aber mit is_admin() statt roher
-- profiles-Subquery (42P17-sicher).
-- Rollback:  20260920050001_rollback_mitarbeitergespraeche.sql
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS mitarbeitergespraeche (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT current_org_id(),
  caregiver_id    uuid NOT NULL REFERENCES caregivers(id) ON DELETE CASCADE,

  gespraechsart text NOT NULL,
  datum         date NOT NULL DEFAULT CURRENT_DATE,
  teilnehmer    text,

  themen           text,
  ziele_vereinbart text,
  massnahmen       text,

  naechstes_gespraech_geplant_am date,

  status text NOT NULL DEFAULT 'geplant',
  vertraulich boolean NOT NULL DEFAULT true,

  erstellt_von  uuid NOT NULL REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT mag_gespraechsart_check CHECK (gespraechsart IN (
    'jahresgespraech','probezeitgespraech','feedbackgespraech',
    'zielvereinbarung','konfliktgespraech','austrittsgespraech','sonstiges'
  )),
  CONSTRAINT mag_status_check CHECK (status IN ('geplant','durchgefuehrt','abgesagt'))
);

CREATE INDEX IF NOT EXISTS idx_mag_org        ON mitarbeitergespraeche(organization_id);
CREATE INDEX IF NOT EXISTS idx_mag_caregiver   ON mitarbeitergespraeche(caregiver_id, datum);
CREATE INDEX IF NOT EXISTS idx_mag_naechstes   ON mitarbeitergespraeche(naechstes_gespraech_geplant_am);

ALTER TABLE mitarbeitergespraeche ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'mitarbeitergespraeche' AND policyname = 'admin_mitarbeitergespraeche') THEN
    CREATE POLICY admin_mitarbeitergespraeche ON mitarbeitergespraeche FOR ALL
      USING (is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'mitarbeitergespraeche' AND policyname = 'org_fence_mitarbeitergespraeche') THEN
    CREATE POLICY org_fence_mitarbeitergespraeche ON mitarbeitergespraeche AS RESTRICTIVE FOR ALL
      USING (organization_id = current_org_id());
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_updated_at_mitarbeitergespraeche ON mitarbeitergespraeche;
CREATE TRIGGER trg_updated_at_mitarbeitergespraeche BEFORE UPDATE ON mitarbeitergespraeche
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
