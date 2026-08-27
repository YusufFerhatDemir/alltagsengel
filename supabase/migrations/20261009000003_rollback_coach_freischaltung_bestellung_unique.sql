-- Rollback: 20261009000002_coach_freischaltung_bestellung_unique.sql

BEGIN;

DROP INDEX IF EXISTS idx_coach_freischaltungen_bestellung;
CREATE INDEX IF NOT EXISTS idx_coach_freischaltungen_bestellung
  ON coach_freischaltungen(bestellung_id) WHERE bestellung_id IS NOT NULL;

COMMIT;
