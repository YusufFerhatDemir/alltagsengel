-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Pflegedokumentation + Kundenaufnahme + Stammdaten + Anamnese
--            + Maßnahmenplan + Verlaufsdokumentation
-- Datum:     2026-08-10
-- Projekt:   Alltagsengel UG
-- ═══════════════════════════════════════════════════════════════════════════
-- IDEMPOTENT: Alle Statements mit IF NOT EXISTS / IF EXISTS Guards.
-- BESTEHENDE DATEN: Keine Löschung, nur Erweiterung.
-- org_fence: Alle neuen Tabellen nutzen current_org_id() RESTRICTIVE.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- TEIL 1: Erweiterte Stammdaten auf clients
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE clients ADD COLUMN IF NOT EXISTS wohnsituation text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS kommunikation_hinweise text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS familienstand text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS staatsangehoerigkeit text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS religionszugehoerigkeit text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS aufnahmedatum date;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS aufgenommen_von uuid REFERENCES auth.users(id);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS aufnahmestatus text DEFAULT 'offen';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS betreuungsbedarf_beschreibung text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS individuelle_wuensche text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS schluesseluebergabe boolean DEFAULT false;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS haustiere text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS wohnungsbesonderheiten text;

-- Check constraints (nur wenn sie noch nicht existieren)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clients_aufnahmestatus_check') THEN
    ALTER TABLE clients ADD CONSTRAINT clients_aufnahmestatus_check
      CHECK (aufnahmestatus IN ('offen','in_bearbeitung','vollstaendig','abgelehnt','archiviert'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clients_familienstand_check') THEN
    ALTER TABLE clients ADD CONSTRAINT clients_familienstand_check
      CHECK (familienstand IS NULL OR familienstand IN ('ledig','verheiratet','geschieden','verwitwet','getrennt_lebend','eingetragene_lebenspartnerschaft'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clients_wohnsituation_check') THEN
    ALTER TABLE clients ADD CONSTRAINT clients_wohnsituation_check
      CHECK (wohnsituation IS NULL OR wohnsituation IN ('alleinlebend','mit_partner','mit_angehoerigen','betreutes_wohnen','pflegeheim','wg','sonstiges'));
  END IF;
END $$;


-- ═══════════════════════════════════════════════════════════════════════════
-- TEIL 2: pflege_aufnahmen — Strukturierte Kundenaufnahme
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS pflege_aufnahmen (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT current_org_id(),
  client_id       uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  -- Aufnahme-Metadaten
  aufnahmedatum        date NOT NULL DEFAULT CURRENT_DATE,
  aufgenommen_von      uuid NOT NULL REFERENCES auth.users(id),
  aufnahme_ort         text DEFAULT 'wohnung',
  status               text NOT NULL DEFAULT 'entwurf',

  -- Pflegesituation bei Aufnahme
  pflegegrad_bei_aufnahme   integer,
  vorherige_versorgung      text,
  grund_der_anfrage         text,
  dringlichkeit             text DEFAULT 'normal',

  -- Wohnsituation
  wohnsituation_details     text,
  stockwerk                 text,
  aufzug_vorhanden          boolean,
  barrierefrei              boolean,
  schluesselregelung         text,

  -- Versorgungsbedarf
  betreuungsbedarf          text,
  gewuenschte_zeiten        text,
  gewuenschte_haeufigkeit   text,
  besondere_anforderungen   text,

  -- Ergebnis
  empfehlung               text,
  abschluss_bemerkung      text,
  abgeschlossen_am         timestamptz,
  abgeschlossen_von        uuid REFERENCES auth.users(id),

  -- Audit
  erstellt_von  uuid NOT NULL REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT pflege_aufnahmen_status_check CHECK (status IN ('entwurf','in_bearbeitung','abgeschlossen','storniert')),
  CONSTRAINT pflege_aufnahmen_dringlichkeit_check CHECK (dringlichkeit IN ('normal','dringend','notfall')),
  CONSTRAINT pflege_aufnahmen_aufnahme_ort_check CHECK (aufnahme_ort IN ('wohnung','buero','telefonisch','video','sonstiges'))
);

CREATE INDEX IF NOT EXISTS idx_pflege_aufnahmen_client ON pflege_aufnahmen(client_id);
CREATE INDEX IF NOT EXISTS idx_pflege_aufnahmen_org ON pflege_aufnahmen(organization_id);
CREATE INDEX IF NOT EXISTS idx_pflege_aufnahmen_status ON pflege_aufnahmen(status);

-- RLS
ALTER TABLE pflege_aufnahmen ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pflege_aufnahmen' AND policyname = 'admin_pflege_aufnahmen') THEN
    CREATE POLICY admin_pflege_aufnahmen ON pflege_aufnahmen FOR ALL
      USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pflege_aufnahmen' AND policyname = 'org_fence_pflege_aufnahmen') THEN
    CREATE POLICY org_fence_pflege_aufnahmen ON pflege_aufnahmen AS RESTRICTIVE FOR ALL
      USING (organization_id = current_org_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pflege_aufnahmen' AND policyname = 'engel_pflege_aufnahmen_select') THEN
    CREATE POLICY engel_pflege_aufnahmen_select ON pflege_aufnahmen FOR SELECT
      USING (client_id IN (
        SELECT a.client_id FROM assignments a
        JOIN caregivers cg ON cg.id = a.caregiver_id
        WHERE cg.user_id = auth.uid() AND a.status IN ('active','GEPLANT','BESTAETIGT','UNTERWEGS','GESTARTET')
      ));
  END IF;
END $$;

-- Trigger
DROP TRIGGER IF EXISTS trg_updated_at_pflege_aufnahmen ON pflege_aufnahmen;
CREATE TRIGGER trg_updated_at_pflege_aufnahmen BEFORE UPDATE ON pflege_aufnahmen
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ═══════════════════════════════════════════════════════════════════════════
-- TEIL 3: pflege_anamnesen — Strukturierte Anamnese
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS pflege_anamnesen (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT current_org_id(),
  client_id       uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  -- Anamnesedaten
  anamnese_datum       date NOT NULL DEFAULT CURRENT_DATE,
  anamnese_typ         text NOT NULL DEFAULT 'erstanamnese',
  erhoben_von          uuid NOT NULL REFERENCES auth.users(id),
  erhoben_rolle        text,

  -- Körperlicher Zustand
  koerperlicher_zustand     text,
  mobilitaet                text,
  sturzrisiko               text DEFAULT 'unbekannt',
  schmerzen                 text,
  ernaehrungszustand        text,
  schluckbeschwerden        boolean DEFAULT false,
  inkontinenz               text,
  hautbild                  text,

  -- Kognition & Psyche
  orientierung              text,
  kommunikationsfaehigkeit  text,
  stimmungslage             text,
  verhaltensauffaelligkeiten text,
  nachtruhe                 text,

  -- Soziale Situation
  soziale_kontakte          text,
  tagesstruktur             text,
  hobbys_interessen         text,
  religioes_kulturell       text,

  -- Selbstversorgung
  koerperpflege             text,
  an_auskleiden             text,
  essen_trinken             text,
  hauswirtschaft            text,

  -- Freitextfelder
  zusammenfassung           text,
  besonderheiten            text,
  empfehlungen              text,

  -- Status
  status           text NOT NULL DEFAULT 'entwurf',
  abgeschlossen_am timestamptz,
  gesperrt         boolean NOT NULL DEFAULT false,

  -- Audit
  erstellt_von  uuid NOT NULL REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT pflege_anamnesen_typ_check CHECK (anamnese_typ IN ('erstanamnese','folgeanamnese','uebergabe','wiederaufnahme')),
  CONSTRAINT pflege_anamnesen_status_check CHECK (status IN ('entwurf','abgeschlossen','gesperrt')),
  CONSTRAINT pflege_anamnesen_sturzrisiko_check CHECK (sturzrisiko IN ('unbekannt','niedrig','mittel','hoch'))
);

CREATE INDEX IF NOT EXISTS idx_pflege_anamnesen_client ON pflege_anamnesen(client_id);
CREATE INDEX IF NOT EXISTS idx_pflege_anamnesen_org ON pflege_anamnesen(organization_id);

ALTER TABLE pflege_anamnesen ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pflege_anamnesen' AND policyname = 'admin_pflege_anamnesen') THEN
    CREATE POLICY admin_pflege_anamnesen ON pflege_anamnesen FOR ALL
      USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pflege_anamnesen' AND policyname = 'org_fence_pflege_anamnesen') THEN
    CREATE POLICY org_fence_pflege_anamnesen ON pflege_anamnesen AS RESTRICTIVE FOR ALL
      USING (organization_id = current_org_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pflege_anamnesen' AND policyname = 'engel_pflege_anamnesen_select') THEN
    CREATE POLICY engel_pflege_anamnesen_select ON pflege_anamnesen FOR SELECT
      USING (client_id IN (
        SELECT a.client_id FROM assignments a
        JOIN caregivers cg ON cg.id = a.caregiver_id
        WHERE cg.user_id = auth.uid() AND a.status IN ('active','GEPLANT','BESTAETIGT','UNTERWEGS','GESTARTET')
      ));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pflege_anamnesen' AND policyname = 'engel_pflege_anamnesen_insert') THEN
    CREATE POLICY engel_pflege_anamnesen_insert ON pflege_anamnesen FOR INSERT
      WITH CHECK (client_id IN (
        SELECT a.client_id FROM assignments a
        JOIN caregivers cg ON cg.id = a.caregiver_id
        WHERE cg.user_id = auth.uid() AND a.status IN ('active','GEPLANT','BESTAETIGT','UNTERWEGS','GESTARTET')
      ));
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_updated_at_pflege_anamnesen ON pflege_anamnesen;
CREATE TRIGGER trg_updated_at_pflege_anamnesen BEFORE UPDATE ON pflege_anamnesen
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ═══════════════════════════════════════════════════════════════════════════
-- TEIL 4: pflege_diagnosen — Diagnosen / Einschränkungen / Hinweise
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS pflege_diagnosen (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT current_org_id(),
  client_id       uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  diagnose_typ     text NOT NULL DEFAULT 'diagnose',
  bezeichnung      text NOT NULL,
  icd_code         text,
  beschreibung     text,
  diagnostiziert_am date,
  diagnostiziert_von text,
  schweregrad      text,
  aktiv            boolean NOT NULL DEFAULT true,
  betreuungsrelevant boolean NOT NULL DEFAULT true,
  hinweis_fuer_engel text,

  -- Audit
  erstellt_von  uuid NOT NULL REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT pflege_diagnosen_typ_check CHECK (diagnose_typ IN ('diagnose','einschraenkung','hinweis','chronisch','akut')),
  CONSTRAINT pflege_diagnosen_schweregrad_check CHECK (schweregrad IS NULL OR schweregrad IN ('leicht','mittel','schwer','kritisch'))
);

CREATE INDEX IF NOT EXISTS idx_pflege_diagnosen_client ON pflege_diagnosen(client_id);
CREATE INDEX IF NOT EXISTS idx_pflege_diagnosen_org ON pflege_diagnosen(organization_id);
CREATE INDEX IF NOT EXISTS idx_pflege_diagnosen_aktiv ON pflege_diagnosen(client_id, aktiv) WHERE aktiv = true;

ALTER TABLE pflege_diagnosen ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pflege_diagnosen' AND policyname = 'admin_pflege_diagnosen') THEN
    CREATE POLICY admin_pflege_diagnosen ON pflege_diagnosen FOR ALL
      USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pflege_diagnosen' AND policyname = 'org_fence_pflege_diagnosen') THEN
    CREATE POLICY org_fence_pflege_diagnosen ON pflege_diagnosen AS RESTRICTIVE FOR ALL
      USING (organization_id = current_org_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pflege_diagnosen' AND policyname = 'engel_pflege_diagnosen_select') THEN
    CREATE POLICY engel_pflege_diagnosen_select ON pflege_diagnosen FOR SELECT
      USING (betreuungsrelevant = true AND aktiv = true AND client_id IN (
        SELECT a.client_id FROM assignments a
        JOIN caregivers cg ON cg.id = a.caregiver_id
        WHERE cg.user_id = auth.uid() AND a.status IN ('active','GEPLANT','BESTAETIGT','UNTERWEGS','GESTARTET')
      ));
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_updated_at_pflege_diagnosen ON pflege_diagnosen;
CREATE TRIGGER trg_updated_at_pflege_diagnosen BEFORE UPDATE ON pflege_diagnosen
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ═══════════════════════════════════════════════════════════════════════════
-- TEIL 5: pflege_risiken — Allergien, Sturzrisiko, Notfallinformationen
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS pflege_risiken (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT current_org_id(),
  client_id       uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  risiko_typ       text NOT NULL,
  bezeichnung      text NOT NULL,
  beschreibung     text,
  schweregrad      text NOT NULL DEFAULT 'mittel',
  massnahmen       text,
  aktiv            boolean NOT NULL DEFAULT true,
  erkannt_am       date,
  erkannt_von      uuid REFERENCES auth.users(id),
  naechste_pruefung date,

  -- Audit
  erstellt_von  uuid NOT NULL REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT pflege_risiken_typ_check CHECK (risiko_typ IN ('allergie','unvertraeglichkeit','sturzrisiko','dekubitusrisiko','schluckrisiko','weglaufrisiko','aggressionsrisiko','infektionsrisiko','sonstiges')),
  CONSTRAINT pflege_risiken_schweregrad_check CHECK (schweregrad IN ('niedrig','mittel','hoch','kritisch'))
);

CREATE INDEX IF NOT EXISTS idx_pflege_risiken_client ON pflege_risiken(client_id);
CREATE INDEX IF NOT EXISTS idx_pflege_risiken_org ON pflege_risiken(organization_id);
CREATE INDEX IF NOT EXISTS idx_pflege_risiken_aktiv ON pflege_risiken(client_id, aktiv) WHERE aktiv = true;

ALTER TABLE pflege_risiken ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pflege_risiken' AND policyname = 'admin_pflege_risiken') THEN
    CREATE POLICY admin_pflege_risiken ON pflege_risiken FOR ALL
      USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pflege_risiken' AND policyname = 'org_fence_pflege_risiken') THEN
    CREATE POLICY org_fence_pflege_risiken ON pflege_risiken AS RESTRICTIVE FOR ALL
      USING (organization_id = current_org_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pflege_risiken' AND policyname = 'engel_pflege_risiken_select') THEN
    CREATE POLICY engel_pflege_risiken_select ON pflege_risiken FOR SELECT
      USING (aktiv = true AND client_id IN (
        SELECT a.client_id FROM assignments a
        JOIN caregivers cg ON cg.id = a.caregiver_id
        WHERE cg.user_id = auth.uid() AND a.status IN ('active','GEPLANT','BESTAETIGT','UNTERWEGS','GESTARTET')
      ));
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_updated_at_pflege_risiken ON pflege_risiken;
CREATE TRIGGER trg_updated_at_pflege_risiken BEFORE UPDATE ON pflege_risiken
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ═══════════════════════════════════════════════════════════════════════════
-- TEIL 6: pflege_massnahmenplaene — Maßnahmen-/Versorgungsplan
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS pflege_massnahmenplaene (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT current_org_id(),
  client_id       uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  titel            text NOT NULL,
  plan_typ         text NOT NULL DEFAULT 'versorgungsplan',
  gueltig_von      date NOT NULL DEFAULT CURRENT_DATE,
  gueltig_bis      date,
  version          integer NOT NULL DEFAULT 1,
  status           text NOT NULL DEFAULT 'entwurf',

  -- Ziele
  betreuungsziele  text,
  pflegeziele      text,

  -- Freigabe
  freigegeben_von   uuid REFERENCES auth.users(id),
  freigegeben_am    timestamptz,
  gesperrt          boolean NOT NULL DEFAULT false,

  -- Vorgänger (Versionskette)
  vorgaenger_id     uuid REFERENCES pflege_massnahmenplaene(id),

  -- Audit
  erstellt_von  uuid NOT NULL REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT pflege_massnahmenplaene_typ_check CHECK (plan_typ IN ('versorgungsplan','betreuungsplan','massnahmenplan','notfallplan')),
  CONSTRAINT pflege_massnahmenplaene_status_check CHECK (status IN ('entwurf','aktiv','abgelaufen','gesperrt','ersetzt'))
);

CREATE INDEX IF NOT EXISTS idx_pflege_massnahmenplaene_client ON pflege_massnahmenplaene(client_id);
CREATE INDEX IF NOT EXISTS idx_pflege_massnahmenplaene_org ON pflege_massnahmenplaene(organization_id);
CREATE INDEX IF NOT EXISTS idx_pflege_massnahmenplaene_aktiv ON pflege_massnahmenplaene(client_id, status) WHERE status = 'aktiv';

ALTER TABLE pflege_massnahmenplaene ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pflege_massnahmenplaene' AND policyname = 'admin_pflege_massnahmenplaene') THEN
    CREATE POLICY admin_pflege_massnahmenplaene ON pflege_massnahmenplaene FOR ALL
      USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pflege_massnahmenplaene' AND policyname = 'org_fence_pflege_massnahmenplaene') THEN
    CREATE POLICY org_fence_pflege_massnahmenplaene ON pflege_massnahmenplaene AS RESTRICTIVE FOR ALL
      USING (organization_id = current_org_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pflege_massnahmenplaene' AND policyname = 'engel_pflege_massnahmenplaene_select') THEN
    CREATE POLICY engel_pflege_massnahmenplaene_select ON pflege_massnahmenplaene FOR SELECT
      USING (status IN ('aktiv','abgelaufen') AND client_id IN (
        SELECT a.client_id FROM assignments a
        JOIN caregivers cg ON cg.id = a.caregiver_id
        WHERE cg.user_id = auth.uid() AND a.status IN ('active','GEPLANT','BESTAETIGT','UNTERWEGS','GESTARTET')
      ));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pflege_massnahmenplaene' AND policyname = 'kunde_pflege_massnahmenplaene_select') THEN
    CREATE POLICY kunde_pflege_massnahmenplaene_select ON pflege_massnahmenplaene FOR SELECT
      USING (status = 'aktiv' AND client_id IN (
        SELECT c.id FROM clients c WHERE c.user_id = auth.uid()
      ));
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_updated_at_pflege_massnahmenplaene ON pflege_massnahmenplaene;
CREATE TRIGGER trg_updated_at_pflege_massnahmenplaene BEFORE UPDATE ON pflege_massnahmenplaene
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ═══════════════════════════════════════════════════════════════════════════
-- TEIL 7: pflege_massnahmen — Einzelne Maßnahmen innerhalb eines Plans
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS pflege_massnahmen (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT current_org_id(),
  plan_id         uuid NOT NULL REFERENCES pflege_massnahmenplaene(id) ON DELETE CASCADE,

  kategorie        text NOT NULL,
  titel            text NOT NULL,
  beschreibung     text,
  ziel             text,
  haeufigkeit      text,
  verantwortlich   text,
  prioritaet       text NOT NULL DEFAULT 'normal',
  status           text NOT NULL DEFAULT 'geplant',
  beginn_datum     date,
  ende_datum       date,
  ergebnis         text,
  sortierung       integer NOT NULL DEFAULT 0,

  -- Audit
  erstellt_von  uuid NOT NULL REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT pflege_massnahmen_kategorie_check CHECK (kategorie IN ('koerperpflege','ernaehrung','mobilitaet','hauswirtschaft','soziale_betreuung','kognitive_foerderung','medikation','arztbesuche','kommunikation','sicherheit','sonstiges')),
  CONSTRAINT pflege_massnahmen_prioritaet_check CHECK (prioritaet IN ('niedrig','normal','hoch','dringend')),
  CONSTRAINT pflege_massnahmen_status_check CHECK (status IN ('geplant','aktiv','pausiert','abgeschlossen','abgebrochen'))
);

CREATE INDEX IF NOT EXISTS idx_pflege_massnahmen_plan ON pflege_massnahmen(plan_id);
CREATE INDEX IF NOT EXISTS idx_pflege_massnahmen_org ON pflege_massnahmen(organization_id);

ALTER TABLE pflege_massnahmen ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pflege_massnahmen' AND policyname = 'admin_pflege_massnahmen') THEN
    CREATE POLICY admin_pflege_massnahmen ON pflege_massnahmen FOR ALL
      USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pflege_massnahmen' AND policyname = 'org_fence_pflege_massnahmen') THEN
    CREATE POLICY org_fence_pflege_massnahmen ON pflege_massnahmen AS RESTRICTIVE FOR ALL
      USING (organization_id = current_org_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pflege_massnahmen' AND policyname = 'engel_pflege_massnahmen_select') THEN
    CREATE POLICY engel_pflege_massnahmen_select ON pflege_massnahmen FOR SELECT
      USING (plan_id IN (
        SELECT mp.id FROM pflege_massnahmenplaene mp
        JOIN assignments a ON a.client_id = mp.client_id
        JOIN caregivers cg ON cg.id = a.caregiver_id
        WHERE cg.user_id = auth.uid() AND a.status IN ('active','GEPLANT','BESTAETIGT','UNTERWEGS','GESTARTET')
        AND mp.status IN ('aktiv','abgelaufen')
      ));
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_updated_at_pflege_massnahmen ON pflege_massnahmen;
CREATE TRIGGER trg_updated_at_pflege_massnahmen BEFORE UPDATE ON pflege_massnahmen
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ═══════════════════════════════════════════════════════════════════════════
-- TEIL 8: pflege_verlauf — Verlaufs- und Ereignisdokumentation
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS pflege_verlauf (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT current_org_id(),
  client_id       uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  -- Eintrag
  eintrag_datum     timestamptz NOT NULL DEFAULT now(),
  eintrag_typ       text NOT NULL DEFAULT 'verlauf',
  kategorie         text NOT NULL DEFAULT 'allgemein',
  titel             text,
  inhalt            text NOT NULL,
  ist_dringend      boolean NOT NULL DEFAULT false,

  -- Verknüpfungen
  service_record_id uuid REFERENCES service_records(id),
  massnahme_id      uuid REFERENCES pflege_massnahmen(id),
  anamnese_id       uuid REFERENCES pflege_anamnesen(id),

  -- Autor
  autor_id          uuid NOT NULL REFERENCES auth.users(id),
  autor_name        text NOT NULL,
  autor_rolle       text NOT NULL,

  -- Sichtbarkeit
  sichtbarkeit      text NOT NULL DEFAULT 'intern',

  -- Lock (abgeschlossene Perioden)
  gesperrt          boolean NOT NULL DEFAULT false,
  gesperrt_am       timestamptz,
  gesperrt_von      uuid REFERENCES auth.users(id),

  -- Audit
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT pflege_verlauf_typ_check CHECK (eintrag_typ IN ('verlauf','ereignis','beobachtung','uebergabe','telefonat','arztbesuch','angehoerigenkontakt','besonderheit','sturz','notfall')),
  CONSTRAINT pflege_verlauf_kategorie_check CHECK (kategorie IN ('allgemein','koerperpflege','ernaehrung','mobilitaet','kognition','soziales','medikation','hauswirtschaft','kommunikation','stimmung','schmerz','schlaf','sonstiges')),
  CONSTRAINT pflege_verlauf_sichtbarkeit_check CHECK (sichtbarkeit IN ('intern','engel','kunde','alle'))
);

CREATE INDEX IF NOT EXISTS idx_pflege_verlauf_client ON pflege_verlauf(client_id);
CREATE INDEX IF NOT EXISTS idx_pflege_verlauf_org ON pflege_verlauf(organization_id);
CREATE INDEX IF NOT EXISTS idx_pflege_verlauf_datum ON pflege_verlauf(client_id, eintrag_datum DESC);
CREATE INDEX IF NOT EXISTS idx_pflege_verlauf_service ON pflege_verlauf(service_record_id) WHERE service_record_id IS NOT NULL;

ALTER TABLE pflege_verlauf ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pflege_verlauf' AND policyname = 'admin_pflege_verlauf') THEN
    CREATE POLICY admin_pflege_verlauf ON pflege_verlauf FOR ALL
      USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pflege_verlauf' AND policyname = 'org_fence_pflege_verlauf') THEN
    CREATE POLICY org_fence_pflege_verlauf ON pflege_verlauf AS RESTRICTIVE FOR ALL
      USING (organization_id = current_org_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pflege_verlauf' AND policyname = 'engel_pflege_verlauf_select') THEN
    CREATE POLICY engel_pflege_verlauf_select ON pflege_verlauf FOR SELECT
      USING (sichtbarkeit IN ('engel','alle') AND client_id IN (
        SELECT a.client_id FROM assignments a
        JOIN caregivers cg ON cg.id = a.caregiver_id
        WHERE cg.user_id = auth.uid() AND a.status IN ('active','GEPLANT','BESTAETIGT','UNTERWEGS','GESTARTET')
      ));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pflege_verlauf' AND policyname = 'engel_pflege_verlauf_insert') THEN
    CREATE POLICY engel_pflege_verlauf_insert ON pflege_verlauf FOR INSERT
      WITH CHECK (client_id IN (
        SELECT a.client_id FROM assignments a
        JOIN caregivers cg ON cg.id = a.caregiver_id
        WHERE cg.user_id = auth.uid() AND a.status IN ('active','GEPLANT','BESTAETIGT','UNTERWEGS','GESTARTET')
      ));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pflege_verlauf' AND policyname = 'kunde_pflege_verlauf_select') THEN
    CREATE POLICY kunde_pflege_verlauf_select ON pflege_verlauf FOR SELECT
      USING (sichtbarkeit IN ('kunde','alle') AND gesperrt = false AND client_id IN (
        SELECT c.id FROM clients c WHERE c.user_id = auth.uid()
      ));
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_updated_at_pflege_verlauf ON pflege_verlauf;
CREATE TRIGGER trg_updated_at_pflege_verlauf BEFORE UPDATE ON pflege_verlauf
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ═══════════════════════════════════════════════════════════════════════════
-- TEIL 9: pflege_doku_perioden — Monatsabschlüsse / Dokumentationssperren
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS pflege_doku_perioden (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT current_org_id(),
  client_id       uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  jahr             integer NOT NULL,
  monat            integer NOT NULL,
  status           text NOT NULL DEFAULT 'offen',

  -- Abschluss
  abgeschlossen_am   timestamptz,
  abgeschlossen_von  uuid REFERENCES auth.users(id),
  freigabe_bemerkung text,

  -- Wiederöffnung
  wiedereroeffnet_am  timestamptz,
  wiedereroeffnet_von uuid REFERENCES auth.users(id),
  wiedereroeffnung_grund text,

  -- Audit
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT pflege_doku_perioden_status_check CHECK (status IN ('offen','abgeschlossen','wiedereroeffnet')),
  CONSTRAINT pflege_doku_perioden_monat_check CHECK (monat BETWEEN 1 AND 12),
  CONSTRAINT pflege_doku_perioden_jahr_check CHECK (jahr BETWEEN 2020 AND 2099),
  CONSTRAINT pflege_doku_perioden_unique UNIQUE (organization_id, client_id, jahr, monat)
);

CREATE INDEX IF NOT EXISTS idx_pflege_doku_perioden_client ON pflege_doku_perioden(client_id);
CREATE INDEX IF NOT EXISTS idx_pflege_doku_perioden_org ON pflege_doku_perioden(organization_id);

ALTER TABLE pflege_doku_perioden ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pflege_doku_perioden' AND policyname = 'admin_pflege_doku_perioden') THEN
    CREATE POLICY admin_pflege_doku_perioden ON pflege_doku_perioden FOR ALL
      USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pflege_doku_perioden' AND policyname = 'org_fence_pflege_doku_perioden') THEN
    CREATE POLICY org_fence_pflege_doku_perioden ON pflege_doku_perioden AS RESTRICTIVE FOR ALL
      USING (organization_id = current_org_id());
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_updated_at_pflege_doku_perioden ON pflege_doku_perioden;
CREATE TRIGGER trg_updated_at_pflege_doku_perioden BEFORE UPDATE ON pflege_doku_perioden
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ═══════════════════════════════════════════════════════════════════════════
-- TEIL 10: Trigger — Gesperrte Verlaufseinträge nicht editierbar
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION prevent_locked_verlauf_edit()
RETURNS trigger AS $$
BEGIN
  IF OLD.gesperrt = true AND NEW.gesperrt = true THEN
    RAISE EXCEPTION 'Gesperrter Verlaufseintrag kann nicht bearbeitet werden. Erst Dokumentationsperiode wiedereröffnen.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_locked_verlauf ON pflege_verlauf;
CREATE TRIGGER trg_locked_verlauf BEFORE UPDATE ON pflege_verlauf
  FOR EACH ROW EXECUTE FUNCTION prevent_locked_verlauf_edit();

-- Gesperrte Anamnese nicht editierbar
CREATE OR REPLACE FUNCTION prevent_locked_anamnese_edit()
RETURNS trigger AS $$
BEGIN
  IF OLD.gesperrt = true AND NEW.gesperrt = true THEN
    RAISE EXCEPTION 'Gesperrte Anamnese kann nicht bearbeitet werden.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_locked_anamnese ON pflege_anamnesen;
CREATE TRIGGER trg_locked_anamnese BEFORE UPDATE ON pflege_anamnesen
  FOR EACH ROW EXECUTE FUNCTION prevent_locked_anamnese_edit();

-- Gesperrter Maßnahmenplan nicht editierbar
CREATE OR REPLACE FUNCTION prevent_locked_plan_edit()
RETURNS trigger AS $$
BEGIN
  IF OLD.gesperrt = true AND NEW.gesperrt = true THEN
    RAISE EXCEPTION 'Gesperrter Maßnahmenplan kann nicht bearbeitet werden.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_locked_plan ON pflege_massnahmenplaene;
CREATE TRIGGER trg_locked_plan BEFORE UPDATE ON pflege_massnahmenplaene
  FOR EACH ROW EXECUTE FUNCTION prevent_locked_plan_edit();


-- ═══════════════════════════════════════════════════════════════════════════
-- TEIL 11: Views — Pflegedokumentation Übersicht
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW pflege_uebersicht AS
SELECT
  c.id AS client_id,
  c.organization_id,
  c.first_name,
  c.last_name,
  c.pflegegrad,
  c.aufnahmestatus,
  c.aufnahmedatum,
  (SELECT count(*) FROM pflege_aufnahmen pa WHERE pa.client_id = c.id) AS aufnahmen_count,
  (SELECT count(*) FROM pflege_anamnesen pan WHERE pan.client_id = c.id) AS anamnesen_count,
  (SELECT max(pan.anamnese_datum) FROM pflege_anamnesen pan WHERE pan.client_id = c.id) AS letzte_anamnese,
  (SELECT count(*) FROM pflege_diagnosen pd WHERE pd.client_id = c.id AND pd.aktiv = true) AS aktive_diagnosen,
  (SELECT count(*) FROM pflege_risiken pr WHERE pr.client_id = c.id AND pr.aktiv = true) AS aktive_risiken,
  (SELECT count(*) FROM pflege_massnahmenplaene pm WHERE pm.client_id = c.id AND pm.status = 'aktiv') AS aktive_plaene,
  (SELECT count(*) FROM pflege_verlauf pv WHERE pv.client_id = c.id) AS verlauf_count,
  (SELECT max(pv.eintrag_datum) FROM pflege_verlauf pv WHERE pv.client_id = c.id) AS letzter_verlauf
FROM clients c;

CREATE OR REPLACE VIEW pflege_risiko_dashboard AS
SELECT
  pr.id,
  pr.organization_id,
  pr.client_id,
  c.first_name || ' ' || c.last_name AS kunde_name,
  pr.risiko_typ,
  pr.bezeichnung,
  pr.schweregrad,
  pr.massnahmen,
  pr.naechste_pruefung,
  CASE
    WHEN pr.naechste_pruefung IS NULL THEN 'keine_pruefung'
    WHEN pr.naechste_pruefung < CURRENT_DATE THEN 'ueberfaellig'
    WHEN pr.naechste_pruefung <= CURRENT_DATE + interval '7 days' THEN 'bald_faellig'
    ELSE 'ok'
  END AS pruefstatus
FROM pflege_risiken pr
JOIN clients c ON c.id = pr.client_id
WHERE pr.aktiv = true;


-- ═══════════════════════════════════════════════════════════════════════════
-- TEIL 12: care_notes Erweiterungen (bestehende Tabelle)
-- ═══════════════════════════════════════════════════════════════════════════

-- care_notes: Zusätzliche Spalte für Verlauf-Verknüpfung
ALTER TABLE care_notes ADD COLUMN IF NOT EXISTS verlauf_id uuid REFERENCES pflege_verlauf(id);
ALTER TABLE care_notes ADD COLUMN IF NOT EXISTS massnahme_id uuid REFERENCES pflege_massnahmen(id);
ALTER TABLE care_notes ADD COLUMN IF NOT EXISTS sichtbarkeit text DEFAULT 'intern';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'care_notes_sichtbarkeit_check') THEN
    ALTER TABLE care_notes ADD CONSTRAINT care_notes_sichtbarkeit_check
      CHECK (sichtbarkeit IS NULL OR sichtbarkeit IN ('intern','engel','kunde','alle'));
  END IF;
END $$;
