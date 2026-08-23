-- ═══════════════════════════════════════════════════════════════════════
-- Sammelrechnungslauf: Betriebsfestigkeit (Batch-ID, Sperre, Wiederaufnahme)
-- ═══════════════════════════════════════════════════════════════════════
--
-- AUSGANGSLAGE
-- Der Sammelrechnungslauf (9243eaa, lib/billing/core/sammelrechnung.ts)
-- rechnet einen Monat in einem Durchgang ab. Er tut das fachlich korrekt
-- — alle Sperren der Einzelerstellung gelten unveraendert — aber er ist
-- ein reiner Vorgang ohne Gedaechtnis:
--
--   * Zwei gleichzeitige POST-Aufrufe liefen beide vollstaendig durch.
--     Doppelte Rechnungen verhinderte allein `create_invoice_draft_atomic`
--     ueber seinen Idempotenz-Riegel; die zweite Ausfuehrung erzeugte
--     trotzdem den vollen Last- und Audit-Aufwand und meldete demselben
--     Bearbeiter ein anderes Ergebnis.
--   * Brach ein Lauf ab (Timeout der Serverless-Funktion, Deploy, Fehler
--     in Gruppe 40 von 200), war NICHT feststellbar, wie weit er gekommen
--     war. Der naechste Lauf begann wieder bei Gruppe 1.
--   * Es gab keine Kennung, unter der sich ein Lauf spaeter nachvollziehen
--     liesse — weder in der Oberflaeche noch im Audit-Trail.
--
-- WAS DIESE MIGRATION ANLEGT
--   1. billing_audit_trail: die durch 20260921010000 verlorenen
--      entity_type-Werte zurueck, dazu 'sammelrechnungslauf' und die
--      Spalte batch_id
--   2. sammelrechnungslaeufe        — ein Kopfsatz je Lauf (die Batch-ID)
--   3. sammelrechnungslauf_gruppen  — eine Zeile je (Klient, Budget-Typ)
--   4. drei Funktionen: beanspruchen / heartbeat / abschliessen
--
-- WARUM DIE SPERRE EINE TABELLENZEILE IST UND KEIN SESSION-LOCK
-- pg_advisory_lock() haengt an der Datenbankverbindung. Der Lauf laeuft
-- aber in einer Serverless-Funktion und spricht ueber PostgREST — jede
-- einzelne Anweisung ist eine eigene Transaktion auf einer beliebigen
-- Verbindung aus dem Pool. Ein Session-Lock waere nach der ersten
-- Anweisung wieder weg und ein Transaktions-Lock ueberlebt keine zwei
-- Anweisungen. Deshalb:
--
--   * pg_advisory_xact_lock sichert NUR die Beanspruchung ab. Das ist
--     eine einzige kurze Transaktion, dafuer ist das Werkzeug richtig.
--   * Die eigentliche Sperre ist die Zeile mit status='laeuft', gehalten
--     von einem partiellen UNIQUE-Index. Sie ueberlebt Verbindung,
--     Instanz und Deployment.
--   * Damit ein abgestuerzter Lauf die Sperre nicht fuer immer haelt,
--     traegt jede Zeile einen Herzschlag. Ist er aelter als
--     p_stale_minuten, darf der naechste Lauf uebernehmen — und macht
--     dank der Gruppentabelle dort weiter, wo der abgestuerzte aufhoerte.
--
-- WAS DIESE MIGRATION NICHT TUT
-- Sie aendert keine Preisregel und keine Sperre der Rechnungserstellung.
-- Tarif-Fail-Closed, Unterschriftspflicht und Budgetdeckel liegen
-- unveraendert in create_invoice_draft_atomic. Diese Migration legt
-- ausschliesslich Betriebsdaten an: wer hat wann was gerechnet.
--
-- Rollback: 20260925000001_rollback_sammelrechnungslauf_haertung.sql
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════
-- 1) billing_audit_trail — verlorene Werte zurueck, batch_id dazu
-- ═══════════════════════════════════════════════════════════════════
--
-- BEFUND (2026-08-23)
-- Migration 20260921010000 (§ 302 Pipeline-Erweiterung) hat den CHECK
-- verworfen und mit einer selbst geschriebenen Liste neu gesetzt. In
-- dieser Liste fehlten zwei Werte, die vorher drin waren:
--
--   'invoice_draft'  — 20260912000000. Wird von JEDER uebersprungenen
--     Gruppe des Sammelrechnungslaufs geschrieben. Der Insert scheitert
--     seither mit 23514; weil der Aufruf in auditOderWarnen() gekapselt
--     ist, faellt der Lauf nicht um — er verliert nur genau die Spur,
--     um derentwillen es ihn gibt (welche erbrachte Leistung wurde NICHT
--     in Rechnung gestellt).
--   'tariff_lookup'  — 20260914000000. Wird INNERHALB von
--     create_invoice_draft_atomic geschrieben, wenn ein Tarif fehlt oder
--     mehrdeutig ist. Dort ist der Insert NICHT gekapselt: statt des
--     sprechenden MISSING_VALID_TARIFF kommt seither ein
--     Constraint-Fehler heraus, den parseTariffError() nicht erkennt.
--     Aus 'TARIF_FEHLT' wird im Lauf ein nichtssagendes 'FEHLER'.
--
-- Die Liste hier ist die Vereinigung aller je gesetzten Werte plus
-- 'sammelrechnungslauf'. Sie ist bewusst vollstaendig ausgeschrieben:
-- eine Migration, die diesen Constraint anfasst, muss ihn sehen koennen.
-- __tests__/abrechnung/schema-konsistenz.test.ts haelt sie gegen
-- AUDIT_ENTITY_TYPES und schlaegt an, sobald eine Migration ihn wieder
-- verkleinert.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'billing_audit_trail'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'billing_audit_trail_entity_type_check'
      AND pg_get_constraintdef(oid) LIKE '%sammelrechnungslauf%'
  ) THEN
    ALTER TABLE public.billing_audit_trail
      DROP CONSTRAINT IF EXISTS billing_audit_trail_entity_type_check;
    ALTER TABLE public.billing_audit_trail
      ADD CONSTRAINT billing_audit_trail_entity_type_check CHECK (
        entity_type = ANY(ARRAY[
          'invoice', 'invoice_draft', 'tariff', 'tariff_lookup', 'correction',
          'snapshot', 'credit_note',
          'payment', 'payment_allocation', 'dunning', 'payment_difference',
          'monthly_closing',
          'dta_lauf', 'dta_kostentraeger', 'dta_dakota_auftrag',
          'dta_ruecklaeufer', 'dta_fehlerprotokoll', 'dta_korrekturlauf',
          'dta_validierung', 'dta_lauf_rechnung', 'dta_annahmestelle',
          'dta_ruecklaeufer_position',
          'dokument', 'dokument_version', 'vertrag', 'kontaktperson',
          'verordnung', 'kundenakte', 'mitarbeiterakte',
          'sepa_mandate', 'sepa_batch', 'dunning_document',
          'billing_fristen',
          'camt_import', 'zahlungseingang', 'klaerfall', 'ruecklastschrift',
          'datev_export', 'datev_kontenzuordnung',
          'sgb_v_lauf', 'sgb_v_formatversion', 'sgb_v_routing',
          'kim_konfiguration', 'kim_formatversion', 'kim_karte', 'kim_nachricht',
          'dta_versand', 'dta_wiedervorlage', 'dta_fehlercode',
          'abrechnung_betriebsmodus', 'abrechnung_credential', 'dta_dead_letter',
          'sgb_v_korrekturlauf', 'sgb_v_uebertragung', 'sgb_v_zahlungszuordnung',
          -- Sammelrechnungslauf (Track 8) — der Kopfsatz des Laufs
          'sammelrechnungslauf'
        ])
      );
  END IF;
