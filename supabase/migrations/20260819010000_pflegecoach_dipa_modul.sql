-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Digitaler PflegeCoach (DiPA-Modul) — Datenmodell coach_*
-- Datum:     2026-08-18 (sequenziell), erstellt 2026-08-09
-- Projekt:   Alltagsengel UG — DiPA nach § 40a SGB XI (Erprobungspfad § 78a Abs. 6a)
-- ═══════════════════════════════════════════════════════════════════════════
-- IDEMPOTENT: Alle Statements mit IF NOT EXISTS / DO-Guards.
-- BESTEHENDE DATEN: Keine Änderung an bestehenden Tabellen. Nur neue Objekte.
--
-- PRODUKTGRENZE (bewusste Abweichung vom übrigen Schema):
--   * KEIN organization_id / org_fence: DiPA-Daten sind NUTZER-eigene
--     Gesundheitsdaten (Art. 9 DSGVO), keine Mandanten-Betriebsdaten.
--   * KEINE is_admin()-Policies: Betriebs-Admins der Alltagsengel-Plattform
--     haben KEINEN Zugriff auf PflegeCoach-Daten (DiPAV-Trennungsgebot,
--     keine Nutzung für Werbung/Cross-Selling).
--   * Zugriff ausschließlich: der Nutzer selbst + von ihm per coach_shares
--     freigegebene Personen (Angehörige/Pflegedienst), widerruflich.
--   * anon: sämtliche Grants entzogen (Supabase-Default-Privileges!).
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- TEIL 0: updated_at-Trigger-Funktion (SECURITY INVOKER, kein anon-Exec)
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION coach_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- Default-Privileges machen jede public-Funktion für anon ausführbar → entziehen.
REVOKE ALL ON FUNCTION coach_set_updated_at() FROM PUBLIC, anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- TEIL 1: coach_users — Produktnutzer (3 Rollen) + Barrierefreiheits-Prefs
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS coach_users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  rolle         text NOT NULL CHECK (rolle IN ('pflegebeduerftig','angehoerig','pflegedienst')),
  anzeigename   text,
  pflegegrad    integer CHECK (pflegegrad BETWEEN 1 AND 5),
  geburtsjahr   integer CHECK (geburtsjahr BETWEEN 1900 AND 2030),

  -- Barrierefreiheit (WCAG 2.1 AA / BFSG): Nutzer-Einstellungen serverseitig,
  -- damit sie geräteübergreifend gelten.
  a11y_schriftgrad text NOT NULL DEFAULT 'normal' CHECK (a11y_schriftgrad IN ('normal','gross','sehr_gross')),
  a11y_kontrast    boolean NOT NULL DEFAULT false,

  onboarding_abgeschlossen boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE coach_users IS
  'DiPA "Digitaler PflegeCoach": Produktnutzer. Strikt getrennt von profiles/Betriebsdaten. Kein Admin-Zugriff (DiPAV-Produktgrenze).';

