-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: DiPA Block 15 — Freischaltung, Nutzungsnachweise, eUL
-- Datum:     2026-08-26 (sequenziell), erstellt 2026-08-12
-- Projekt:   Alltagsengel UG — Digitaler PflegeCoach (§ 40a SGB XI)
-- Baut auf:  20260819010000_pflegecoach_dipa_modul.sql
-- ═══════════════════════════════════════════════════════════════════════════
-- IDEMPOTENT: alle Statements mit IF NOT EXISTS / DO-Guards.
-- Rollback:  20260826010001_rollback_dipa_freischaltung_nachweise_eul.sql
--
-- ZWEI GETRENNTE DATENWELTEN — das ist der Kern dieser Migration:
--
--   A) NUTZER-SEITE (coach_*, Gesundheitsdaten Art. 9 DSGVO)
--      Zugriff: ausschliesslich der Nutzer selbst + eigene Freigaben.
--      KEIN Admin-Zugriff, kein org_fence (DiPAV-Trennungsgebot).
--
--   B) BETRIEBS-SEITE (coach_freischaltcodes, eul_*)
--      Berechtigungs-/Abrechnungs-/Leistungsdaten des Herstellers bzw.
--      Leistungserbringers. Zugriff: is_admin() + org_fence.
--
--   Die Bruecke zwischen A und B ist ausschliesslich ein PSEUDONYM
--   (HMAC-SHA256 ueber die auth-User-ID mit einem Schluessel, den niemand
--   lesen kann). Ein Admin sieht damit "Code X wurde eingeloest", kann die
--   Einloesung aber NICHT einer Person oder deren Gesundheitsdaten
--   zuordnen. Loeschung des Schluessels anonymisiert die Nachweisdaten
--   endgueltig (Loeschkonzept, audit/dipa/loeschkonzept.md).
--
-- KEINE REGULATORISCHEN ANNAHMEN: Diese Migration legt weder Preise noch
-- Erstattungsbetraege noch Zulassungsvoraussetzungen fest. Abrechnungswege
-- sind reine Konfiguration (siehe lib/coach/abrechnung.ts); ob und wie ein
-- Aktivierungscode-Verfahren fuer DiPA vorgeschrieben ist, ist offen
-- (audit/dipa/nutzerflow_dipa.md, ORF-DIPA-FLOW).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ═══════════════════════════════════════════════════════════════════════════
-- TEIL 1: Pseudonymisierungs-Infrastruktur (Trennungskonzept)
-- ═══════════════════════════════════════════════════════════════════════════
-- Der Schluessel liegt in einer eigenen Tabelle ohne jede Policy und ohne
-- Grants: weder anon noch authenticated koennen ihn lesen — nur die
-- SECURITY-DEFINER-Funktion (Eigentuemer-Rechte) kommt heran.