END;
$$;

-- Die Batch-ID gehoert an den Audit-Eintrag, nicht nur in dessen
-- new_state: nur als eigene Spalte laesst sich „zeig mir alles aus Lauf
-- X" ohne JSON-Suche beantworten.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'billing_audit_trail'
  ) THEN
    ALTER TABLE public.billing_audit_trail
      ADD COLUMN IF NOT EXISTS batch_id uuid;
    CREATE INDEX IF NOT EXISTS idx_billing_audit_trail_batch
      ON public.billing_audit_trail(batch_id, created_at)
      WHERE batch_id IS NOT NULL;
    COMMENT ON COLUMN public.billing_audit_trail.batch_id IS
      'Kennung des Sammel-/Stapellaufs, aus dem dieser Eintrag stammt '
      '(sammelrechnungslaeufe.id). NULL bei Einzelvorgaengen.';
  END IF;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════
-- 2) Kopfsatz je Lauf
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.sammelrechnungslaeufe (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id        uuid NOT NULL,
  -- Abrechnungsmonat als YYYY-MM. Kein date: der Lauf gilt fuer den
  -- Monat, nicht fuer einen Tag darin.
  period_month           text NOT NULL CHECK (period_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),

  status                 text NOT NULL DEFAULT 'laeuft'
    CHECK (status IN ('laeuft', 'abgeschlossen', 'abgebrochen', 'fehlgeschlagen')),

  -- Betriebsart. Vorschauen (dryRun) bekommen KEINEN Kopfsatz — sie
  -- schreiben nichts und sind kein Lauf. Die Spalten stehen hier fuer
  -- den Fall, dass eine spaetere Auswertung sie braucht.
  festschreiben          boolean NOT NULL DEFAULT false,
  auto_versand           boolean NOT NULL DEFAULT false,
  parameter              jsonb   NOT NULL DEFAULT '{}'::jsonb,

  actor_id               uuid,
  -- Wie oft wurde dieser Lauf angefasst? >1 heisst: er wurde
  -- wiederaufgenommen, nachdem der vorherige Versuch stehen blieb.
  versuch                integer NOT NULL DEFAULT 1 CHECK (versuch >= 1),

  gestartet_am           timestamptz NOT NULL DEFAULT now(),
  -- Herzschlag: der laufende Vorgang setzt ihn regelmaessig. Ein
  -- Herzschlag aelter als p_stale_minuten heisst „der Vorgang lebt
  -- nicht mehr" und gibt die Sperre frei.
  heartbeat_am           timestamptz NOT NULL DEFAULT now(),
  beendet_am             timestamptz,
  laufzeit_ms            integer,

  gruppen_gesamt         integer NOT NULL DEFAULT 0,
  gruppen_erstellt       integer NOT NULL DEFAULT 0,
  gruppen_uebersprungen  integer NOT NULL DEFAULT 0,
  gruppen_fehlgeschlagen integer NOT NULL DEFAULT 0,
  gruppen_offen          integer NOT NULL DEFAULT 0,
  summe_cent             bigint  NOT NULL DEFAULT 0,

  abbruchgrund           text,
  created_at             timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'organizations'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sammelrechnungslaeufe_organization_id_fkey'
  ) THEN
    ALTER TABLE public.sammelrechnungslaeufe
      ADD CONSTRAINT sammelrechnungslaeufe_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES public.organizations(id);
  END IF;
