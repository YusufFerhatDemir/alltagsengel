-- ════════════════════════════════════════════════════════════════════
-- Block 19 — Erweiterte Analytics & Reporting: Bonussystem
-- ════════════════════════════════════════════════════════════════════
--
-- Neue Tabellen für den automatisierten Bonuslauf, ergänzend zum
-- bestehenden manuellen caregiver_bonuses-System (bleibt unangetastet):
--   1) bonus_regeln        — konfigurierbares Regelwerk (Kriterium,
--                             Schwellenwert, Punkte). KEINE hartcodierten
--                             Beträge/Prozentsätze im Code.
--   2) bonus_berechnungen  — Ergebnis eines Berechnungslaufs je
--                             Regel/Kraft/Zeitraum.
--   3) bonus_freigaben     — Freigabe-Workflow (Entscheidung + Historie).
--
-- Idempotent (CREATE TABLE IF NOT EXISTS, DO-Block-Guards für Policies).
-- org_fence-Muster analog 20260826010000_dipa_freischaltung_nachweise_eul.sql.
-- ════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- 1) bonus_regeln
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bonus_regeln (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL DEFAULT current_org_id() REFERENCES public.organizations(id),

  name             text NOT NULL,
  kriterium_typ    text NOT NULL CHECK (kriterium_typ IN (
                     'keine_ausfaelle', 'vollstaendige_dokumentation', 'keine_offenen_pruefungen'
                   )),
  schwellenwert    numeric NOT NULL,
  punkte           integer NOT NULL CHECK (punkte > 0),
  aktiv            boolean NOT NULL DEFAULT true,

  created_by       uuid REFERENCES auth.users(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bonus_regeln_org ON public.bonus_regeln(organization_id);
CREATE INDEX IF NOT EXISTS idx_bonus_regeln_aktiv ON public.bonus_regeln(organization_id, aktiv);

ALTER TABLE public.bonus_regeln ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bonus_regeln' AND policyname = 'admin_bonus_regeln') THEN
    CREATE POLICY admin_bonus_regeln ON public.bonus_regeln FOR ALL TO authenticated
      USING (is_admin()) WITH CHECK (is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bonus_regeln' AND policyname = 'org_fence_bonus_regeln') THEN
    CREATE POLICY org_fence_bonus_regeln ON public.bonus_regeln AS RESTRICTIVE FOR ALL TO authenticated
      USING (organization_id = current_org_id());
  END IF;
END $$;

REVOKE ALL ON public.bonus_regeln FROM anon;

DROP TRIGGER IF EXISTS trg_updated_at_bonus_regeln ON public.bonus_regeln;
CREATE TRIGGER trg_updated_at_bonus_regeln BEFORE UPDATE ON public.bonus_regeln
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─────────────────────────────────────────────────────────────────────
-- 2) bonus_berechnungen
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bonus_berechnungen (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL DEFAULT current_org_id() REFERENCES public.organizations(id),

  regel_id         uuid NOT NULL REFERENCES public.bonus_regeln(id) ON DELETE CASCADE,
  caregiver_id     uuid NOT NULL REFERENCES public.caregivers(id) ON DELETE CASCADE,

  zeitraum_von     date NOT NULL,
  zeitraum_bis     date NOT NULL,

  erfuellt         boolean NOT NULL,
  messwert         numeric,
  punkte           integer NOT NULL DEFAULT 0,
  status           text NOT NULL DEFAULT 'berechnet' CHECK (status IN (
                     'berechnet', 'freigegeben', 'abgelehnt', 'ausgezahlt'
                   )),

  berechnet_am     timestamptz NOT NULL DEFAULT now(),
  berechnet_von    uuid REFERENCES auth.users(id),
  details          jsonb,

  CONSTRAINT bonus_berechnungen_zeitraum_check CHECK (zeitraum_bis >= zeitraum_von),
  CONSTRAINT bonus_berechnungen_unique UNIQUE (regel_id, caregiver_id, zeitraum_von, zeitraum_bis)
);

CREATE INDEX IF NOT EXISTS idx_bonus_berechnungen_org ON public.bonus_berechnungen(organization_id);
CREATE INDEX IF NOT EXISTS idx_bonus_berechnungen_status ON public.bonus_berechnungen(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_bonus_berechnungen_caregiver ON public.bonus_berechnungen(caregiver_id);

ALTER TABLE public.bonus_berechnungen ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bonus_berechnungen' AND policyname = 'admin_bonus_berechnungen') THEN
    CREATE POLICY admin_bonus_berechnungen ON public.bonus_berechnungen FOR ALL TO authenticated
      USING (is_admin()) WITH CHECK (is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bonus_berechnungen' AND policyname = 'org_fence_bonus_berechnungen') THEN
    CREATE POLICY org_fence_bonus_berechnungen ON public.bonus_berechnungen AS RESTRICTIVE FOR ALL TO authenticated
      USING (organization_id = current_org_id());
  END IF;
END $$;

REVOKE ALL ON public.bonus_berechnungen FROM anon;

-- ─────────────────────────────────────────────────────────────────────
-- 3) bonus_freigaben
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bonus_freigaben (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL DEFAULT current_org_id() REFERENCES public.organizations(id),

  berechnung_id    uuid NOT NULL REFERENCES public.bonus_berechnungen(id) ON DELETE CASCADE,
  entscheidung     text NOT NULL CHECK (entscheidung IN ('freigegeben', 'abgelehnt')),
  kommentar        text,

  entschieden_von  uuid NOT NULL REFERENCES auth.users(id),
  entschieden_am   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bonus_freigaben_org ON public.bonus_freigaben(organization_id);
CREATE INDEX IF NOT EXISTS idx_bonus_freigaben_berechnung ON public.bonus_freigaben(berechnung_id);

ALTER TABLE public.bonus_freigaben ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bonus_freigaben' AND policyname = 'admin_bonus_freigaben') THEN
    CREATE POLICY admin_bonus_freigaben ON public.bonus_freigaben FOR ALL TO authenticated
      USING (is_admin()) WITH CHECK (is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bonus_freigaben' AND policyname = 'org_fence_bonus_freigaben') THEN
    CREATE POLICY org_fence_bonus_freigaben ON public.bonus_freigaben AS RESTRICTIVE FOR ALL TO authenticated
      USING (organization_id = current_org_id());
  END IF;
END $$;

REVOKE ALL ON public.bonus_freigaben FROM anon;

COMMIT;