CREATE TABLE IF NOT EXISTS coach_pseudonym_key (
  id          smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  schluessel  bytea NOT NULL DEFAULT extensions.gen_random_bytes(32),
  erzeugt_am  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE coach_pseudonym_key IS
  'Einzelner HMAC-Schluessel fuer die Pseudonymisierung der DiPA-Nutzungsnachweise. Nicht lesbar (keine Policy, keine Grants). Loeschen = irreversible Anonymisierung aller Nachweisdaten.';

INSERT INTO coach_pseudonym_key (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE coach_pseudonym_key ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON coach_pseudonym_key FROM anon, authenticated;

-- Parametrisierte Variante: NUR fuer Auswertungen im Systemkontext.
-- Sie wird bewusst NICHT an authenticated gegeben — sonst koennte ein
-- Nutzer das Pseudonym eines anderen berechnen und dessen Nachweise lesen.
CREATE OR REPLACE FUNCTION coach_pseudonym(p_user_id uuid)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, extensions
AS $$
  SELECT CASE
    WHEN p_user_id IS NULL THEN NULL
    ELSE encode(extensions.hmac(p_user_id::text::bytea, k.schluessel, 'sha256'), 'hex')
  END
  FROM coach_pseudonym_key k
  WHERE k.id = 1;
$$;

REVOKE ALL ON FUNCTION coach_pseudonym(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION coach_pseudonym(uuid) TO service_role;

-- Nutzer-Variante ohne Parameter: liefert ausschliesslich das eigene
-- Pseudonym. Basis aller RLS-Policies auf coach_nutzungsereignisse.
CREATE OR REPLACE FUNCTION coach_mein_pseudonym()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, extensions
AS $$
  SELECT coach_pseudonym(auth.uid());
$$;

REVOKE ALL ON FUNCTION coach_mein_pseudonym() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION coach_mein_pseudonym() TO authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- TEIL 2: coach_freischaltcodes — Betriebs-Seite (Genehmigung/Aktivierung)
-- ═══════════════════════════════════════════════════════════════════════════
-- Bildet Schritt 2 des DiPA-Nutzerflows ab: die Pflegekasse genehmigt und
-- der Nutzer erhaelt einen Aktivierungscode. Ob dieses Verfahren fuer DiPA
-- verbindlich so vorgesehen ist, ist eine offene regulatorische Frage —
-- die Tabelle bildet deshalb NUR den Mechanismus ab und ist ueber `quelle`
-- auch fuer Pilot-/Testzugaenge nutzbar.
--
-- DATENSCHUTZ: Der Code selbst wird NIE im Klartext gespeichert, nur als
-- SHA-256-Hash (zusaetzlich serverseitig gepfeffert, siehe
-- lib/coach/freischaltung.ts). Die Einloesung wird nur pseudonym vermerkt.

CREATE TABLE IF NOT EXISTS coach_freischaltcodes (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid NOT NULL DEFAULT current_org_id(),

  code_hash             text NOT NULL UNIQUE,
  code_praefix          text NOT NULL,        -- erste Zeichen, nur zur Wiedererkennung

  quelle                text NOT NULL DEFAULT 'pflegekasse'
                        CHECK (quelle IN ('pflegekasse','hersteller_pilot','testzugang')),
  kostentraeger_ik      text,                 -- IK der genehmigenden Pflegekasse, falls bekannt
  genehmigt_am          date,

  gueltig_von           date NOT NULL DEFAULT CURRENT_DATE,
  gueltig_bis           date,

  status                text NOT NULL DEFAULT 'ausgegeben'
                        CHECK (status IN ('ausgegeben','eingeloest','abgelaufen','storniert')),

  -- Verweis auf einen konfigurierten Abrechnungsweg (Schluessel, KEIN Betrag).
  -- Verguetungshoehen werden bewusst nirgends im System hinterlegt.
  abrechnungsweg_key    text,

  eingeloest_am         timestamptz,
  eingeloest_pseudonym  text,                 -- HMAC, NICHT auf coach_users joinbar

  notiz                 text,
  erstellt_von          uuid REFERENCES auth.users(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE coach_freischaltcodes IS
  'Betriebs-Seite der DiPA-Freischaltung: ausgegebene Aktivierungscodes (nur als Hash). Enthaelt KEINE Gesundheitsdaten und keinen Bezug auf coach_users — die Einloesung wird ausschliesslich pseudonym vermerkt.';

CREATE INDEX IF NOT EXISTS idx_coach_freischaltcodes_org
  ON coach_freischaltcodes(organization_id, status, created_at DESC);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_coach_freischaltcodes_updated_at') THEN
    CREATE TRIGGER trg_coach_freischaltcodes_updated_at BEFORE UPDATE ON coach_freischaltcodes
      FOR EACH ROW EXECUTE FUNCTION coach_set_updated_at();
  END IF;
END $$;

ALTER TABLE coach_freischaltcodes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'coach_freischaltcodes' AND policyname = 'admin_coach_freischaltcodes') THEN
    CREATE POLICY admin_coach_freischaltcodes ON coach_freischaltcodes FOR ALL
      TO authenticated USING (is_admin()) WITH CHECK (is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'coach_freischaltcodes' AND policyname = 'org_fence_coach_freischaltcodes') THEN
    CREATE POLICY org_fence_coach_freischaltcodes ON coach_freischaltcodes AS RESTRICTIVE FOR ALL
      TO authenticated USING (organization_id = current_org_id());
  END IF;
END $$;

REVOKE ALL ON coach_freischaltcodes FROM anon;

-- ═══════════════════════════════════════════════════════════════════════════
-- TEIL 3: coach_freischaltungen — Nutzer-Seite (Berechtigungsnachweis)
-- ═══════════════════════════════════════════════════════════════════════════
-- Der Nutzer sieht seine eigene Freischaltung (lesend). Geschrieben wird
-- ausschliesslich im Systemkontext beim Einloesen des Codes
-- (app/api/coach/freischaltung) — sonst koennte sich jeder Nutzer selbst
-- eine Freischaltung eintragen.

CREATE TABLE IF NOT EXISTS coach_freischaltungen (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_user_id      uuid NOT NULL REFERENCES coach_users(id) ON DELETE CASCADE,
  code_id            uuid REFERENCES coach_freischaltcodes(id) ON DELETE SET NULL,
  code_praefix       text,
  quelle             text NOT NULL DEFAULT 'pflegekasse'
                     CHECK (quelle IN ('pflegekasse','hersteller_pilot','testzugang')),
  status             text NOT NULL DEFAULT 'aktiv'
                     CHECK (status IN ('aktiv','abgelaufen','widerrufen')),
  gueltig_von        date NOT NULL DEFAULT CURRENT_DATE,
  gueltig_bis        date,
  freigeschaltet_am  timestamptz NOT NULL DEFAULT now(),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE coach_freischaltungen IS
  'Nutzer-Seite der DiPA-Freischaltung: Nachweis, dass fuer diesen Nutzer ein gueltiger Zugang besteht. Nur lesbar fuer den Nutzer selbst; Schreiben ausschliesslich im Systemkontext (Code-Einloesung).';

CREATE INDEX IF NOT EXISTS idx_coach_freischaltungen_user
  ON coach_freischaltungen(coach_user_id, status);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_coach_freischaltungen_updated_at') THEN
    CREATE TRIGGER trg_coach_freischaltungen_updated_at BEFORE UPDATE ON coach_freischaltungen
      FOR EACH ROW EXECUTE FUNCTION coach_set_updated_at();
  END IF;
END $$;

ALTER TABLE coach_freischaltungen ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'coach_freischaltungen' AND policyname = 'coach_freischaltungen_select_self') THEN
    CREATE POLICY coach_freischaltungen_select_self ON coach_freischaltungen FOR SELECT TO authenticated
      USING (coach_user_id IN (SELECT cu.id FROM coach_users cu WHERE cu.user_id = auth.uid()));
  END IF;
END $$;

REVOKE ALL ON coach_freischaltungen FROM anon;
REVOKE INSERT, UPDATE, DELETE ON coach_freischaltungen FROM authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- TEIL 4: coach_anspruchspruefungen — Schritt 1 des Nutzerflows
-- ═══════════════════════════════════════════════════════════════════════════
-- Reine Selbstauskunft als Orientierungshilfe ("Kann ich den PflegeCoach
-- ueber die Pflegekasse beantragen?"). KEINE Anspruchsentscheidung — die
-- trifft ausschliesslich die Pflegekasse. Kriterien versioniert, damit
-- nachvollziehbar bleibt, welche Fassung angewandt wurde.

CREATE TABLE IF NOT EXISTS coach_anspruchspruefungen (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_user_id         uuid NOT NULL REFERENCES coach_users(id) ON DELETE CASCADE,

  pflegegrad            integer CHECK (pflegegrad IS NULL OR pflegegrad BETWEEN 0 AND 5), -- 0 = kein Pflegegrad
  pflegegrad_beantragt  boolean NOT NULL DEFAULT false,
  haeusliche_versorgung boolean,
  nutzung_durch         text CHECK (nutzung_durch IS NULL OR nutzung_durch IN ('pflegebeduerftig','angehoerig','gemeinsam')),

  ergebnis              text NOT NULL CHECK (ergebnis IN ('anspruch_moeglich','anspruch_unklar','kein_anspruch')),
  kriterien_version     text NOT NULL,
  hinweise              text[] NOT NULL DEFAULT '{}',

  geprueft_am           timestamptz NOT NULL DEFAULT now(),
  created_at            timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE coach_anspruchspruefungen IS
  'Selbstauskunft zur Orientierung ueber einen moeglichen Leistungsanspruch. Keine Anspruchsentscheidung — diese trifft die Pflegekasse.';

CREATE INDEX IF NOT EXISTS idx_coach_anspruchspruefungen_user
  ON coach_anspruchspruefungen(coach_user_id, geprueft_am DESC);

ALTER TABLE coach_anspruchspruefungen ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'coach_anspruchspruefungen' AND policyname = 'coach_anspruchspruefungen_owner_all') THEN
    CREATE POLICY coach_anspruchspruefungen_owner_all ON coach_anspruchspruefungen FOR ALL TO authenticated
      USING (coach_user_id IN (SELECT cu.id FROM coach_users cu WHERE cu.user_id = auth.uid()))
      WITH CHECK (coach_user_id IN (SELECT cu.id FROM coach_users cu WHERE cu.user_id = auth.uid()));
  END IF;
END $$;

REVOKE ALL ON coach_anspruchspruefungen FROM anon;

-- ═══════════════════════════════════════════════════════════════════════════
-- TEIL 5: coach_nutzungsereignisse — pseudonymisierte Nachweise (Schritt 5)
-- ═══════════════════════════════════════════════════════════════════════════
-- Schliesst GAP-NUTZUNG: Kennzahlen fuer Evaluation/Wirksamkeitsnachweis,
-- ohne eine zweite Kopie der Gesundheitsdaten anzulegen.
--
-- DATENMINIMIERUNG (bewusst restriktiv):
--   * KEIN coach_user_id, KEIN auth-User — nur das HMAC-Pseudonym.
--   * KEIN exakter Zeitstempel — nur die Auswertungswoche (Montag).
--   * KEINE Inhalte/Werte — nur Ereignisart und Modul-Schluessel.
-- Damit ist eine Re-Identifikation ohne den Schluessel aus TEIL 1
-- ausgeschlossen.

CREATE TABLE IF NOT EXISTS coach_nutzungsereignisse (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pseudonym         text NOT NULL,
  ereignis          text NOT NULL CHECK (ereignis IN (
                      'sitzung_gestartet','modul_geoeffnet','modul_abgeschlossen',
                      'aktivitaet_erledigt','assessment_erfasst','ziel_angelegt',
                      'ziel_erreicht','messung_erfasst','bericht_erstellt','export_erstellt')),
  modul_key         text,
  rolle             text CHECK (rolle IS NULL OR rolle IN ('pflegebeduerftig','angehoerig','pflegedienst')),
  auswertungswoche  date NOT NULL DEFAULT (date_trunc('week', now())::date),
  anzahl            integer NOT NULL DEFAULT 1 CHECK (anzahl > 0)
);

COMMENT ON TABLE coach_nutzungsereignisse IS
  'Pseudonymisierte Nutzungsereignisse fuer die Evaluation (DiPAV-Nutzennachweis). Keine Klardaten, kein Zeitstempel, nur Woche + Ereignisart. Re-Identifikation nur mit dem Schluessel aus coach_pseudonym_key moeglich.';

CREATE INDEX IF NOT EXISTS idx_coach_nutzungsereignisse_woche
  ON coach_nutzungsereignisse(auswertungswoche, ereignis);
CREATE INDEX IF NOT EXISTS idx_coach_nutzungsereignisse_pseudonym
  ON coach_nutzungsereignisse(pseudonym, auswertungswoche);

ALTER TABLE coach_nutzungsereignisse ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'coach_nutzungsereignisse' AND policyname = 'coach_nutzungsereignisse_self_select') THEN
    CREATE POLICY coach_nutzungsereignisse_self_select ON coach_nutzungsereignisse FOR SELECT TO authenticated
      USING (pseudonym = coach_mein_pseudonym());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'coach_nutzungsereignisse' AND policyname = 'coach_nutzungsereignisse_self_insert') THEN
    CREATE POLICY coach_nutzungsereignisse_self_insert ON coach_nutzungsereignisse FOR INSERT TO authenticated
      WITH CHECK (pseudonym = coach_mein_pseudonym());
  END IF;
  -- Loeschung der eigenen Nachweisdaten (Art. 17 DSGVO, Loeschkonzept).
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'coach_nutzungsereignisse' AND policyname = 'coach_nutzungsereignisse_self_delete') THEN
    CREATE POLICY coach_nutzungsereignisse_self_delete ON coach_nutzungsereignisse FOR DELETE TO authenticated
      USING (pseudonym = coach_mein_pseudonym());
  END IF;
END $$;

REVOKE ALL ON coach_nutzungsereignisse FROM anon;
REVOKE UPDATE ON coach_nutzungsereignisse FROM authenticated;

-- Kein Audit-Trigger: die Tabelle hat weder coach_user_id noch eine
-- uuid-Primaerschluesselspalte (coach_audit_trigger castet id::uuid) und
-- enthaelt selbst nur Metadaten.

-- ═══════════════════════════════════════════════════════════════════════════
-- TEIL 6: coach_abrechnungswege — konfigurierbar, OHNE Betraege
-- ═══════════════════════════════════════════════════════════════════════════
-- Schritt 6 des Nutzerflows. Welcher Abrechnungsweg gilt, haengt von der
-- Zulassungskategorie ab und wird im Zulassungs-/Vertragsverfahren
-- bestimmt. Deshalb: Struktur ja, Betraege nein. `verguetung_geklaert`
-- bleibt false, bis eine Verguetungsvereinbarung tatsaechlich vorliegt.

CREATE TABLE IF NOT EXISTS coach_abrechnungswege (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL DEFAULT current_org_id(),
  schluessel          text NOT NULL,
  bezeichnung         text NOT NULL,
  beschreibung        text,
  rechtsgrundlage     text,       -- Freitext, z. B. Paragraf — extern zu verifizieren
  aktiv               boolean NOT NULL DEFAULT false,
  verguetung_geklaert boolean NOT NULL DEFAULT false,
  konfiguration       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, schluessel)
);

COMMENT ON TABLE coach_abrechnungswege IS
  'Konfigurierbare Abrechnungswege der DiPA. Bewusst OHNE Betraege/Preise — Verguetungshoehen ergeben sich erst aus dem Zulassungs- und Vertragsverfahren.';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_coach_abrechnungswege_updated_at') THEN
    CREATE TRIGGER trg_coach_abrechnungswege_updated_at BEFORE UPDATE ON coach_abrechnungswege
      FOR EACH ROW EXECUTE FUNCTION coach_set_updated_at();
  END IF;
END $$;

ALTER TABLE coach_abrechnungswege ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'coach_abrechnungswege' AND policyname = 'admin_coach_abrechnungswege') THEN
    CREATE POLICY admin_coach_abrechnungswege ON coach_abrechnungswege FOR ALL
      TO authenticated USING (is_admin()) WITH CHECK (is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'coach_abrechnungswege' AND policyname = 'org_fence_coach_abrechnungswege') THEN
    CREATE POLICY org_fence_coach_abrechnungswege ON coach_abrechnungswege AS RESTRICTIVE FOR ALL
      TO authenticated USING (organization_id = current_org_id());
  END IF;