END;
$$;

-- DER SPERRRIEGEL. Hoechstens ein laufender Lauf je Mandant und Monat.
-- Selbst wenn zwei Instanzen den Advisory-Lock umgehen wuerden, kann
-- nur eine von beiden diese Zeile schreiben — die andere bekommt 23505.
CREATE UNIQUE INDEX IF NOT EXISTS uq_sammelrechnungslauf_aktiv
  ON public.sammelrechnungslaeufe(organization_id, period_month)
  WHERE status = 'laeuft';

CREATE INDEX IF NOT EXISTS idx_sammelrechnungslaeufe_org
  ON public.sammelrechnungslaeufe(organization_id, gestartet_am DESC);

CREATE INDEX IF NOT EXISTS idx_sammelrechnungslaeufe_monat
  ON public.sammelrechnungslaeufe(organization_id, period_month, gestartet_am DESC);

COMMENT ON TABLE public.sammelrechnungslaeufe IS
  'Kopfsatz je Sammelrechnungslauf. Die id ist die Batch-ID: sie steht in '
  'billing_audit_trail.batch_id und in der Oberflaeche. Vorschauen (dryRun) '
  'erzeugen KEINEN Kopfsatz.';
COMMENT ON COLUMN public.sammelrechnungslaeufe.heartbeat_am IS
  'Letztes Lebenszeichen des laufenden Vorgangs. Aelter als die '
  'Stale-Grenze ⇒ die Sperre gilt als verwaist und darf uebernommen werden.';

