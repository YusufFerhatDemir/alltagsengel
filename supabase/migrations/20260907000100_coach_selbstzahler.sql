-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: PflegeCoach — Selbstzahler-Verkaufsweg
-- Datum:     2026-09-07 (sequenziell), erstellt 2026-08-14
-- Projekt:   Alltagsengel UG — Digitaler PflegeCoach
-- Baut auf:  20260819010000_pflegecoach_dipa_modul.sql
--            20260826010000_dipa_freischaltung_nachweise_eul.sql
-- Rollback:  20260907000001_rollback_coach_selbstzahler.sql
-- ═══════════════════════════════════════════════════════════════════════════
-- IDEMPOTENT: alle Statements mit IF NOT EXISTS / DO-Guards.
--
-- ZWECK: Der PflegeCoach wird als privat zu zahlendes Angebot verkauft.
-- Diese Migration legt an, was ein Kaufvertrag braucht: Bestellung,
-- Zahlungsverlauf, Rechnung. Der ZUGANG selbst bekommt KEINE neue Tabelle —
-- er laeuft weiter ueber coach_freischaltungen, die dafuer nur eine neue
-- `quelle` ('selbstzahler') erhaelt. Damit bleibt istFreigeschaltet()
-- (lib/coach/freischaltung.ts) die einzige Zugangs-Wahrheit, egal ob der
-- Zugang bezahlt, pilotiert oder getestet ist.
--
-- ═══ KEINE KASSEN-, KOSTENTRAEGER- ODER ERSTATTUNGSBEZUEGE ════════════════
-- Kein Feld dieser Migration verweist auf einen Kostentraeger, ein IK, eine
-- Genehmigung oder einen Erstattungsanspruch. Der DiPA-Weg (coach_freischalt-
-- codes, coach_abrechnungswege) bleibt davon unberuehrt und weiterhin
-- deaktiviert (COACH_DIPA_MODUS=false).
--
-- ═══ PRODUKTGRENZE ═══════════════════════════════════════════════════════
-- Die Tabellen hier enthalten Vertrags- und Zahlungsdaten, KEINE
-- Gesundheitsdaten. Sie sind trotzdem an coach_users gehaengt und tragen
-- dieselbe Selbst-RLS: Der Nutzer sieht ausschliesslich seine eigenen
-- Bestellungen, ein Admin sieht sie ueberhaupt nicht. Geschrieben wird
-- ausschliesslich im Systemkontext (Stripe-Webhook mit service_role) —
-- authenticated hat auf allen drei Tabellen NUR Leserechte. Ein Nutzer
-- koennte sich sonst per PostgREST-UPDATE selbst einen bezahlten Zugang
-- eintragen.
--
-- BETRAEGE IN CENT: Ganzzahlig, nie Fliesskomma. Die Betriebs-Abrechnung
-- fuehrt total_amount in Euro; diese Doppeldeutigkeit hat schon einmal
-- Faktor-100-Fehler erzeugt. Hier steht die Einheit im Spaltennamen.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- TEIL 1: coach_bestellungen — der Vertrag
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS coach_bestellungen (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_user_id            uuid NOT NULL REFERENCES coach_users(id) ON DELETE CASCADE,

  tarif                    text NOT NULL CHECK (tarif IN ('monatlich','jaehrlich')),
  -- Preis zum Zeitpunkt des Vertragsschlusses. Bewusst kopiert und nicht
  -- zur Laufzeit aus der Konfiguration gelesen: Eine spaetere Preisaenderung
  -- darf eine bestehende Bestellung und ihre Rechnungen nicht rueckwirkend
  -- veraendern.
  betrag_cent              integer NOT NULL CHECK (betrag_cent >= 0),
  waehrung                 text NOT NULL DEFAULT 'EUR',
  intervall_monate         smallint NOT NULL CHECK (intervall_monate > 0),

  status                   text NOT NULL DEFAULT 'offen'
                           CHECK (status IN ('offen','aktiv','gekuendigt','abgelaufen',
                                             'widerrufen','zahlung_offen','gesperrt')),

  -- Rechnungsanschrift. Pflichtangabe nach § 14 Abs. 4 UStG und deshalb im
  -- Checkout erhoben — nicht aus dem Alltagsengel-Profil uebernommen, das
  -- fuer viele Coach-Nutzer gar nicht befuellt ist.
  rechnung_name            text NOT NULL,
  rechnung_strasse         text NOT NULL,
  rechnung_plz             text NOT NULL,
  rechnung_ort             text NOT NULL,
  rechnung_land            text NOT NULL DEFAULT 'Deutschland',
  rechnung_email           text NOT NULL,

  -- Vertragsschluss = Fristbeginn fuer den Widerruf (§ 355 BGB).
  bestellt_am              timestamptz NOT NULL DEFAULT now(),
  -- Ende des aktuell bezahlten Zeitraums. NULL solange nicht bezahlt.
  laufzeit_bis             date,

  gekuendigt_am            timestamptz,
  widerrufen_am            timestamptz,

  -- Nachweis der eingeholten Zustimmungen. KEINE Verzichtserklaerung auf das
  -- Widerrufsrecht — die gibt es in diesem Bestellweg bewusst nicht
  -- (siehe lib/coach/bestellung.ts).
  agb_akzeptiert_am        timestamptz NOT NULL,
  datenschutz_akzeptiert_am timestamptz NOT NULL,
  widerrufsbelehrung_version text NOT NULL,

  stripe_customer_id       text,
  stripe_subscription_id   text UNIQUE,
  stripe_checkout_id       text UNIQUE,

  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE coach_bestellungen IS
  'PflegeCoach-Selbstzahler: Kaufvertrag eines Nutzers. Enthaelt Vertrags- und Rechnungsdaten, keine Gesundheitsdaten und keinen Kostentraegerbezug. Nur lesbar fuer den Nutzer selbst; Schreiben ausschliesslich im Systemkontext.';

COMMENT ON COLUMN coach_bestellungen.betrag_cent IS
  'Bruttobetrag je Abrechnungszeitraum in CENT (nicht Euro), eingefroren zum Vertragsschluss.';

CREATE INDEX IF NOT EXISTS idx_coach_bestellungen_user
  ON coach_bestellungen(coach_user_id, status);
CREATE INDEX IF NOT EXISTS idx_coach_bestellungen_sub
  ON coach_bestellungen(stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_coach_bestellungen_updated_at') THEN
    CREATE TRIGGER trg_coach_bestellungen_updated_at BEFORE UPDATE ON coach_bestellungen
      FOR EACH ROW EXECUTE FUNCTION coach_set_updated_at();
  END IF;
END $$;

ALTER TABLE coach_bestellungen ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'coach_bestellungen' AND policyname = 'coach_bestellungen_select_self') THEN
    CREATE POLICY coach_bestellungen_select_self ON coach_bestellungen FOR SELECT TO authenticated
      USING (coach_user_id IN (SELECT cu.id FROM coach_users cu WHERE cu.user_id = auth.uid()));
  END IF;
END $$;

REVOKE ALL ON coach_bestellungen FROM anon;
REVOKE INSERT, UPDATE, DELETE ON coach_bestellungen FROM authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- TEIL 2: coach_zahlungen — der Zahlungsverlauf
-- ═══════════════════════════════════════════════════════════════════════════
-- Append-only gedacht: jede Abbuchung, jeder Fehlschlag und jede Erstattung
-- ist eine eigene Zeile. Kein UPDATE auf einer bestehenden Zahlung — sonst
-- waere die Zahlungshistorie auf der Kontoseite nicht mehr die Wahrheit,
-- sondern nur der letzte Stand.

CREATE TABLE IF NOT EXISTS coach_zahlungen (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bestellung_id          uuid NOT NULL REFERENCES coach_bestellungen(id) ON DELETE CASCADE,
  coach_user_id          uuid NOT NULL REFERENCES coach_users(id) ON DELETE CASCADE,

  art                    text NOT NULL
                         CHECK (art IN ('zahlung','fehlgeschlagen','erstattung')),
  -- Bei 'erstattung' positiv erfasst; die Richtung steckt in `art`.
  betrag_cent            integer NOT NULL CHECK (betrag_cent >= 0),
  waehrung               text NOT NULL DEFAULT 'EUR',

  -- Bezahlter Zeitraum. Bei fehlgeschlagenen Zahlungen NULL.
  zeitraum_von           date,
  zeitraum_bis           date,

  -- Klartext-Grund bei Fehlschlag (Stripe-Meldung, gekuerzt). Nie eine
  -- Kartennummer, nie ein Token — nur der Ablehnungsgrund.
  fehlergrund            text,

  stripe_invoice_id      text UNIQUE,
  stripe_payment_intent  text,

  gebucht_am             timestamptz NOT NULL DEFAULT now(),
  created_at             timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE coach_zahlungen IS
  'PflegeCoach-Selbstzahler: Zahlungsverlauf einer Bestellung (Abbuchung, Fehlschlag, Erstattung). Append-only. Enthaelt keine Zahlungsmitteldaten.';

CREATE INDEX IF NOT EXISTS idx_coach_zahlungen_bestellung
  ON coach_zahlungen(bestellung_id, gebucht_am DESC);
CREATE INDEX IF NOT EXISTS idx_coach_zahlungen_user
  ON coach_zahlungen(coach_user_id, gebucht_am DESC);

ALTER TABLE coach_zahlungen ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'coach_zahlungen' AND policyname = 'coach_zahlungen_select_self') THEN
    CREATE POLICY coach_zahlungen_select_self ON coach_zahlungen FOR SELECT TO authenticated
      USING (coach_user_id IN (SELECT cu.id FROM coach_users cu WHERE cu.user_id = auth.uid()));
  END IF;
END $$;

REVOKE ALL ON coach_zahlungen FROM anon;
REVOKE INSERT, UPDATE, DELETE ON coach_zahlungen FROM authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- TEIL 3: Nummernkreis + coach_rechnungen
-- ═══════════════════════════════════════════════════════════════════════════
-- Eigener Nummernkreis mit Praefix 'PC', getrennt vom Pflege-Nummernkreis.
--
-- Eine einzige, nie zurueckgesetzte Sequenz. Die Alternative — pro Jahr bei
-- 1 beginnen — braucht entweder eine zweite Tabelle oder ein SELECT max()+1,
-- und max()+1 vergibt bei zwei gleichzeitig eintreffenden Stripe-Webhooks
-- dieselbe Nummer zweimal. Eine doppelte Rechnungsnummer ist ein
-- Buchhaltungsfehler; eine Luecke zum Jahreswechsel ist keiner.

CREATE SEQUENCE IF NOT EXISTS coach_rechnung_nummer_seq START 1;

-- SECURITY DEFINER mit gesetztem search_path (sonst waere die Funktion ueber
-- einen untergeschobenen Suchpfad angreifbar — bekannter Befund aus dem
-- Sicherheits-Audit vom 13.08.2026).
CREATE OR REPLACE FUNCTION coach_naechste_rechnungsnummer()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
VOLATILE
SET search_path = public
AS $$
  SELECT 'PC-' || to_char(now() AT TIME ZONE 'Europe/Berlin', 'YYYY') || '-'
         || lpad(nextval('coach_rechnung_nummer_seq')::text, 6, '0');
$$;

-- Nur der Systemkontext darf Nummern ziehen. Ein authenticated-Aufruf
-- koennte sonst die Sequenz hochzaehlen und Luecken erzeugen.
REVOKE ALL ON FUNCTION coach_naechste_rechnungsnummer() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION coach_naechste_rechnungsnummer() TO service_role;

CREATE TABLE IF NOT EXISTS coach_rechnungen (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bestellung_id     uuid NOT NULL REFERENCES coach_bestellungen(id) ON DELETE CASCADE,
  coach_user_id     uuid NOT NULL REFERENCES coach_users(id) ON DELETE CASCADE,
  zahlung_id        uuid REFERENCES coach_zahlungen(id) ON DELETE SET NULL,

  nummer            text NOT NULL UNIQUE,
  rechnungsdatum    date NOT NULL DEFAULT (now() AT TIME ZONE 'Europe/Berlin')::date,

  leistung_von      date NOT NULL,
  leistung_bis      date NOT NULL,

  brutto_cent       integer NOT NULL CHECK (brutto_cent >= 0),
  netto_cent        integer NOT NULL CHECK (netto_cent >= 0),
  steuer_cent       integer NOT NULL CHECK (steuer_cent >= 0),
  steuersatz        numeric(4,2) NOT NULL DEFAULT 0,
  waehrung          text NOT NULL DEFAULT 'EUR',

  -- Anschrift zum Zeitpunkt der Rechnungsstellung, eingefroren. Eine spaeter
  -- geaenderte Adresse darf eine bereits ausgestellte Rechnung nicht
  -- veraendern (GoBD: Unveraenderbarkeit).
  empfaenger_name   text NOT NULL,
  empfaenger_anschrift text NOT NULL,

  -- Vermerk, falls bei Ausstellung eine Pflichtangabe nach § 14 UStG fehlte
  -- (in der Regel die noch nicht zugeteilte Steuernummer). Sichtbar statt
  -- stillschweigend — siehe pruefeRechnungsangaben() in lib/coach/rechnung.ts.
  angaben_unvollstaendig text,

  storniert_am      timestamptz,
  storno_grund      text,

  created_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE coach_rechnungen IS
  'PflegeCoach-Selbstzahler: ausgestellte Rechnungen mit eigenem Nummernkreis (Praefix PC). Unveraenderlich — Korrekturen erfolgen ueber Storno plus Neuausstellung, nicht per UPDATE.';

CREATE INDEX IF NOT EXISTS idx_coach_rechnungen_user
  ON coach_rechnungen(coach_user_id, rechnungsdatum DESC);
CREATE INDEX IF NOT EXISTS idx_coach_rechnungen_bestellung
  ON coach_rechnungen(bestellung_id);

ALTER TABLE coach_rechnungen ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'coach_rechnungen' AND policyname = 'coach_rechnungen_select_self') THEN
    CREATE POLICY coach_rechnungen_select_self ON coach_rechnungen FOR SELECT TO authenticated
      USING (coach_user_id IN (SELECT cu.id FROM coach_users cu WHERE cu.user_id = auth.uid()));
  END IF;
END $$;

REVOKE ALL ON coach_rechnungen FROM anon;
REVOKE INSERT, UPDATE, DELETE ON coach_rechnungen FROM authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- TEIL 4: coach_freischaltungen um die Selbstzahler-Quelle erweitern
-- ═══════════════════════════════════════════════════════════════════════════
-- Der bezahlte Zugang ist keine neue Art von Zugang, sondern eine weitere
-- Quelle. Dadurch gilt istFreigeschaltet() unveraendert und es entsteht kein
-- zweiter, konkurrierender Zugangspfad, der irgendwann auseinanderlaeuft.

DO $$
DECLARE
  v_constraint text;
BEGIN
  SELECT conname INTO v_constraint
  FROM pg_constraint
  WHERE conrelid = 'coach_freischaltungen'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%quelle%';

  IF v_constraint IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conrelid = 'coach_freischaltungen'::regclass
         AND pg_get_constraintdef(oid) ILIKE '%selbstzahler%'
     )
  THEN
    EXECUTE format('ALTER TABLE coach_freischaltungen DROP CONSTRAINT %I', v_constraint);
    ALTER TABLE coach_freischaltungen
      ADD CONSTRAINT coach_freischaltungen_quelle_check
      CHECK (quelle IN ('pflegekasse','hersteller_pilot','testzugang','selbstzahler'));
  END IF;
END $$;

-- Verweis von der Freischaltung auf die Bestellung, die sie ausgeloest hat.
-- Nullable: Pilot- und Testzugaenge haben keine Bestellung.
ALTER TABLE coach_freischaltungen
  ADD COLUMN IF NOT EXISTS bestellung_id uuid REFERENCES coach_bestellungen(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_coach_freischaltungen_bestellung
  ON coach_freischaltungen(bestellung_id) WHERE bestellung_id IS NOT NULL;

COMMENT ON COLUMN coach_freischaltungen.bestellung_id IS
  'Selbstzahler-Zugaenge: die Bestellung, aus der dieser Zugang stammt. NULL bei Pilot-/Testzugaengen.';
