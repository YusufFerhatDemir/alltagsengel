-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Wunddokumentation (Expertenstandard "Pflege von Menschen mit
--            chronischen Wunden") — wounds, wound_assessments,
--            wound_treatments, wound_photos + privater Storage-Bucket
-- Datum:     2026-08-18
-- Projekt:   Alltagsengel UG
-- ═══════════════════════════════════════════════════════════════════════════
-- IDEMPOTENT: Alle Statements mit IF NOT EXISTS / IF EXISTS Guards.
-- BESTEHENDE DATEN: Keine Löschung, nur Erweiterung.
-- RLS:       is_admin() (SECURITY DEFINER, KEINE profiles-Subquery — 42P17!)
--            + org_fence current_org_id() RESTRICTIVE
--            + Engel-SELECT über aktive assignments.
-- Rollback:  20260818030001_rollback_wunddokumentation.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- TEIL 0: Engel-Zugriffs-Helper (SECURITY DEFINER)
-- ═══════════════════════════════════════════════════════════════════════════
-- Identisch zur Definition in 20260818010000_sis_* — CREATE OR REPLACE macht
-- die Apply-Reihenfolge egal. SECURITY DEFINER ist hier PFLICHT: eine rohe
-- assignments/caregivers-Subquery in der Policy löst deren eigene Policies
-- aus und endet in 42P17 (auf der Shadow-DB nachgewiesen).

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
-- TEIL 1: wounds — Wund-Stammdaten
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS wounds (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT current_org_id(),
  client_id       uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  -- Klassifikation
  wund_typ        text NOT NULL,
  dekubitus_grad  integer,

  -- Lokalisation (Körperschema)
  lokalisation        text NOT NULL,
  koerperstelle_code  text,
  koerperseite        text,

  -- Verlauf
  entstanden_am        date,
  erstdokumentation_am date NOT NULL DEFAULT CURRENT_DATE,
  status               text NOT NULL DEFAULT 'aktiv',
  abgeheilt_am         date,

  bemerkung     text,

  -- Audit
  erstellt_von  uuid NOT NULL REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT wounds_wund_typ_check CHECK (wund_typ IN (
    'dekubitus','ulcus_cruris','diabetisches_fusssyndrom','op_wunde','traumatische_wunde','sonstige'
  )),
  CONSTRAINT wounds_dekubitus_grad_check CHECK (
    dekubitus_grad IS NULL OR (dekubitus_grad BETWEEN 1 AND 4)
  ),
  -- Dekubitus-Grad nur bei Dekubitus
  CONSTRAINT wounds_grad_nur_dekubitus_check CHECK (
    dekubitus_grad IS NULL OR wund_typ = 'dekubitus'
  ),
  CONSTRAINT wounds_koerperseite_check CHECK (
    koerperseite IS NULL OR koerperseite IN ('links','rechts','mittig')
  ),
  CONSTRAINT wounds_status_check CHECK (status IN (
    'aktiv','in_abheilung','stagnierend','verschlechtert','abgeheilt'
  )),
  -- Abheilungsdatum genau dann, wenn Status abgeheilt
  CONSTRAINT wounds_abgeheilt_konsistenz_check CHECK (
    (status = 'abgeheilt') = (abgeheilt_am IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_wounds_org     ON wounds(organization_id);
CREATE INDEX IF NOT EXISTS idx_wounds_client  ON wounds(client_id);
CREATE INDEX IF NOT EXISTS idx_wounds_status  ON wounds(status);

ALTER TABLE wounds ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'wounds' AND policyname = 'admin_wounds') THEN
    CREATE POLICY admin_wounds ON wounds FOR ALL
      USING (is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'wounds' AND policyname = 'org_fence_wounds') THEN
    CREATE POLICY org_fence_wounds ON wounds AS RESTRICTIVE FOR ALL
      USING (organization_id = current_org_id());
  END IF;
  -- DROP+CREATE statt IF NOT EXISTS: ersetzt eine evtl. vorhandene Fassung
  -- mit roher assignments-Subquery (42P17-Gefahr) durch den SECDEF-Helper.
  DROP POLICY IF EXISTS engel_wounds_select ON wounds;
  CREATE POLICY engel_wounds_select ON wounds FOR SELECT
    USING (engel_hat_aktiven_klienten(client_id));
END $$;

DROP TRIGGER IF EXISTS trg_updated_at_wounds ON wounds;
CREATE TRIGGER trg_updated_at_wounds BEFORE UPDATE ON wounds
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ═══════════════════════════════════════════════════════════════════════════
-- TEIL 2: wound_assessments — Wundassessment (Einzelerhebung)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS wound_assessments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT current_org_id(),
  wound_id        uuid NOT NULL REFERENCES wounds(id) ON DELETE CASCADE,

  erhoben_am  timestamptz NOT NULL DEFAULT now(),
  erhoben_von uuid NOT NULL REFERENCES auth.users(id),

  -- Größe (cm)
  laenge_cm numeric(5,1),
  breite_cm numeric(5,1),
  tiefe_cm  numeric(5,1),

  -- Wundgrund (Anteile in %)
  wundgrund_granulation_pct integer,
  wundgrund_fibrin_pct      integer,
  wundgrund_nekrose_pct     integer,
  wundgrund_epithel_pct     integer,

  -- Wundrand / Umgebung
  wundrand       text,
  umgebungshaut  text,

  -- Exsudat
  exsudat_menge text,
  exsudat_art   text,

  geruch              text,
  schmerz_nrs         integer,
  infektionszeichen   boolean NOT NULL DEFAULT false,

  -- PUSH-Tool (0-17): Fläche 0-10, Exsudat 0-3, Gewebetyp 0-4
  push_flaeche_punkte integer,
  push_exsudat_punkte integer,
  push_gewebe_punkte  integer,
  push_gesamt         integer,

  bemerkung  text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT wa_laenge_check CHECK (laenge_cm IS NULL OR laenge_cm >= 0),
  CONSTRAINT wa_breite_check CHECK (breite_cm IS NULL OR breite_cm >= 0),
  CONSTRAINT wa_tiefe_check  CHECK (tiefe_cm  IS NULL OR tiefe_cm  >= 0),
  CONSTRAINT wa_granulation_pct_check CHECK (wundgrund_granulation_pct IS NULL OR wundgrund_granulation_pct BETWEEN 0 AND 100),
  CONSTRAINT wa_fibrin_pct_check      CHECK (wundgrund_fibrin_pct      IS NULL OR wundgrund_fibrin_pct      BETWEEN 0 AND 100),
  CONSTRAINT wa_nekrose_pct_check     CHECK (wundgrund_nekrose_pct     IS NULL OR wundgrund_nekrose_pct     BETWEEN 0 AND 100),
  CONSTRAINT wa_epithel_pct_check     CHECK (wundgrund_epithel_pct     IS NULL OR wundgrund_epithel_pct     BETWEEN 0 AND 100),
  CONSTRAINT wa_wundgrund_summe_check CHECK (
    COALESCE(wundgrund_granulation_pct,0) + COALESCE(wundgrund_fibrin_pct,0)
    + COALESCE(wundgrund_nekrose_pct,0) + COALESCE(wundgrund_epithel_pct,0) <= 100
  ),
  CONSTRAINT wa_exsudat_menge_check CHECK (exsudat_menge IS NULL OR exsudat_menge IN ('keine','wenig','maessig','viel')),
  CONSTRAINT wa_exsudat_art_check   CHECK (exsudat_art   IS NULL OR exsudat_art   IN ('seroes','blutig','seroes_blutig','eitrig','sonstige')),
  CONSTRAINT wa_geruch_check        CHECK (geruch        IS NULL OR geruch        IN ('kein','leicht','stark')),
  CONSTRAINT wa_schmerz_nrs_check   CHECK (schmerz_nrs   IS NULL OR schmerz_nrs BETWEEN 0 AND 10),
  CONSTRAINT wa_push_flaeche_check  CHECK (push_flaeche_punkte IS NULL OR push_flaeche_punkte BETWEEN 0 AND 10),
  CONSTRAINT wa_push_exsudat_check  CHECK (push_exsudat_punkte IS NULL OR push_exsudat_punkte BETWEEN 0 AND 3),
  CONSTRAINT wa_push_gewebe_check   CHECK (push_gewebe_punkte  IS NULL OR push_gewebe_punkte  BETWEEN 0 AND 4),
  CONSTRAINT wa_push_gesamt_check   CHECK (push_gesamt         IS NULL OR push_gesamt         BETWEEN 0 AND 17)
);

CREATE INDEX IF NOT EXISTS idx_wound_assessments_org   ON wound_assessments(organization_id);
CREATE INDEX IF NOT EXISTS idx_wound_assessments_wound ON wound_assessments(wound_id, erhoben_am);

ALTER TABLE wound_assessments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'wound_assessments' AND policyname = 'admin_wound_assessments') THEN
    CREATE POLICY admin_wound_assessments ON wound_assessments FOR ALL
      USING (is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'wound_assessments' AND policyname = 'org_fence_wound_assessments') THEN
    CREATE POLICY org_fence_wound_assessments ON wound_assessments AS RESTRICTIVE FOR ALL
      USING (organization_id = current_org_id());
  END IF;
  DROP POLICY IF EXISTS engel_wound_assessments_select ON wound_assessments;
  CREATE POLICY engel_wound_assessments_select ON wound_assessments FOR SELECT
    USING (EXISTS (
      SELECT 1 FROM wounds w
      WHERE w.id = wound_id AND engel_hat_aktiven_klienten(w.client_id)
    ));
END $$;

DROP TRIGGER IF EXISTS trg_updated_at_wound_assessments ON wound_assessments;
CREATE TRIGGER trg_updated_at_wound_assessments BEFORE UPDATE ON wound_assessments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ═══════════════════════════════════════════════════════════════════════════
-- TEIL 3: wound_treatments — Wundversorgung / Verbandwechsel-Protokoll
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS wound_treatments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT current_org_id(),
  wound_id        uuid NOT NULL REFERENCES wounds(id) ON DELETE CASCADE,

  durchgefuehrt_am  timestamptz NOT NULL DEFAULT now(),
  durchgefuehrt_von uuid NOT NULL REFERENCES auth.users(id),

  massnahme         text NOT NULL,
  wundreinigung     text,
  -- Verwendete Materialien: [{"name": "...", "menge": "..."}]
  materialien       jsonb NOT NULL DEFAULT '[]'::jsonb,
  schmerzmittel_gegeben boolean NOT NULL DEFAULT false,
  besonderheiten    text,

  naechster_vw_am   date,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT wt_materialien_array_check CHECK (jsonb_typeof(materialien) = 'array')
);