-- ═══════════════════════════════════════════════════════════════════
-- 3) Eine Zeile je Gruppe — die Grundlage der Wiederaufnahme
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.sammelrechnungslauf_gruppen (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lauf_id            uuid NOT NULL REFERENCES public.sammelrechnungslaeufe(id) ON DELETE CASCADE,
  organization_id    uuid NOT NULL,
  client_id          uuid NOT NULL,
  -- '' ist zugelassen: Leistungsnachweise ohne budget_type bilden eine
  -- eigene Gruppe, die dann als BUDGETTYP_UNBEKANNT uebersprungen wird.
  -- Wuerde man sie hier ausschliessen, verschwaende genau der Fall, den
  -- der Lauf sichtbar machen soll.
  budget_type        text NOT NULL,

  status             text NOT NULL DEFAULT 'offen'
    CHECK (status IN ('offen', 'erstellt', 'uebersprungen', 'fehlgeschlagen')),
  code               text,
  grund              text,

  invoice_id         uuid,
  invoice_number     text,
  betrag_cent        bigint,
  bestand            boolean NOT NULL DEFAULT false,   -- Rechnung gab es schon
  festgeschrieben    boolean NOT NULL DEFAULT false,
  versand_status     text,

  service_record_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  verarbeitet_am     timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),

  -- Der Idempotenz-Riegel INNERHALB eines Laufs: eine Gruppe kann pro
  -- Lauf nur einmal ein Ergebnis haben. Ein wiederaufgenommener Lauf
  -- erkennt daran, was schon erledigt ist.
  CONSTRAINT uq_sammelrechnungslauf_gruppe UNIQUE (lauf_id, client_id, budget_type)
);

CREATE INDEX IF NOT EXISTS idx_sammelrechnungslauf_gruppen_lauf
  ON public.sammelrechnungslauf_gruppen(lauf_id, status);