END $$;

REVOKE ALL ON coach_abrechnungswege FROM anon;

-- ═══════════════════════════════════════════════════════════════════════════
-- TEIL 7: eul_erbringungen — Ergaenzende Unterstuetzungsleistungen (15d)
-- ═══════════════════════════════════════════════════════════════════════════
-- eUL sind PERSOENLICHE Leistungen des ambulanten Pflegedienstes rund um
-- die Nutzung einer DiPA. Sie sind damit BETRIEBSDATEN des Leistungs-
-- erbringers — nicht Teil des DiPA-Produkts.
--
-- ABGRENZUNG (bewusst hart im Datenmodell verankert):
--   * eUL-Daten stehen in eul_* mit org_fence + Admin-Zugriff.
--   * Sie enthalten KEINE Inhalte aus coach_* (kein Assessment, kein Ziel,
--     keine Messung) — nur die Tatsache und Art der erbrachten Begleitung.
--   * Der Bezug zur DiPA-Nutzung erfolgt ausschliesslich pseudonym und ist
--     optional; ohne Pseudonym ist es eine normale Begleitleistung.

CREATE TABLE IF NOT EXISTS eul_erbringungen (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id        uuid NOT NULL DEFAULT current_org_id(),

  booking_id             uuid REFERENCES bookings(id) ON DELETE SET NULL,
  client_id              uuid REFERENCES clients(id) ON DELETE SET NULL,
  coach_pseudonym        text,           -- optionale, nicht aufloesbare DiPA-Verknuepfung

  leistungsart           text NOT NULL CHECK (leistungsart IN (
                           'einweisung','technische_unterstuetzung','begleitete_nutzung',
                           'schulung_angehoerige','auswertungsgespraech')),
  datum                  date NOT NULL DEFAULT CURRENT_DATE,
  dauer_minuten          integer NOT NULL CHECK (dauer_minuten BETWEEN 1 AND 480),
  durchfuehrungsform     text NOT NULL DEFAULT 'persoenlich_vor_ort'
                         CHECK (durchfuehrungsform IN ('persoenlich_vor_ort','telefonisch','video')),
  inhalt                 text NOT NULL,

  erbracht_von           uuid REFERENCES auth.users(id),
  erbringer_name         text,
  qualifikation_geprueft boolean NOT NULL DEFAULT false,

  bestaetigt_am          timestamptz,
  bestaetigt_durch       text,           -- Name der bestaetigenden Person (Nachweisfuehrung)
  abrechnungsweg_key     text,           -- Schluessel, KEIN Betrag
  bemerkung              text,

  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE eul_erbringungen IS
  'Nachweis erbrachter ergaenzender Unterstuetzungsleistungen (persoenliche Begleitung rund um die DiPA-Nutzung). Betriebsdaten des Leistungserbringers — enthaelt keine DiPA-Gesundheitsdaten.';

CREATE INDEX IF NOT EXISTS idx_eul_erbringungen_org
  ON eul_erbringungen(organization_id, datum DESC);
CREATE INDEX IF NOT EXISTS idx_eul_erbringungen_client
  ON eul_erbringungen(client_id, datum DESC);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_eul_erbringungen_updated_at') THEN
    CREATE TRIGGER trg_eul_erbringungen_updated_at BEFORE UPDATE ON eul_erbringungen
      FOR EACH ROW EXECUTE FUNCTION coach_set_updated_at();
  END IF;
END $$;

ALTER TABLE eul_erbringungen ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'eul_erbringungen' AND policyname = 'admin_eul_erbringungen') THEN
    CREATE POLICY admin_eul_erbringungen ON eul_erbringungen FOR ALL
      TO authenticated USING (is_admin()) WITH CHECK (is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'eul_erbringungen' AND policyname = 'org_fence_eul_erbringungen') THEN
    CREATE POLICY org_fence_eul_erbringungen ON eul_erbringungen AS RESTRICTIVE FOR ALL
      TO authenticated USING (organization_id = current_org_id());
  END IF;