CREATE INDEX IF NOT EXISTS idx_wound_treatments_org   ON wound_treatments(organization_id);
CREATE INDEX IF NOT EXISTS idx_wound_treatments_wound ON wound_treatments(wound_id, durchgefuehrt_am);
CREATE INDEX IF NOT EXISTS idx_wound_treatments_vw    ON wound_treatments(naechster_vw_am);

ALTER TABLE wound_treatments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'wound_treatments' AND policyname = 'admin_wound_treatments') THEN
    CREATE POLICY admin_wound_treatments ON wound_treatments FOR ALL
      USING (is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'wound_treatments' AND policyname = 'org_fence_wound_treatments') THEN
    CREATE POLICY org_fence_wound_treatments ON wound_treatments AS RESTRICTIVE FOR ALL
      USING (organization_id = current_org_id());
  END IF;
  DROP POLICY IF EXISTS engel_wound_treatments_select ON wound_treatments;
  CREATE POLICY engel_wound_treatments_select ON wound_treatments FOR SELECT
    USING (EXISTS (
      SELECT 1 FROM wounds w
      WHERE w.id = wound_id AND engel_hat_aktiven_klienten(w.client_id)
    ));
END $$;

DROP TRIGGER IF EXISTS trg_updated_at_wound_treatments ON wound_treatments;
CREATE TRIGGER trg_updated_at_wound_treatments BEFORE UPDATE ON wound_treatments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ═══════════════════════════════════════════════════════════════════════════
-- TEIL 4: wound_photos — Fotodokumentation (Metadaten; Binärdaten im Bucket)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS wound_photos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT current_org_id(),
  wound_id        uuid NOT NULL REFERENCES wounds(id) ON DELETE CASCADE,
  assessment_id   uuid REFERENCES wound_assessments(id) ON DELETE SET NULL,

  bucket             text NOT NULL DEFAULT 'wound-photos',
  dateipfad          text NOT NULL,
  dateiname          text NOT NULL,
  mime_type          text NOT NULL,
  dateigroesse_bytes bigint,

  aufgenommen_am  timestamptz NOT NULL DEFAULT now(),
  aufgenommen_von uuid NOT NULL REFERENCES auth.users(id),
  bemerkung       text,

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT wp_dateipfad_unique UNIQUE (bucket, dateipfad)
);