CREATE INDEX IF NOT EXISTS idx_sammelrechnungslauf_gruppen_org
  ON public.sammelrechnungslauf_gruppen(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sammelrechnungslauf_gruppen_invoice
  ON public.sammelrechnungslauf_gruppen(invoice_id)
  WHERE invoice_id IS NOT NULL;

COMMENT ON TABLE public.sammelrechnungslauf_gruppen IS
  'Ergebnis je (Klient, Budget-Typ) innerhalb eines Laufs. Zweck ist die '
  'Wiederaufnahme: was hier nicht mehr auf "offen" steht, wird beim naechsten '
  'Versuch uebersprungen.';

-- ═══════════════════════════════════════════════════════════════════
-- 4) Beanspruchen — die eigentliche Parallelitaetssperre
-- ═══════════════════════════════════════════════════════════════════
--
-- Ergebnis:
--   lauf_id        Batch-ID (neu oder wiederaufgenommen)
--   wiederaufnahme true = es gab schon Gruppen, die uebersprungen werden
--   offene_gruppen wie viele Gruppen im Vorlauf noch nicht erledigt waren
--
-- Faellt die Beanspruchung aus, weil bereits ein lebender Lauf
-- existiert, wird eine Ausnahme mit dem Code 'SAMMELRECHNUNG_LAEUFT'
-- geworfen. Fail-closed: der zweite Aufruf erzeugt KEINE Rechnungen und
-- bekommt auch keine halbe Antwort, sondern eine klare Absage.
CREATE OR REPLACE FUNCTION public.sammelrechnung_lauf_beanspruchen(
  p_organization_id uuid,
  p_period_month    text,
  p_actor_id        uuid,
  p_parameter       jsonb   DEFAULT '{}'::jsonb,
  p_festschreiben   boolean DEFAULT false,
  p_auto_versand    boolean DEFAULT false,
  p_stale_minuten   integer DEFAULT 15
)
RETURNS TABLE (lauf_id uuid, wiederaufnahme boolean, offene_gruppen integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_vorhanden  public.sammelrechnungslaeufe%ROWTYPE;
  v_id         uuid;
  v_erledigt   integer;
BEGIN
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'SAMMELRECHNUNG_OHNE_MANDANT: organization_id ist Pflicht';
  END IF;
  IF p_period_month !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION 'SAMMELRECHNUNG_MONAT_UNGUELTIG: % ist kein Monat im Format YYYY-MM', p_period_month;
  END IF;

  -- Serialisiert ausschliesslich die Beanspruchung. Der Lock faellt mit
  -- dieser Transaktion — das ist gewollt, die Dauersperre ist die Zeile.
  PERFORM pg_advisory_xact_lock(
    hashtext('sammelrechnung:' || p_organization_id::text || ':' || p_period_month)
  );

  SELECT * INTO v_vorhanden
  FROM public.sammelrechnungslaeufe
  WHERE organization_id = p_organization_id
    AND period_month = p_period_month
    AND status = 'laeuft'
  FOR UPDATE;

  IF FOUND THEN
    IF v_vorhanden.heartbeat_am > now() - make_interval(mins => p_stale_minuten) THEN
      RAISE EXCEPTION
        'SAMMELRECHNUNG_LAEUFT: Für % läuft bereits ein Lauf (%). Letztes Lebenszeichen %.',
        p_period_month, v_vorhanden.id, v_vorhanden.heartbeat_am;
    END IF;

    -- Verwaiste Sperre: uebernehmen statt neu anfangen. Die bereits
    -- erledigten Gruppen bleiben stehen und werden gleich uebersprungen.
    UPDATE public.sammelrechnungslaeufe
       SET heartbeat_am  = now(),
           versuch       = versuch + 1,
           actor_id      = p_actor_id,
           festschreiben = p_festschreiben,
           auto_versand  = p_auto_versand,
           parameter     = p_parameter,
           abbruchgrund  = NULL
     WHERE id = v_vorhanden.id;
    v_id := v_vorhanden.id;
  ELSE
    -- Ein frueher abgebrochener Lauf desselben Monats wird fortgesetzt,
    -- statt einen zweiten Kopfsatz zu erzeugen. Sonst haette derselbe
    -- Monat am Ende drei halbe Laeufe und keinen ganzen.
    SELECT * INTO v_vorhanden
    FROM public.sammelrechnungslaeufe
    WHERE organization_id = p_organization_id
      AND period_month = p_period_month
      AND status = 'abgebrochen'
    ORDER BY gestartet_am DESC
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
      UPDATE public.sammelrechnungslaeufe
         SET status        = 'laeuft',
             heartbeat_am  = now(),
             versuch       = versuch + 1,
             actor_id      = p_actor_id,
             festschreiben = p_festschreiben,
             auto_versand  = p_auto_versand,
             parameter     = p_parameter,
             beendet_am    = NULL,
             laufzeit_ms   = NULL,
             abbruchgrund  = NULL
       WHERE id = v_vorhanden.id;
      v_id := v_vorhanden.id;
    ELSE
      INSERT INTO public.sammelrechnungslaeufe
        (organization_id, period_month, actor_id, parameter, festschreiben, auto_versand)
      VALUES
        (p_organization_id, p_period_month, p_actor_id, p_parameter, p_festschreiben, p_auto_versand)
      RETURNING id INTO v_id;
    END IF;
  END IF;

  -- Tabellen-Alias und Qualifizierung sind hier Pflicht: die
  -- RETURNS-TABLE-Spalte heisst ebenfalls `lauf_id`, und ein
  -- unqualifiziertes `lauf_id` waere fuer plpgsql mehrdeutig (42702).
  SELECT count(*)::int INTO v_erledigt
  FROM public.sammelrechnungslauf_gruppen g
  WHERE g.lauf_id = v_id AND g.status <> 'offen';

  RETURN QUERY
  SELECT v_id,
         v_erledigt > 0,
         (SELECT count(*)::int FROM public.sammelrechnungslauf_gruppen g2
           WHERE g2.lauf_id = v_id AND g2.status = 'offen');
END;
$$;

-- ═══════════════════════════════════════════════════════════════════
-- 5) Herzschlag
-- ═══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.sammelrechnung_lauf_heartbeat(p_lauf_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  UPDATE public.sammelrechnungslaeufe
     SET heartbeat_am = now()
   WHERE id = p_lauf_id AND status = 'laeuft'
  RETURNING true;
$$;

COMMENT ON FUNCTION public.sammelrechnung_lauf_heartbeat(uuid) IS
  'Lebenszeichen des laufenden Vorgangs. Liefert NULL, wenn der Lauf nicht '
  '(mehr) auf "laeuft" steht — dann hat ihn jemand uebernommen oder beendet.';

-- ═══════════════════════════════════════════════════════════════════
-- 6) Abschliessen — Zaehler aus den Gruppen, nicht aus dem Aufrufer
-- ═══════════════════════════════════════════════════════════════════
--
-- Die Zahlen werden hier aus sammelrechnungslauf_gruppen berechnet und
-- NICHT vom Aufrufer entgegengenommen. Ein Aufrufer, der mitten im Lauf
-- stirbt, kann keine Zahlen mehr melden; die Gruppentabelle steht
-- trotzdem. So stimmt der Kopfsatz auch nach einem Absturz.
CREATE OR REPLACE FUNCTION public.sammelrechnung_lauf_abschliessen(
  p_lauf_id      uuid,
  p_status       text DEFAULT 'abgeschlossen',
  p_abbruchgrund text DEFAULT NULL
)
RETURNS public.sammelrechnungslaeufe
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_zeile public.sammelrechnungslaeufe%ROWTYPE;
BEGIN
  IF p_status NOT IN ('abgeschlossen', 'abgebrochen', 'fehlgeschlagen') THEN
    RAISE EXCEPTION 'SAMMELRECHNUNG_STATUS_UNGUELTIG: %', p_status;
  END IF;

  UPDATE public.sammelrechnungslaeufe l
     SET status                 = p_status,
         beendet_am             = now(),
         laufzeit_ms            = GREATEST(0, (EXTRACT(EPOCH FROM (now() - l.gestartet_am)) * 1000)::int),
         abbruchgrund           = p_abbruchgrund,
         gruppen_gesamt         = z.gesamt,
         gruppen_erstellt       = z.erstellt,
         gruppen_uebersprungen  = z.uebersprungen,
         gruppen_fehlgeschlagen = z.fehlgeschlagen,
         gruppen_offen          = z.offen,
         -- Bestandsrechnungen zaehlen nicht in die Summe: sie waren
         -- schon da. Sonst meldete jeder Wiederholungslauf denselben
         -- Umsatz noch einmal.
         summe_cent             = z.summe
    FROM (
      SELECT
        count(*)::int                                                        AS gesamt,
        count(*) FILTER (WHERE status = 'erstellt')::int                     AS erstellt,
        count(*) FILTER (WHERE status = 'uebersprungen')::int                AS uebersprungen,
        count(*) FILTER (WHERE status = 'fehlgeschlagen')::int               AS fehlgeschlagen,
        count(*) FILTER (WHERE status = 'offen')::int                        AS offen,
        coalesce(sum(betrag_cent) FILTER (WHERE status = 'erstellt' AND NOT bestand), 0)::bigint AS summe
      FROM public.sammelrechnungslauf_gruppen
      WHERE lauf_id = p_lauf_id
    ) z
   WHERE l.id = p_lauf_id
  RETURNING l.* INTO v_zeile;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SAMMELRECHNUNG_LAUF_UNBEKANNT: %', p_lauf_id;
  END IF;

  RETURN v_zeile;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════
