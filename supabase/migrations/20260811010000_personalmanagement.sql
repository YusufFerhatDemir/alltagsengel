-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Personalmanagement + Qualifikationsverwaltung + Dienstplanung
--            + Arbeitszeiterfassung + Urlaubsverwaltung
-- Datum:     2026-08-11
-- Projekt:   Alltagsengel UG
-- ═══════════════════════════════════════════════════════════════════════════
-- IDEMPOTENT: Alle Statements mit IF NOT EXISTS / IF EXISTS Guards.
-- BESTEHENDE DATEN: Keine Löschung, nur Erweiterung.
-- org_fence: Alle neuen Tabellen nutzen current_org_id() RESTRICTIVE.
-- ═══════════════════════════════════════════════════════════════════════════

-- ╔═════════════════════════════════════════════════════════════════════════╗
-- ║ TEIL 1: caregivers erweitern                                          ║
-- ╚═════════════════════════════════════════════════════════════════════════╝

ALTER TABLE caregivers
  ADD COLUMN IF NOT EXISTS notfallkontakt_name text,
  ADD COLUMN IF NOT EXISTS notfallkontakt_telefon text,
  ADD COLUMN IF NOT EXISTS notfallkontakt_beziehung text,
  ADD COLUMN IF NOT EXISTS vertragsstatus text DEFAULT 'aktiv',
  ADD COLUMN IF NOT EXISTS einsatzgebiet_plz text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS einsatzgebiet_radius_km int DEFAULT 25,
  ADD COLUMN IF NOT EXISTS wochenstunden_soll numeric(5,2),
  ADD COLUMN IF NOT EXISTS urlaubstage_jahresanspruch int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS probezeitende date,
  ADD COLUMN IF NOT EXISTS fahrzeug_kennzeichen text,
  ADD COLUMN IF NOT EXISTS fuehrerschein_klassen text[] DEFAULT '{}';

