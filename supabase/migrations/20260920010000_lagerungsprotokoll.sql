-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Lagerungsprotokoll — Umlagerung/Positionswechsel zur
--            Dekubitusprophylaxe (Expertenstandard "Dekubitusprophylaxe
--            in der Pflege"). Ergänzt wounds/wound_assessments um die
--            präventive Seite (Prophylaxe statt bereits eingetretener Wunde).
-- Datum:     2026-08-15
-- Projekt:   Alltagsengel UG
-- IDEMPOTENT / RLS-Muster identisch zu 20260818030000_wunddokumentation.
-- Rollback:  20260920010001_rollback_lagerungsprotokoll.sql
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS lagerungsprotokolle (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT current_org_id(),
  client_id       uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  position  text NOT NULL,

  durchgefuehrt_am  timestamptz NOT NULL DEFAULT now(),
  durchgefuehrt_von uuid NOT NULL REFERENCES auth.users(id),

  hautzustand              text,
  dekubitusrisiko_auffaellig boolean NOT NULL DEFAULT false,
  hilfsmittel               text,

  naechste_lagerung_geplant_am timestamptz,

  bemerkung  text,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT lagerung_position_check CHECK (position IN (
    'rueckenlage','seitenlage_links','seitenlage_rechts','bauchlage',
    '30grad_schraeglage_links','30grad_schraeglage_rechts','sitzend','mikrolagerung'
  ))
);

CREATE INDEX IF NOT EXISTS idx_lagerungsprotokolle_org     ON lagerungsprotokolle(organization_id);
CREATE INDEX IF NOT EXISTS idx_lagerungsprotokolle_client  ON lagerungsprotokolle(client_id, durchgefuehrt_am);
CREATE INDEX IF NOT EXISTS idx_lagerungsprotokolle_naechste ON lagerungsprotokolle(naechste_lagerung_geplant_am);

ALTER TABLE lagerungsprotokolle ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'lagerungsprotokolle' AND policyname = 'admin_lagerungsprotokolle') THEN
    CREATE POLICY admin_lagerungsprotokolle ON lagerungsprotokolle FOR ALL
      USING (is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'lagerungsprotokolle' AND policyname = 'org_fence_lagerungsprotokolle') THEN
    CREATE POLICY org_fence_lagerungsprotokolle ON lagerungsprotokolle AS RESTRICTIVE FOR ALL
      USING (organization_id = current_org_id());
  END IF;
  DROP POLICY IF EXISTS engel_lagerungsprotokolle_select ON lagerungsprotokolle;
  CREATE POLICY engel_lagerungsprotokolle_select ON lagerungsprotokolle FOR SELECT
    USING (engel_hat_aktiven_klienten(client_id));
  DROP POLICY IF EXISTS engel_lagerungsprotokolle_insert ON lagerungsprotokolle;
  CREATE POLICY engel_lagerungsprotokolle_insert ON lagerungsprotokolle FOR INSERT
    WITH CHECK (durchgefuehrt_von = auth.uid() AND engel_hat_aktiven_klienten(client_id));
END $$;