CREATE INDEX IF NOT EXISTS idx_wound_photos_org   ON wound_photos(organization_id);
CREATE INDEX IF NOT EXISTS idx_wound_photos_wound ON wound_photos(wound_id, aufgenommen_am);

ALTER TABLE wound_photos ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'wound_photos' AND policyname = 'admin_wound_photos') THEN
    CREATE POLICY admin_wound_photos ON wound_photos FOR ALL
      USING (is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'wound_photos' AND policyname = 'org_fence_wound_photos') THEN
    CREATE POLICY org_fence_wound_photos ON wound_photos AS RESTRICTIVE FOR ALL
      USING (organization_id = current_org_id());
  END IF;
  DROP POLICY IF EXISTS engel_wound_photos_select ON wound_photos;
  CREATE POLICY engel_wound_photos_select ON wound_photos FOR SELECT
    USING (EXISTS (
      SELECT 1 FROM wounds w
      WHERE w.id = wound_id AND engel_hat_aktiven_klienten(w.client_id)
    ));
END $$;


-- ═══════════════════════════════════════════════════════════════════════════
-- TEIL 5: Storage-Bucket wound-photos (PRIVATE)
-- ═══════════════════════════════════════════════════════════════════════════
-- Zugriff ausschließlich serverseitig (service_role) + kurzlebige Signed URLs —
-- wie vertraege/kunden-dokumente. Keine storage.objects-Policies für
-- anon/authenticated: privater Bucket ohne Policies = kein direkter Zugriff.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('wound-photos', 'wound-photos', false, 10485760,
        ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
ON CONFLICT (id) DO NOTHING;