DO $$ BEGIN
  ALTER TABLE caregivers ADD CONSTRAINT caregivers_vertragsstatus_check
    CHECK (vertragsstatus IS NULL OR vertragsstatus IN ('aktiv','gekuendigt','ausgeschieden','ruhend'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ╔═════════════════════════════════════════════════════════════════════════╗
-- ║ TEIL 2: caregiver_qualifications erweitern                            ║
-- ╚═════════════════════════════════════════════════════════════════════════╝

ALTER TABLE caregiver_qualifications
  ADD COLUMN IF NOT EXISTS ausstellende_stelle text,
  ADD COLUMN IF NOT EXISTS dokument_id uuid,
  ADD COLUMN IF NOT EXISTS bemerkung text,
  ADD COLUMN IF NOT EXISTS verifiziert_von uuid,
  ADD COLUMN IF NOT EXISTS verifiziert_am timestamptz,
  ADD COLUMN IF NOT EXISTS pflicht boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS einsatzrelevant boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Engel-SELECT-Policy (eigene Qualifikationen sehen)
DO $$ BEGIN
  CREATE POLICY engel_caregiver_quals_select ON caregiver_qualifications
    FOR SELECT TO authenticated
    USING (
      caregiver_id IN (
        SELECT cg.id FROM caregivers cg WHERE cg.user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ╔═════════════════════════════════════════════════════════════════════════╗
-- ║ TEIL 3: absences erweitern (Urlaub-Workflow)                          ║
-- ╚═════════════════════════════════════════════════════════════════════════╝

ALTER TABLE absences
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'beantragt',
  ADD COLUMN IF NOT EXISTS halber_tag boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS tage_berechnet numeric(5,1),
  ADD COLUMN IF NOT EXISTS genehmigt_von uuid,
  ADD COLUMN IF NOT EXISTS genehmigt_am timestamptz,
  ADD COLUMN IF NOT EXISTS ablehnungsgrund text,
  ADD COLUMN IF NOT EXISTS dokument_id uuid,
  ADD COLUMN IF NOT EXISTS erstellt_von uuid,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

DO $$ BEGIN
  ALTER TABLE absences ADD CONSTRAINT absences_status_check
    CHECK (status IS NULL OR status IN ('beantragt','genehmigt','abgelehnt','storniert'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Erweitere absence_type um weitere Typen
ALTER TABLE absences DROP CONSTRAINT IF EXISTS absences_absence_type_check;
ALTER TABLE absences ADD CONSTRAINT absences_absence_type_check
  CHECK (absence_type IN ('sick','vacation','personal','other',
    'fortbildung','mutterschutz','elternzeit','sonderurlaub','unbezahlt'));

-- Engel-SELECT-Policy (eigene Abwesenheiten)
DO $$ BEGIN
  CREATE POLICY engel_absences_select ON absences
    FOR SELECT TO authenticated
    USING (
      caregiver_id IN (
        SELECT cg.id FROM caregivers cg WHERE cg.user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Engel-INSERT-Policy (eigene Abwesenheiten beantragen)
DO $$ BEGIN
  CREATE POLICY engel_absences_insert ON absences
    FOR INSERT TO authenticated
    WITH CHECK (
      caregiver_id IN (
        SELECT cg.id FROM caregivers cg WHERE cg.user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_updated_at_absences ON absences;
CREATE TRIGGER trg_updated_at_absences BEFORE UPDATE ON absences
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ╔═════════════════════════════════════════════════════════════════════════╗
-- ║ TEIL 4: personal_schulungen (Trainings/Fortbildungen)                 ║
-- ╚═════════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS personal_schulungen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT current_org_id(),
  caregiver_id uuid NOT NULL REFERENCES caregivers(id) ON DELETE CASCADE,
  titel text NOT NULL,
  schulungsart text NOT NULL,
  anbieter text,
  beginn date NOT NULL,
  ende date,
  dauer_stunden numeric(5,1),
  ort text,
  zertifikat_url text,
  dokument_id uuid,
  bestanden boolean,
  naechste_auffrischung date,
  bemerkung text,
  erstellt_von uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  CONSTRAINT personal_schulungen_art_check CHECK (schulungsart IN (
    'pflichtschulung','fortbildung','auffrischung','einarbeitung','extern','sonstiges'
  ))
);

ALTER TABLE personal_schulungen ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY org_fence_personal_schulungen ON personal_schulungen AS RESTRICTIVE
    FOR ALL TO authenticated
    USING (organization_id = current_org_id())
    WITH CHECK (organization_id = current_org_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY admin_personal_schulungen ON personal_schulungen
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY engel_personal_schulungen_select ON personal_schulungen
    FOR SELECT TO authenticated
    USING (
      caregiver_id IN (SELECT cg.id FROM caregivers cg WHERE cg.user_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_updated_at_personal_schulungen ON personal_schulungen;
CREATE TRIGGER trg_updated_at_personal_schulungen BEFORE UPDATE ON personal_schulungen
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ╔═════════════════════════════════════════════════════════════════════════╗
-- ║ TEIL 5: dienstplan_schichten (Schichtvorlagen)                        ║
-- ╚═════════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS dienstplan_schichten (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT current_org_id(),
  bezeichnung text NOT NULL,
  kuerzel text,
  start_zeit time NOT NULL,
  end_zeit time NOT NULL,
  pause_minuten int DEFAULT 0,
  farbe text DEFAULT '#C9963C',
  aktiv boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE dienstplan_schichten ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY org_fence_dienstplan_schichten ON dienstplan_schichten AS RESTRICTIVE
    FOR ALL TO authenticated
    USING (organization_id = current_org_id())
    WITH CHECK (organization_id = current_org_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY admin_dienstplan_schichten ON dienstplan_schichten
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY engel_dienstplan_schichten_select ON dienstplan_schichten
    FOR SELECT TO authenticated
    USING (aktiv = true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_updated_at_dienstplan_schichten ON dienstplan_schichten;
CREATE TRIGGER trg_updated_at_dienstplan_schichten BEFORE UPDATE ON dienstplan_schichten
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ╔═════════════════════════════════════════════════════════════════════════╗
-- ║ TEIL 6: dienstplan_eintraege (tägliche Schichteinträge)               ║
-- ╚═════════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS dienstplan_eintraege (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT current_org_id(),
  datum date NOT NULL,
  schicht_id uuid REFERENCES dienstplan_schichten(id),
  caregiver_id uuid REFERENCES caregivers(id),
  client_id uuid REFERENCES clients(id),
  assignment_id uuid REFERENCES assignments(id),
  start_zeit time NOT NULL,
  end_zeit time NOT NULL,
  pause_minuten int DEFAULT 0,
  status text NOT NULL DEFAULT 'geplant',
  typ text NOT NULL DEFAULT 'regulaer',
  notizen text,
  bestaetigt_von uuid,
  bestaetigt_am timestamptz,
  erstellt_von uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  CONSTRAINT dienstplan_eintraege_status_check CHECK (status IN (
    'geplant','bestaetigt','in_bearbeitung','abgeschlossen','ausgefallen','vertretung'
  )),
  CONSTRAINT dienstplan_eintraege_typ_check CHECK (typ IN (
    'regulaer','vertretung','ueberstunden','bereitschaft','notdienst'
  ))
);

ALTER TABLE dienstplan_eintraege ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY org_fence_dienstplan_eintraege ON dienstplan_eintraege AS RESTRICTIVE
    FOR ALL TO authenticated
    USING (organization_id = current_org_id())
    WITH CHECK (organization_id = current_org_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY admin_dienstplan_eintraege ON dienstplan_eintraege
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY engel_dienstplan_eintraege_select ON dienstplan_eintraege
    FOR SELECT TO authenticated
    USING (
      caregiver_id IN (SELECT cg.id FROM caregivers cg WHERE cg.user_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_updated_at_dienstplan_eintraege ON dienstplan_eintraege;
CREATE TRIGGER trg_updated_at_dienstplan_eintraege BEFORE UPDATE ON dienstplan_eintraege
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ╔═════════════════════════════════════════════════════════════════════════╗
-- ║ TEIL 7: Doppelbelegungs-Schutz (Trigger)                             ║
-- ╚═════════════════════════════════════════════════════════════════════════╝

CREATE OR REPLACE FUNCTION check_doppelbelegung()
RETURNS TRIGGER AS $$
BEGIN
  -- Nur prüfen wenn Caregiver zugewiesen und nicht ausgefallen
  IF NEW.caregiver_id IS NOT NULL AND NEW.status != 'ausgefallen' THEN
    IF EXISTS (
      SELECT 1 FROM dienstplan_eintraege
      WHERE id != NEW.id
        AND organization_id = NEW.organization_id
        AND caregiver_id = NEW.caregiver_id
        AND datum = NEW.datum
        AND status != 'ausgefallen'
        AND (
          (NEW.start_zeit < end_zeit AND NEW.end_zeit > start_zeit)
        )
    ) THEN
      RAISE EXCEPTION 'Doppelbelegung: Mitarbeiter hat bereits einen Dienst in diesem Zeitraum.';
    END IF;
  END IF;

  -- Prüfe auch auf Abwesenheit
  IF NEW.caregiver_id IS NOT NULL AND NEW.status NOT IN ('ausgefallen','vertretung') THEN
    IF EXISTS (
      SELECT 1 FROM absences
      WHERE organization_id = NEW.organization_id
        AND caregiver_id = NEW.caregiver_id
        AND NEW.datum BETWEEN start_date AND end_date
        AND (status IS NULL OR status IN ('beantragt','genehmigt'))
    ) THEN
      RAISE EXCEPTION 'Konflikt: Mitarbeiter ist an diesem Tag als abwesend gemeldet.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_doppelbelegung ON dienstplan_eintraege;
CREATE TRIGGER trg_check_doppelbelegung
  BEFORE INSERT OR UPDATE ON dienstplan_eintraege
  FOR EACH ROW EXECUTE FUNCTION check_doppelbelegung();

-- ╔═════════════════════════════════════════════════════════════════════════╗
-- ║ TEIL 8: personal_urlaubskonto (Urlaubssaldo pro Jahr)                 ║
-- ╚═════════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS personal_urlaubskonto (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT current_org_id(),
  caregiver_id uuid NOT NULL REFERENCES caregivers(id) ON DELETE CASCADE,
  jahr int NOT NULL,
  anspruch_tage numeric(5,1) NOT NULL DEFAULT 0,
  genommen_tage numeric(5,1) NOT NULL DEFAULT 0,
  geplant_tage numeric(5,1) NOT NULL DEFAULT 0,
  uebertrag_vorjahr numeric(5,1) NOT NULL DEFAULT 0,
  resturlaub numeric(5,1) GENERATED ALWAYS AS (anspruch_tage + uebertrag_vorjahr - genommen_tage - geplant_tage) STORED,
  bemerkung text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  CONSTRAINT personal_urlaubskonto_jahr_check CHECK (jahr >= 2020 AND jahr <= 2099),
  CONSTRAINT personal_urlaubskonto_unique UNIQUE (organization_id, caregiver_id, jahr)
);

ALTER TABLE personal_urlaubskonto ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY org_fence_personal_urlaubskonto ON personal_urlaubskonto AS RESTRICTIVE
    FOR ALL TO authenticated
    USING (organization_id = current_org_id())
    WITH CHECK (organization_id = current_org_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY admin_personal_urlaubskonto ON personal_urlaubskonto
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY engel_personal_urlaubskonto_select ON personal_urlaubskonto
    FOR SELECT TO authenticated
    USING (
      caregiver_id IN (SELECT cg.id FROM caregivers cg WHERE cg.user_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_updated_at_personal_urlaubskonto ON personal_urlaubskonto;
CREATE TRIGGER trg_updated_at_personal_urlaubskonto BEFORE UPDATE ON personal_urlaubskonto
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ╔═════════════════════════════════════════════════════════════════════════╗
-- ║ TEIL 9: personal_arbeitszeiten (Zeiterfassung)                        ║
-- ╚═════════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS personal_arbeitszeiten (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT current_org_id(),
  caregiver_id uuid NOT NULL REFERENCES caregivers(id) ON DELETE CASCADE,
  datum date NOT NULL,
  start_zeit time NOT NULL,
  end_zeit time NOT NULL,
  pause_minuten int DEFAULT 0,
  ist_minuten int NOT NULL,
  soll_minuten int,
  ueberstunden_minuten int GENERATED ALWAYS AS (
    CASE WHEN soll_minuten IS NOT NULL THEN ist_minuten - soll_minuten ELSE 0 END
  ) STORED,
  dienstplan_eintrag_id uuid REFERENCES dienstplan_eintraege(id),
  service_record_id uuid REFERENCES service_records(id),
  quelle text NOT NULL DEFAULT 'manuell',
  status text NOT NULL DEFAULT 'erfasst',
  bestaetigt_von uuid,
  bestaetigt_am timestamptz,
  gesperrt boolean DEFAULT false,
  bemerkung text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  CONSTRAINT personal_arbeitszeiten_quelle_check CHECK (quelle IN (
    'manuell','app','dienstplan','import'
  )),
  CONSTRAINT personal_arbeitszeiten_status_check CHECK (status IN (
    'erfasst','bestaetigt','korrigiert','gesperrt'
  )),
  CONSTRAINT personal_arbeitszeiten_unique UNIQUE (organization_id, caregiver_id, datum, start_zeit)
);

ALTER TABLE personal_arbeitszeiten ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY org_fence_personal_arbeitszeiten ON personal_arbeitszeiten AS RESTRICTIVE
    FOR ALL TO authenticated
    USING (organization_id = current_org_id())
    WITH CHECK (organization_id = current_org_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY admin_personal_arbeitszeiten ON personal_arbeitszeiten
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY engel_personal_arbeitszeiten_select ON personal_arbeitszeiten
    FOR SELECT TO authenticated
    USING (
      caregiver_id IN (SELECT cg.id FROM caregivers cg WHERE cg.user_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY engel_personal_arbeitszeiten_insert ON personal_arbeitszeiten
    FOR INSERT TO authenticated
    WITH CHECK (
      caregiver_id IN (SELECT cg.id FROM caregivers cg WHERE cg.user_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_updated_at_personal_arbeitszeiten ON personal_arbeitszeiten;
CREATE TRIGGER trg_updated_at_personal_arbeitszeiten BEFORE UPDATE ON personal_arbeitszeiten
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ╔═════════════════════════════════════════════════════════════════════════╗
-- ║ TEIL 10: personal_zeitkorrekturen (immutable Korrektur-Log)           ║
-- ╚═════════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS personal_zeitkorrekturen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT current_org_id(),
  arbeitszeit_id uuid NOT NULL REFERENCES personal_arbeitszeiten(id) ON DELETE CASCADE,
  caregiver_id uuid NOT NULL REFERENCES caregivers(id),
  feld text NOT NULL,
  alter_wert text,
  neuer_wert text,
  grund text NOT NULL,
  korrigiert_von uuid NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE personal_zeitkorrekturen ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY org_fence_personal_zeitkorrekturen ON personal_zeitkorrekturen AS RESTRICTIVE
    FOR ALL TO authenticated
    USING (organization_id = current_org_id())
    WITH CHECK (organization_id = current_org_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY admin_personal_zeitkorrekturen ON personal_zeitkorrekturen
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY engel_personal_zeitkorrekturen_select ON personal_zeitkorrekturen
    FOR SELECT TO authenticated
    USING (
      caregiver_id IN (SELECT cg.id FROM caregivers cg WHERE cg.user_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Immutable: kein UPDATE, kein DELETE
CREATE OR REPLACE FUNCTION prevent_zeitkorrektur_edit()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Zeitkorrekturen sind unveränderlich (Revisionssicherheit).';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_immutable_zeitkorrektur_update ON personal_zeitkorrekturen;
CREATE TRIGGER trg_immutable_zeitkorrektur_update BEFORE UPDATE ON personal_zeitkorrekturen
  FOR EACH ROW EXECUTE FUNCTION prevent_zeitkorrektur_edit();

DROP TRIGGER IF EXISTS trg_immutable_zeitkorrektur_delete ON personal_zeitkorrekturen;
CREATE TRIGGER trg_immutable_zeitkorrektur_delete BEFORE DELETE ON personal_zeitkorrekturen
  FOR EACH ROW EXECUTE FUNCTION prevent_zeitkorrektur_edit();

-- ╔═════════════════════════════════════════════════════════════════════════╗
-- ║ TEIL 11: personal_audit_log (immutable HR-Audit-Trail)                ║
-- ╚═════════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS personal_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT current_org_id(),
  entitaet_typ text NOT NULL,
  entitaet_id uuid NOT NULL,
  caregiver_id uuid,
  aktion text NOT NULL,
  vorher jsonb,
  nachher jsonb,
  grund text,
  benutzer_id uuid NOT NULL,
  benutzer_rolle text,
  created_at timestamptz DEFAULT now(),

  CONSTRAINT personal_audit_log_typ_check CHECK (entitaet_typ IN (
    'caregiver','qualifikation','schulung','arbeitszeit','abwesenheit',
    'urlaubskonto','dienstplan','vertretung','einsatzfreigabe'
  )),
  CONSTRAINT personal_audit_log_aktion_check CHECK (aktion IN (
    'erstellt','bearbeitet','geloescht','genehmigt','abgelehnt',
    'gesperrt','freigegeben','korrigiert','storniert'
  ))
);

ALTER TABLE personal_audit_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY org_fence_personal_audit_log ON personal_audit_log AS RESTRICTIVE
    FOR ALL TO authenticated
    USING (organization_id = current_org_id())
    WITH CHECK (organization_id = current_org_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY admin_personal_audit_log ON personal_audit_log
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Immutable: kein UPDATE, kein DELETE
CREATE OR REPLACE FUNCTION prevent_personal_audit_edit()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'HR-Audit-Log ist unveränderlich (Revisionssicherheit).';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_immutable_personal_audit_update ON personal_audit_log;
CREATE TRIGGER trg_immutable_personal_audit_update BEFORE UPDATE ON personal_audit_log
  FOR EACH ROW EXECUTE FUNCTION prevent_personal_audit_edit();

DROP TRIGGER IF EXISTS trg_immutable_personal_audit_delete ON personal_audit_log;
CREATE TRIGGER trg_immutable_personal_audit_delete BEFORE DELETE ON personal_audit_log
  FOR EACH ROW EXECUTE FUNCTION prevent_personal_audit_edit();

-- ╔═════════════════════════════════════════════════════════════════════════╗
-- ║ TEIL 12: Auto-Korrektur-Log bei Arbeitszeit-Änderung                  ║
-- ╚═════════════════════════════════════════════════════════════════════════╝

CREATE OR REPLACE FUNCTION log_arbeitszeit_korrektur()
RETURNS TRIGGER AS $$
BEGIN
  -- Nur loggen wenn sich relevante Felder geändert haben
  IF OLD.gesperrt = true AND NEW.gesperrt = true THEN
    RAISE EXCEPTION 'Gesperrte Arbeitszeit kann nicht bearbeitet werden.';
  END IF;

  IF OLD.start_zeit IS DISTINCT FROM NEW.start_zeit THEN
    INSERT INTO personal_zeitkorrekturen (organization_id, arbeitszeit_id, caregiver_id, feld, alter_wert, neuer_wert, grund, korrigiert_von)
    VALUES (NEW.organization_id, NEW.id, NEW.caregiver_id, 'start_zeit', OLD.start_zeit::text, NEW.start_zeit::text, COALESCE(NEW.bemerkung, 'Korrektur'), auth.uid());
  END IF;

  IF OLD.end_zeit IS DISTINCT FROM NEW.end_zeit THEN
    INSERT INTO personal_zeitkorrekturen (organization_id, arbeitszeit_id, caregiver_id, feld, alter_wert, neuer_wert, grund, korrigiert_von)
    VALUES (NEW.organization_id, NEW.id, NEW.caregiver_id, 'end_zeit', OLD.end_zeit::text, NEW.end_zeit::text, COALESCE(NEW.bemerkung, 'Korrektur'), auth.uid());
  END IF;

  IF OLD.pause_minuten IS DISTINCT FROM NEW.pause_minuten THEN
    INSERT INTO personal_zeitkorrekturen (organization_id, arbeitszeit_id, caregiver_id, feld, alter_wert, neuer_wert, grund, korrigiert_von)
    VALUES (NEW.organization_id, NEW.id, NEW.caregiver_id, 'pause_minuten', OLD.pause_minuten::text, NEW.pause_minuten::text, COALESCE(NEW.bemerkung, 'Korrektur'), auth.uid());
  END IF;

  IF OLD.ist_minuten IS DISTINCT FROM NEW.ist_minuten THEN
    INSERT INTO personal_zeitkorrekturen (organization_id, arbeitszeit_id, caregiver_id, feld, alter_wert, neuer_wert, grund, korrigiert_von)
    VALUES (NEW.organization_id, NEW.id, NEW.caregiver_id, 'ist_minuten', OLD.ist_minuten::text, NEW.ist_minuten::text, COALESCE(NEW.bemerkung, 'Korrektur'), auth.uid());
  END IF;

  -- Status auf 'korrigiert' setzen wenn nicht gerade erst erfasst
  IF OLD.status NOT IN ('erfasst') AND (
    OLD.start_zeit IS DISTINCT FROM NEW.start_zeit OR
    OLD.end_zeit IS DISTINCT FROM NEW.end_zeit OR
    OLD.pause_minuten IS DISTINCT FROM NEW.pause_minuten OR
    OLD.ist_minuten IS DISTINCT FROM NEW.ist_minuten
  ) THEN
    NEW.status := 'korrigiert';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_log_arbeitszeit_korrektur ON personal_arbeitszeiten;
CREATE TRIGGER trg_log_arbeitszeit_korrektur
  BEFORE UPDATE ON personal_arbeitszeiten
  FOR EACH ROW EXECUTE FUNCTION log_arbeitszeit_korrektur();

-- ╔═════════════════════════════════════════════════════════════════════════╗
-- ║ TEIL 13: Views                                                        ║
-- ╚═════════════════════════════════════════════════════════════════════════╝

-- Dienstplan-Tagesansicht mit Abwesenheiten und Konflikten
CREATE OR REPLACE VIEW dienstplan_tagesansicht AS
SELECT
  de.id,
  de.organization_id,
  de.datum,
  de.start_zeit,
  de.end_zeit,
  de.pause_minuten,
  de.status,
  de.typ,
  de.notizen,
  de.caregiver_id,
  cg.first_name || ' ' || cg.last_name AS caregiver_name,
  cg.initials AS caregiver_initials,
  de.client_id,
  cl.first_name || ' ' || cl.last_name AS client_name,
  ds.bezeichnung AS schicht_bezeichnung,
  ds.farbe AS schicht_farbe,
  de.assignment_id,
  CASE WHEN ab.id IS NOT NULL THEN true ELSE false END AS hat_abwesenheit,
  ab.absence_type AS abwesenheit_typ
FROM dienstplan_eintraege de
LEFT JOIN caregivers cg ON cg.id = de.caregiver_id
LEFT JOIN clients cl ON cl.id = de.client_id
LEFT JOIN dienstplan_schichten ds ON ds.id = de.schicht_id
LEFT JOIN absences ab ON ab.caregiver_id = de.caregiver_id
  AND de.datum BETWEEN ab.start_date AND ab.end_date
  AND (ab.status IS NULL OR ab.status IN ('beantragt','genehmigt'));

-- Arbeitszeitkonto: Monatliche Zusammenfassung pro Mitarbeiter
CREATE OR REPLACE VIEW personal_arbeitszeitkonto AS
SELECT
  az.organization_id,
  az.caregiver_id,
  cg.first_name || ' ' || cg.last_name AS caregiver_name,
  EXTRACT(YEAR FROM az.datum)::int AS jahr,
  EXTRACT(MONTH FROM az.datum)::int AS monat,
  COUNT(*) AS anzahl_eintraege,
  SUM(az.ist_minuten) AS ist_minuten_gesamt,
  SUM(COALESCE(az.soll_minuten, 0)) AS soll_minuten_gesamt,
  SUM(CASE WHEN az.soll_minuten IS NOT NULL THEN az.ist_minuten - az.soll_minuten ELSE 0 END) AS ueberstunden_gesamt,
  SUM(az.pause_minuten) AS pausen_gesamt,
  COUNT(*) FILTER (WHERE az.status = 'korrigiert') AS korrigierte_eintraege
FROM personal_arbeitszeiten az
JOIN caregivers cg ON cg.id = az.caregiver_id
GROUP BY az.organization_id, az.caregiver_id, cg.first_name, cg.last_name,
  EXTRACT(YEAR FROM az.datum), EXTRACT(MONTH FROM az.datum);

-- Qualifikations-Ablauf-Warnung (erweitert bestehende akten_ablauf_dashboard)
CREATE OR REPLACE VIEW qualifikation_ablauf_warnung AS
SELECT
  cq.organization_id,
  cq.id AS qualifikation_id,
  cq.caregiver_id,
  cg.first_name || ' ' || cg.last_name AS caregiver_name,
  cq.title AS qualifikation,
  cq.qualification_type AS typ,
  cq.valid_until AS gueltig_bis,
  cq.pflicht,
  cq.einsatzrelevant,
  CASE
    WHEN cq.valid_until IS NULL THEN 'kein_datum'
    WHEN cq.valid_until < CURRENT_DATE THEN 'abgelaufen'
    WHEN cq.valid_until <= CURRENT_DATE + 7 THEN 'kritisch_7'
    WHEN cq.valid_until <= CURRENT_DATE + 30 THEN 'warnung_30'
    WHEN cq.valid_until <= CURRENT_DATE + 60 THEN 'warnung_60'
    WHEN cq.valid_until <= CURRENT_DATE + 90 THEN 'warnung_90'
    ELSE 'ok'
  END AS warnstufe,
  cq.valid_until - CURRENT_DATE AS tage_verbleibend,
  cg.einsatzfreigabe
FROM caregiver_qualifications cq
JOIN caregivers cg ON cg.id = cq.caregiver_id
WHERE cq.status != 'pending';

-- Urlaubsübersicht pro Jahr
CREATE OR REPLACE VIEW personal_urlaubsuebersicht AS
SELECT
  uk.organization_id,
  uk.caregiver_id,
  cg.first_name || ' ' || cg.last_name AS caregiver_name,
  uk.jahr,
  uk.anspruch_tage,
  uk.uebertrag_vorjahr,
  uk.genommen_tage,
  uk.geplant_tage,
  uk.resturlaub,
  COUNT(ab.id) FILTER (WHERE ab.status = 'beantragt') AS offene_antraege
FROM personal_urlaubskonto uk
JOIN caregivers cg ON cg.id = uk.caregiver_id
LEFT JOIN absences ab ON ab.caregiver_id = uk.caregiver_id
  AND ab.absence_type = 'vacation'
  AND ab.status = 'beantragt'
  AND EXTRACT(YEAR FROM ab.start_date) = uk.jahr
GROUP BY uk.id, uk.organization_id, uk.caregiver_id, cg.first_name, cg.last_name,
  uk.jahr, uk.anspruch_tage, uk.uebertrag_vorjahr, uk.genommen_tage, uk.geplant_tage, uk.resturlaub;