-- ───────────────────────────────────────────────────────────────────────────
-- TEIL 2: coach_consents — versionierter Einwilligungs-Record (Art. 9 DSGVO)
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS coach_consents (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_user_id  uuid NOT NULL REFERENCES coach_users(id) ON DELETE CASCADE,
  consent_typ    text NOT NULL CHECK (consent_typ IN (
                   'gesundheitsdaten_art9',        -- Verarbeitung von Pflege-/Gesundheitsdaten
                   'wissenschaftliche_auswertung', -- pseudonymisierte Evaluationsdaten (Pilot)
                   'datenfreigabe'                 -- geteilte Nutzung mit Angehörigen/Pflegedienst
                 )),
  text_version   text NOT NULL,      -- Version des Einwilligungstexts (z.B. "2026-08-v1")
  erteilt        boolean NOT NULL,
  erteilt_am     timestamptz NOT NULL DEFAULT now(),
  widerrufen_am  timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE coach_consents IS
  'Serverseitig versionierte Einwilligungen (Art. 7 Abs. 1 / Art. 9 Abs. 2 lit. a DSGVO). Append-only: kein UPDATE außer Widerruf, kein DELETE.';

CREATE INDEX IF NOT EXISTS idx_coach_consents_user ON coach_consents(coach_user_id, consent_typ);

-- ───────────────────────────────────────────────────────────────────────────
-- TEIL 3: coach_shares — einwilligungsbasierte Freigabe (Rollen-Interaktion)
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS coach_shares (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_coach_user_id  uuid NOT NULL REFERENCES coach_users(id) ON DELETE CASCADE,
  grantee_user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  empfaenger_rolle     text NOT NULL CHECK (empfaenger_rolle IN ('angehoerig','pflegedienst')),
  erstellt_am          timestamptz NOT NULL DEFAULT now(),
  widerrufen_am        timestamptz,
  UNIQUE (owner_coach_user_id, grantee_user_id)
);

COMMENT ON TABLE coach_shares IS
  'Lesefreigabe der PflegeCoach-Daten an Angehörige/Pflegedienst. Jederzeit widerruflich (widerrufen_am). Grundlage: coach_consents datenfreigabe.';

CREATE INDEX IF NOT EXISTS idx_coach_shares_grantee ON coach_shares(grantee_user_id) WHERE widerrufen_am IS NULL;

-- ───────────────────────────────────────────────────────────────────────────
-- TEIL 4: coach_assessments — strukturiertes Pflegeassessment
-- ───────────────────────────────────────────────────────────────────────────
-- Selbsteinschätzung 0–4 je Lebensbereich (0 = selbständig, 4 = auf
-- umfassende Unterstützung angewiesen). KEINE diagnostische Auswertung —
-- reine Selbstauskunft als Organisationsgrundlage (MDR-Negativabgrenzung).

CREATE TABLE IF NOT EXISTS coach_assessments (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_user_id      uuid NOT NULL REFERENCES coach_users(id) ON DELETE CASCADE,
  assessment_typ     text NOT NULL DEFAULT 'erstassessment' CHECK (assessment_typ IN ('erstassessment','verlaufsassessment')),

  mobilitaet         integer CHECK (mobilitaet BETWEEN 0 AND 4),
  selbstversorgung   integer CHECK (selbstversorgung BETWEEN 0 AND 4),
  alltagsgestaltung  integer CHECK (alltagsgestaltung BETWEEN 0 AND 4),
  soziale_teilhabe   integer CHECK (soziale_teilhabe BETWEEN 0 AND 4),
  kognition          integer CHECK (kognition BETWEEN 0 AND 4),

  hilfsmittel        text,
  wohnsituation      text,
  notizen            text,

  erhoben_am         date NOT NULL DEFAULT CURRENT_DATE,
  erhoben_von        uuid REFERENCES auth.users(id),
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coach_assessments_user ON coach_assessments(coach_user_id, erhoben_am DESC);

-- ───────────────────────────────────────────────────────────────────────────
-- TEIL 5: coach_goals — individuelle SMART-Pflegeziele
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS coach_goals (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_user_id   uuid NOT NULL REFERENCES coach_users(id) ON DELETE CASCADE,
  titel           text NOT NULL,
  beschreibung    text,
  bereich         text NOT NULL CHECK (bereich IN (
                    'mobilitaet','selbstversorgung','alltagsgestaltung',
                    'soziale_teilhabe','entlastung_angehoerige')),

  -- SMART: Messgröße + Start-/Ziel-/Ist-Wert + Termin
  messgroesse     text,             -- z.B. "Spaziergänge pro Woche"
  startwert       numeric,
  zielwert        numeric,
  aktueller_wert  numeric,
  start_am        date NOT NULL DEFAULT CURRENT_DATE,
  ziel_bis        date,

  status          text NOT NULL DEFAULT 'aktiv' CHECK (status IN ('aktiv','erreicht','angepasst','pausiert','beendet')),
  anpassungs_notiz text,            -- dokumentiert Maßnahmen-Anpassungen (nachvollziehbar)

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coach_goals_user ON coach_goals(coach_user_id, status);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_coach_goals_updated_at') THEN
    CREATE TRIGGER trg_coach_goals_updated_at BEFORE UPDATE ON coach_goals
      FOR EACH ROW EXECUTE FUNCTION coach_set_updated_at();
  END IF;
END $$;

-- ───────────────────────────────────────────────────────────────────────────
-- TEIL 6: coach_activities — Tages-/Wochenstruktur (Aktivitätenplanung)
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS coach_activities (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_user_id   uuid NOT NULL REFERENCES coach_users(id) ON DELETE CASCADE,
  titel           text NOT NULL,
  beschreibung    text,
  kategorie       text NOT NULL CHECK (kategorie IN (
                    'mobilitaet','selbstversorgung','alltagsgestaltung',
                    'soziale_teilhabe','entlastung','erinnerung')),

  wochentage      smallint[] NOT NULL DEFAULT '{}',  -- 1=Mo … 7=So
  uhrzeit         time,
  dauer_minuten   integer CHECK (dauer_minuten IS NULL OR dauer_minuten BETWEEN 1 AND 480),
  goal_id         uuid REFERENCES coach_goals(id) ON DELETE SET NULL,
  aktiv           boolean NOT NULL DEFAULT true,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coach_activities_user ON coach_activities(coach_user_id) WHERE aktiv;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_coach_activities_updated_at') THEN
    CREATE TRIGGER trg_coach_activities_updated_at BEFORE UPDATE ON coach_activities
      FOR EACH ROW EXECUTE FUNCTION coach_set_updated_at();
  END IF;
END $$;

-- ───────────────────────────────────────────────────────────────────────────
-- TEIL 7: coach_activity_log — Erledigungen (Adhärenz, Verlaufsbasis)
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS coach_activity_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id     uuid NOT NULL REFERENCES coach_activities(id) ON DELETE CASCADE,
  coach_user_id   uuid NOT NULL REFERENCES coach_users(id) ON DELETE CASCADE,
  datum           date NOT NULL DEFAULT CURRENT_DATE,
  status          text NOT NULL DEFAULT 'erledigt' CHECK (status IN ('erledigt','teilweise','ausgelassen')),
  notiz           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (activity_id, datum)
);

CREATE INDEX IF NOT EXISTS idx_coach_activity_log_user ON coach_activity_log(coach_user_id, datum DESC);

-- ───────────────────────────────────────────────────────────────────────────
-- TEIL 8: coach_measurements — Verlaufsmessung (Baseline + Outcome)
-- ───────────────────────────────────────────────────────────────────────────
-- Instrumente gem. Pilotkonzept: FES-I Kurzform (Sturzangst), BSFC-s
-- (Belastung pflegender Angehöriger, "Häusliche-Pflege-Skala Kurzform"),
-- SUS (Usability), Selbsteinschätzung Selbständigkeit, Sturzereignis
-- (Selbstbericht). Rohantworten in `antworten` (jsonb), Summenwert separat.
-- KEINE automatische klinische Interpretation (MDR-Negativabgrenzung).

CREATE TABLE IF NOT EXISTS coach_measurements (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_user_id   uuid NOT NULL REFERENCES coach_users(id) ON DELETE CASCADE,
  instrument      text NOT NULL CHECK (instrument IN (
                    'fes_i_k','bsfc_s','sus','belastung_kurz',
                    'selbsteinschaetzung_selbststaendigkeit','sturzereignis','befinden')),
  messzeitpunkt   text NOT NULL DEFAULT 'laufend' CHECK (messzeitpunkt IN ('t0','t1','t2','t3','laufend')),
  antworten       jsonb NOT NULL DEFAULT '{}'::jsonb,
  summenwert      numeric,
  erhoben_am      timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coach_measurements_user
  ON coach_measurements(coach_user_id, instrument, erhoben_am DESC);

-- ───────────────────────────────────────────────────────────────────────────
-- TEIL 9: coach_reports — exportierbare Verlaufsberichte (unveränderlich)
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS coach_reports (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_user_id   uuid NOT NULL REFERENCES coach_users(id) ON DELETE CASCADE,
  report_typ      text NOT NULL DEFAULT 'verlaufsbericht' CHECK (report_typ IN ('verlaufsbericht','datenexport')),
  zeitraum_von    date,
  zeitraum_bis    date,
  inhalt          jsonb NOT NULL,   -- Snapshot: nachvollziehbar, maschinenlesbar (DiPAV-Export)
  erstellt_am     timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE coach_reports IS
  'Generierte Berichte/Exporte als unveränderlicher Snapshot (kein UPDATE/DELETE per RLS). Löschung nur über Konto-Löschung (CASCADE).';

CREATE INDEX IF NOT EXISTS idx_coach_reports_user ON coach_reports(coach_user_id, erstellt_am DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- TEIL 10: RLS — Nutzer-eigen + Freigabe-Lesezugriff, KEIN Admin-Zugriff
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE coach_users        ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_consents     ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_shares       ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_assessments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_goals        ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_activities   ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_measurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_reports      ENABLE ROW LEVEL SECURITY;

-- coach_users: nur der Nutzer selbst (kein Fremdzugriff, auch nicht lesend)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'coach_users' AND policyname = 'coach_users_self') THEN
    CREATE POLICY coach_users_self ON coach_users FOR ALL TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

-- coach_consents: eigene lesen + anlegen; UPDATE nur für Widerruf; kein DELETE
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'coach_consents' AND policyname = 'coach_consents_select_self') THEN
    CREATE POLICY coach_consents_select_self ON coach_consents FOR SELECT TO authenticated
      USING (coach_user_id IN (SELECT cu.id FROM coach_users cu WHERE cu.user_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'coach_consents' AND policyname = 'coach_consents_insert_self') THEN
    CREATE POLICY coach_consents_insert_self ON coach_consents FOR INSERT TO authenticated
      WITH CHECK (coach_user_id IN (SELECT cu.id FROM coach_users cu WHERE cu.user_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'coach_consents' AND policyname = 'coach_consents_update_self') THEN
    CREATE POLICY coach_consents_update_self ON coach_consents FOR UPDATE TO authenticated
      USING (coach_user_id IN (SELECT cu.id FROM coach_users cu WHERE cu.user_id = auth.uid()))
      WITH CHECK (coach_user_id IN (SELECT cu.id FROM coach_users cu WHERE cu.user_id = auth.uid()));
  END IF;
END $$;

-- coach_shares: Eigentümer verwaltet; Empfänger sieht die eigene Freigabe
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'coach_shares' AND policyname = 'coach_shares_owner_all') THEN
    CREATE POLICY coach_shares_owner_all ON coach_shares FOR ALL TO authenticated
      USING (owner_coach_user_id IN (SELECT cu.id FROM coach_users cu WHERE cu.user_id = auth.uid()))
      WITH CHECK (owner_coach_user_id IN (SELECT cu.id FROM coach_users cu WHERE cu.user_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'coach_shares' AND policyname = 'coach_shares_grantee_select') THEN
    CREATE POLICY coach_shares_grantee_select ON coach_shares FOR SELECT TO authenticated
      USING (grantee_user_id = auth.uid());
  END IF;
END $$;

-- Datentabellen: Eigentümer voll, Freigabe-Empfänger lesend.
-- (Muster identisch für assessments/goals/activities/activity_log/measurements.)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['coach_assessments','coach_goals','coach_activities','coach_activity_log','coach_measurements'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = t || '_owner_all') THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR ALL TO authenticated
           USING (coach_user_id IN (SELECT cu.id FROM coach_users cu WHERE cu.user_id = auth.uid()))
           WITH CHECK (coach_user_id IN (SELECT cu.id FROM coach_users cu WHERE cu.user_id = auth.uid()))',
        t || '_owner_all', t);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = t || '_share_select') THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR SELECT TO authenticated
           USING (coach_user_id IN (
             SELECT s.owner_coach_user_id FROM coach_shares s
             WHERE s.grantee_user_id = auth.uid() AND s.widerrufen_am IS NULL))',
        t || '_share_select', t);
    END IF;
  END LOOP;
END $$;

-- coach_reports: Eigentümer SELECT+INSERT, Freigabe SELECT — kein UPDATE/DELETE
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'coach_reports' AND policyname = 'coach_reports_select_self') THEN
    CREATE POLICY coach_reports_select_self ON coach_reports FOR SELECT TO authenticated
      USING (coach_user_id IN (SELECT cu.id FROM coach_users cu WHERE cu.user_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'coach_reports' AND policyname = 'coach_reports_insert_self') THEN
    CREATE POLICY coach_reports_insert_self ON coach_reports FOR INSERT TO authenticated
      WITH CHECK (coach_user_id IN (SELECT cu.id FROM coach_users cu WHERE cu.user_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'coach_reports' AND policyname = 'coach_reports_share_select') THEN
    CREATE POLICY coach_reports_share_select ON coach_reports FOR SELECT TO authenticated
      USING (coach_user_id IN (
        SELECT s.owner_coach_user_id FROM coach_shares s
        WHERE s.grantee_user_id = auth.uid() AND s.widerrufen_am IS NULL));
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- TEIL 11: Grants härten — anon komplett raus (Default-Privileges-Falle)
-- ═══════════════════════════════════════════════════════════════════════════

REVOKE ALL ON coach_users, coach_consents, coach_shares, coach_assessments,
              coach_goals, coach_activities, coach_activity_log,
              coach_measurements, coach_reports
  FROM anon;

-- coach_consents/coach_reports: DELETE bzw. UPDATE/DELETE auch auf Grant-Ebene
-- entziehen (Defense-in-Depth zusätzlich zur fehlenden Policy).
REVOKE DELETE ON coach_consents FROM authenticated;
REVOKE UPDATE, DELETE ON coach_reports FROM authenticated;