-- 7) RLS
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE public.sammelrechnungslaeufe        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sammelrechnungslauf_gruppen  ENABLE ROW LEVEL SECURITY;

-- Lesen darf, wer Abrechnung lesen darf (Buchhaltung, PDL, QM sieht
-- keine Abrechnung, Administration). Schreiben tut ausschliesslich
-- service_role ueber die Routen — deshalb gibt es KEINE Schreibpolicy:
-- ein Lauf ist ein Protokoll, keine Eingabemaske.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['sammelrechnungslaeufe', 'sammelrechnungslauf_gruppen'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t AND policyname = 'rk_' || t || '_lesen'
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT USING '
        '(public.darf(''abrechnung.lesen'') AND organization_id = public.current_org_id())',
        'rk_' || t || '_lesen', t
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t AND policyname = 'org_fence_' || t
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL '
        'USING (organization_id = public.current_org_id())',
        'org_fence_' || t, t
      );
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON TABLE public.sammelrechnungslaeufe       FROM anon;
REVOKE ALL ON TABLE public.sammelrechnungslauf_gruppen FROM anon;

-- Jede public-Funktion ist per Default anon-ausfuehrbar (20260922000000).
-- Beanspruchen und Abschliessen bewegen Betriebszustand; Heartbeat auch.
-- Keine davon hat ausserhalb des Servers etwas zu suchen.
REVOKE ALL ON FUNCTION public.sammelrechnung_lauf_beanspruchen(uuid, text, uuid, jsonb, boolean, boolean, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sammelrechnung_lauf_heartbeat(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sammelrechnung_lauf_abschliessen(uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sammelrechnung_lauf_beanspruchen(uuid, text, uuid, jsonb, boolean, boolean, integer)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.sammelrechnung_lauf_heartbeat(uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.sammelrechnung_lauf_abschliessen(uuid, text, text)
  TO service_role;

COMMIT;
