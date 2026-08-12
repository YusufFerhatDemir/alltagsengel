-- ═══════════════════════════════════════════════════════════════
-- Medikamentenmanagement — erweiterte Tabellen
-- Ersetzt die alte B2C-Tabelle medikamentenplan durch eine
-- vollständige Medikamentenverwaltung mit Verabreichungs-Log.
-- ═══════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Neue Tabelle: medikamente (ersetzt medikamentenplan) ─────

CREATE TABLE IF NOT EXISTS public.medikamente (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id     uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  medikament_name text NOT NULL,
  wirkstoff     text,
  pzn           text CHECK (pzn IS NULL OR pzn ~ '^\d{7,8}$'),
  kategorie     text NOT NULL DEFAULT 'sonstige'
                CHECK (kategorie IN (
                  'herz_kreislauf','schmerz','psychopharmaka','antibiotika',
                  'diabetes','atemwege','magen_darm','hormone',
                  'blutgerinnung','sonstige'
                )),
  darreichungsform text,
  dosierung     text NOT NULL,
  einheit       text NOT NULL DEFAULT 'mg',
  einnahme_morgens  boolean NOT NULL DEFAULT false,
  einnahme_mittags  boolean NOT NULL DEFAULT false,
  einnahme_abends   boolean NOT NULL DEFAULT false,
  einnahme_nachts   boolean NOT NULL DEFAULT false,
  einnahme_hinweis  text,
  verordnet_von text,
  beginn_datum  date,
  end_datum     date,
  dauermedikation boolean NOT NULL DEFAULT true,
  status        text NOT NULL DEFAULT 'aktiv'
                CHECK (status IN ('aktiv','pausiert','abgesetzt')),
  abgesetzt_am  timestamptz,
  abgesetzt_grund text,
  notizen       text,
  created_by    uuid REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT einnahme_mindestens_eine CHECK (
    einnahme_morgens OR einnahme_mittags OR einnahme_abends OR einnahme_nachts
  ),
  CONSTRAINT datum_konsistenz CHECK (
    beginn_datum IS NULL OR end_datum IS NULL OR beginn_datum <= end_datum
  )
);

CREATE INDEX IF NOT EXISTS idx_medikamente_client
  ON public.medikamente(client_id);
CREATE INDEX IF NOT EXISTS idx_medikamente_org
  ON public.medikamente(organization_id);
CREATE INDEX IF NOT EXISTS idx_medikamente_status
  ON public.medikamente(status) WHERE status = 'aktiv';

-- ── 2. Verabreichungs-Log ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.medikament_eingaben (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  medikament_id uuid NOT NULL REFERENCES public.medikamente(id) ON DELETE CASCADE,
  client_id     uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  einnahme_zeit text NOT NULL CHECK (einnahme_zeit IN ('morgens','mittags','abends','nachts')),
  geplant_um    timestamptz NOT NULL,
  gegeben_um    timestamptz,
  gegeben_von   uuid REFERENCES auth.users(id),
  status        text NOT NULL DEFAULT 'geplant'
                CHECK (status IN ('geplant','gegeben','verweigert','ausgelassen')),
  verweigert_grund text,
  notizen       text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_med_eingaben_medikament
  ON public.medikament_eingaben(medikament_id);
CREATE INDEX IF NOT EXISTS idx_med_eingaben_client_datum
  ON public.medikament_eingaben(client_id, geplant_um DESC);
CREATE INDEX IF NOT EXISTS idx_med_eingaben_org
  ON public.medikament_eingaben(organization_id);

-- ── 3. RLS ──────────────────────────────────────────────────────

ALTER TABLE public.medikamente ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medikament_eingaben ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  -- Org-Fence (RESTRICTIVE)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'medikamente' AND policyname = 'org_fence_medikamente') THEN
    CREATE POLICY org_fence_medikamente ON medikamente AS RESTRICTIVE FOR ALL
      USING (organization_id = current_org_id());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'medikament_eingaben' AND policyname = 'org_fence_medikament_eingaben') THEN
    CREATE POLICY org_fence_medikament_eingaben ON medikament_eingaben AS RESTRICTIVE FOR ALL
      USING (organization_id = current_org_id());
  END IF;

  -- Admin: Vollzugriff
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'medikamente' AND policyname = 'admin_medikamente_all') THEN
    CREATE POLICY admin_medikamente_all ON medikamente FOR ALL
      USING (is_admin());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'medikament_eingaben' AND policyname = 'admin_med_eingaben_all') THEN
    CREATE POLICY admin_med_eingaben_all ON medikament_eingaben FOR ALL
      USING (is_admin());
  END IF;

  -- Engel: Lesen + Eingaben erfassen für zugewiesene Klienten
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'medikamente' AND policyname = 'engel_medikamente_select') THEN
    CREATE POLICY engel_medikamente_select ON medikamente FOR SELECT
      USING (client_id IN (
        SELECT a.client_id FROM assignments a
        WHERE a.caregiver_id IN (SELECT eigene_caregiver_ids())
          AND a.status IN ('active','GEPLANT','BESTAETIGT','UNTERWEGS','GESTARTET')
      ));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'medikament_eingaben' AND policyname = 'engel_med_eingaben_select') THEN
    CREATE POLICY engel_med_eingaben_select ON medikament_eingaben FOR SELECT
      USING (client_id IN (
        SELECT a.client_id FROM assignments a
        WHERE a.caregiver_id IN (SELECT eigene_caregiver_ids())
          AND a.status IN ('active','GEPLANT','BESTAETIGT','UNTERWEGS','GESTARTET')
      ));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'medikament_eingaben' AND policyname = 'engel_med_eingaben_insert') THEN
    CREATE POLICY engel_med_eingaben_insert ON medikament_eingaben FOR INSERT
      WITH CHECK (gegeben_von = auth.uid() AND client_id IN (
        SELECT a.client_id FROM assignments a
        WHERE a.caregiver_id IN (SELECT eigene_caregiver_ids())
          AND a.status IN ('active','GEPLANT','BESTAETIGT','UNTERWEGS','GESTARTET')
      ));
  END IF;

END $$;

COMMIT;