END $$;

REVOKE ALL ON eul_erbringungen FROM anon;

-- ───────────────────────────────────────────────────────────────────────────
-- TEIL 8: eul_qualifikationen — Qualitaetsanforderungen an eUL-Erbringer
-- ───────────────────────────────────────────────────────────────────────────
-- Die Kriterien selbst sind KONFIGURIERBAR (lib/coach/eul.ts,
-- audit/dipa/eul_qualitaetsanforderungen.md) — hier wird nur nachgehalten,
-- welcher Erbringer welches Kriterium wann nachgewiesen hat.

CREATE TABLE IF NOT EXISTS eul_qualifikationen (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL DEFAULT current_org_id(),
  user_id          uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  caregiver_id     uuid REFERENCES caregivers(id) ON DELETE CASCADE,
  erbringer_name   text,

  kriterium_key    text NOT NULL,
  erfuellt         boolean NOT NULL DEFAULT false,
  nachweis_art     text,          -- z. B. Zeugnis, Schulungsteilnahme, Einweisungsprotokoll
  geprueft_am      date,
  geprueft_durch   text,
  gueltig_bis      date,
  notiz            text,

  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE eul_qualifikationen IS
  'Nachweis der Qualitaetsanforderungen je eUL-Erbringer. Kriterienkatalog ist konfigurierbar (lib/coach/eul.ts) — hier nur die Erfuellungsnachweise.';

CREATE INDEX IF NOT EXISTS idx_eul_qualifikationen_org
  ON eul_qualifikationen(organization_id, kriterium_key);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_eul_qualifikationen_updated_at') THEN
    CREATE TRIGGER trg_eul_qualifikationen_updated_at BEFORE UPDATE ON eul_qualifikationen
      FOR EACH ROW EXECUTE FUNCTION coach_set_updated_at();
  END IF;
END $$;

ALTER TABLE eul_qualifikationen ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'eul_qualifikationen' AND policyname = 'admin_eul_qualifikationen') THEN
    CREATE POLICY admin_eul_qualifikationen ON eul_qualifikationen FOR ALL
      TO authenticated USING (is_admin()) WITH CHECK (is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'eul_qualifikationen' AND policyname = 'org_fence_eul_qualifikationen') THEN
    CREATE POLICY org_fence_eul_qualifikationen ON eul_qualifikationen AS RESTRICTIVE FOR ALL
      TO authenticated USING (organization_id = current_org_id());
  END IF;
END $$;

REVOKE ALL ON eul_qualifikationen FROM anon;

-- ═══════════════════════════════════════════════════════════════════════════
-- TEIL 9: Audit-Trigger auf den neuen nutzer-eigenen coach_*-Tabellen
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['coach_freischaltungen','coach_anspruchspruefungen'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_audit_' || t) THEN
      EXECUTE format(
        'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON %I
           FOR EACH ROW EXECUTE FUNCTION coach_audit_trigger()',
        'trg_audit_' || t, t);
    END IF;
  END LOOP;
END $$;
