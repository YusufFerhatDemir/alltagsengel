-- ═══════════════════════════════════════════════════════════════
-- Aerzte & Praxen — Stammdatenverwaltung
-- Ersetzt die Freitext-Felder arzt_name/arzt_praxis in
-- Verordnungen durch eine normalisierte Arzt-/Praxis-Tabelle
-- mit LANR, BSNR und Kontaktdaten.
-- ═══════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Tabelle ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.aerzte_praxen (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  anrede          text,
  titel           text,
  vorname         text NOT NULL,
  nachname        text NOT NULL,
  fachrichtung    text,
  lanr            text CHECK (lanr IS NULL OR lanr ~ '^\d{9}$'),
  bsnr            text CHECK (bsnr IS NULL OR bsnr ~ '^\d{9}$'),
  praxis_name     text,
  strasse         text,
  plz             text,
  ort             text,
  telefon         text,
  fax             text,
  email           text,
  mobiltelefon    text,
  notizen         text,
  aktiv           boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ── 2. Indizes ────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_aerzte_praxen_org
  ON public.aerzte_praxen (organization_id);

CREATE INDEX IF NOT EXISTS idx_aerzte_praxen_name
  ON public.aerzte_praxen (nachname, vorname);

-- ── 3. updated_at Trigger ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.aerzte_praxen_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_aerzte_praxen_updated_at ON public.aerzte_praxen;
CREATE TRIGGER trg_aerzte_praxen_updated_at
  BEFORE UPDATE ON public.aerzte_praxen
  FOR EACH ROW EXECUTE FUNCTION public.aerzte_praxen_updated_at();

-- ── 4. RLS ────────────────────────────────────────────────────

ALTER TABLE public.aerzte_praxen ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  -- RESTRICTIVE org_fence: Mandantentrennung
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'aerzte_praxen' AND policyname = 'org_fence_aerzte_praxen') THEN
    CREATE POLICY org_fence_aerzte_praxen ON public.aerzte_praxen AS RESTRICTIVE FOR ALL
      USING (organization_id = current_org_id());
  END IF;

  -- Admin: Vollzugriff
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'aerzte_praxen' AND policyname = 'admin_aerzte_praxen_all') THEN
    CREATE POLICY admin_aerzte_praxen_all ON public.aerzte_praxen FOR ALL
      USING (is_admin());
  END IF;

  -- Engel: Leserecht (Aerzte-Kontakte nachschlagen)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'aerzte_praxen' AND policyname = 'engel_aerzte_praxen_select') THEN
    CREATE POLICY engel_aerzte_praxen_select ON public.aerzte_praxen FOR SELECT
      USING (auth.uid() IS NOT NULL AND aktiv = true);
  END IF;
END $$;

COMMIT;
