-- ═══════════════════════════════════════════════════════════════════════
-- Wiederholungslauf fuer Benachrichtigungen (Retry-Worker + Dead Letter)
-- ═══════════════════════════════════════════════════════════════════════
--
-- AUSGANGSLAGE
-- 20260923000000 hat notification_delivery_log angelegt und
-- lib/notifications/retry.ts den idempotenten Versandweg. Was fehlte,
-- war der AUFRUFER: es gab keinen Job, der fehlgeschlagene Zustellungen
-- jemals wieder anfasst. Eine Mail, die an einem Resend-Ausfall
-- gescheitert ist, blieb fuer immer liegen — sichtbar nur, wenn jemand
-- das Protokoll von Hand liest.
--
-- WARUM DAS PROTOKOLL DAFUER NICHT REICHTE
-- notification_delivery_log speichert bewusst KEINEN Nachrichteninhalt
-- (Gesundheits- und Finanzdaten haben in einem Betriebsprotokoll nichts
-- verloren). Eine Wiederholung muss den fachlichen Vorgang deshalb neu
-- ausfuehren. Dafuer braucht sie zwei Angaben, die bisher nirgends
-- standen:
--
--   * WELCHE Art von Vorgang war das (booking-neu, booking-zusage, …)
--   * auf WELCHEN Datensatz bezog er sich (die Buchung, der Termin)
--
-- Die correlation_id ist eine UUID v5 ueber genau diese Teile — aus ihr
-- laesst sich nichts zurueckrechnen, das ist der Sinn eines Hashes.
-- Deshalb kommen drei ID-Spalten dazu. Sie tragen ausschliesslich
-- Schluessel, nie Inhalt: zwei davon sind vom Typ uuid, die dritte ist
-- per CHECK auf einen Bezeichner-Slug begrenzt. Freitext passt dort
-- strukturell nicht hinein.
--
-- WARUM DIE SPERRE EINE TABELLENZEILE IST
-- Gleiche Begruendung wie beim Sammelrechnungslauf (20260925000000): der
-- Lauf lebt in einer Serverless-Funktion und spricht ueber PostgREST.
-- Jede Anweisung ist eine eigene Transaktion auf einer beliebigen
-- Verbindung aus dem Pool — ein Session-Lock waere nach der ersten
-- Anweisung weg, ein Transaktions-Lock ueberlebt keine zwei Anweisungen.
-- pg_advisory_xact_lock sichert hier nur die Beanspruchung selbst ab;
-- die Dauersperre ist die Zeile mit status='laeuft', gehalten von einem
-- partiellen UNIQUE-Index. Ein abgestuerzter Lauf gibt sie ueber den
-- Herzschlag wieder frei.
--
-- WARUM DIESE TABELLE KEINE organization_id HAT
-- Der Wiederholungslauf ist mandantenuebergreifend — er iteriert alle
-- Organisationen in EINEM Lauf, genau wie der taegliche Cron. Eine
-- Sperre je Mandant wuerde zwei gleichzeitige Laeufe erlauben, die sich
-- dieselben Zeilen greifen. Die Mandantengrenze liegt dort, wo die Daten
-- liegen: notification_delivery_log traegt sie weiterhin per
-- org_fence-Policy, und der Worker filtert jede Abfrage zusaetzlich
-- explizit auf die Organisation.
--
-- Rollback: 20260927000001_rollback_zustellung_retry_worker.sql
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════
-- 1) notification_delivery_log — Vorgangsbezug und Endgrund
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.notification_delivery_log
  ADD COLUMN IF NOT EXISTS vorgang_art        text,
  ADD COLUMN IF NOT EXISTS vorgang_ref        uuid,
  ADD COLUMN IF NOT EXISTS vorgang_empfaenger uuid,
  ADD COLUMN IF NOT EXISTS grund              text;

-- Bezeichner-Slug, kein Freitext. Damit kann in dieser Spalte auch bei
-- einem Programmierfehler kein Nachrichteninhalt landen.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'notification_delivery_log_vorgang_art_check'
  ) THEN
    ALTER TABLE public.notification_delivery_log
      ADD CONSTRAINT notification_delivery_log_vorgang_art_check
      CHECK (vorgang_art IS NULL OR vorgang_art ~ '^[a-z][a-z0-9-]{2,39}$');
  END IF;
END;
$$;

-- Abschlussgrund einer Zustellung, die nicht mehr wiederholt wird.
-- Geschlossene Liste, damit die Betriebsansicht darauf filtern kann und
-- kein Fehlertext hineinrutscht (dafuer ist sanitized_error da).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'notification_delivery_log_grund_check'
  ) THEN
    ALTER TABLE public.notification_delivery_log
      ADD CONSTRAINT notification_delivery_log_grund_check
      CHECK (grund IS NULL OR grund IN (
        'max_versuche_erreicht',
        'dauerhaft_fehlgeschlagen',
        'nicht_wiederherstellbar',
        'voraussetzung_fehlt'
      ));
  END IF;
END;
$$;

COMMENT ON COLUMN public.notification_delivery_log.vorgang_art IS
  'Art des fachlichen Vorgangs als Bezeichner-Slug (z. B. booking-neu). '
  'Zusammen mit vorgang_ref die einzige Moeglichkeit, eine Zustellung zu '
  'wiederholen — das Protokoll enthaelt bewusst keinen Nachrichteninhalt.';
COMMENT ON COLUMN public.notification_delivery_log.vorgang_ref IS
  'Fachlicher Datensatz des Vorgangs (z. B. bookings.id). Nur ein Schluessel, nie Inhalt.';
COMMENT ON COLUMN public.notification_delivery_log.vorgang_empfaenger IS
  'profiles.id des Empfaengers. Wird gebraucht, weil recipient je nach Kanal '
  'eine Adresse, eine Rufnummer oder eine User-ID ist.';
COMMENT ON COLUMN public.notification_delivery_log.grund IS
  'Warum dieser Vorgang nicht mehr wiederholt wird (Dead Letter). NULL solange offen.';

-- Der Wiederholungslauf sucht genau nach diesem Schnitt.
CREATE INDEX IF NOT EXISTS idx_notification_delivery_log_wiederholbar
  ON public.notification_delivery_log(vorgang_art, created_at)
  WHERE status IN ('queued', 'failed') AND vorgang_art IS NOT NULL;

-- Dead Letter fuer die Betriebsansicht: wenige Zeilen, haeufige Abfrage.
CREATE INDEX IF NOT EXISTS idx_notification_delivery_log_dead_letter
  ON public.notification_delivery_log(organization_id, created_at DESC)
  WHERE grund IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════
-- 2) zustellung_retry_laeufe — Sperre und Lauf-Protokoll
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.zustellung_retry_laeufe (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status         text NOT NULL DEFAULT 'laeuft'
    CHECK (status IN ('laeuft', 'fertig', 'abgebrochen')),
  gestartet_am   timestamptz NOT NULL DEFAULT now(),
  heartbeat_am   timestamptz NOT NULL DEFAULT now(),
  beendet_am     timestamptz,
  laufzeit_ms    integer,
  versuch        integer NOT NULL DEFAULT 1 CHECK (versuch >= 1),
  verarbeitet    integer NOT NULL DEFAULT 0 CHECK (verarbeitet    >= 0),
  erfolgreich    integer NOT NULL DEFAULT 0 CHECK (erfolgreich    >= 0),
  fehlgeschlagen integer NOT NULL DEFAULT 0 CHECK (fehlgeschlagen >= 0),
  dead_letter    integer NOT NULL DEFAULT 0 CHECK (dead_letter    >= 0),
  uebersprungen  integer NOT NULL DEFAULT 0 CHECK (uebersprungen  >= 0),
  abbruchgrund   text
);

-- Die eigentliche Sperre: hoechstens EIN Lauf mit status='laeuft'.
CREATE UNIQUE INDEX IF NOT EXISTS uq_zustellung_retry_lauf_aktiv
  ON public.zustellung_retry_laeufe(status)
  WHERE status = 'laeuft';

CREATE INDEX IF NOT EXISTS idx_zustellung_retry_laeufe_zeit
  ON public.zustellung_retry_laeufe(gestartet_am DESC);

COMMENT ON TABLE public.zustellung_retry_laeufe IS
  'Sperre und Protokoll des mandantenuebergreifenden Wiederholungslaufs fuer '
  'Benachrichtigungen. Bewusst ohne organization_id — der Lauf umfasst alle '
  'Mandanten; die Mandantengrenze liegt an notification_delivery_log.';

ALTER TABLE public.zustellung_retry_laeufe ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'zustellung_retry_laeufe'
      AND policyname = 'zustellung_retry_laeufe_admin'
  ) THEN
    CREATE POLICY zustellung_retry_laeufe_admin
      ON public.zustellung_retry_laeufe
      FOR ALL USING (public.is_admin());
  END IF;
END;
$$;

REVOKE ALL ON TABLE public.zustellung_retry_laeufe FROM anon;

-- ═══════════════════════════════════════════════════════════════════
-- 3) Beanspruchen — Parallelitaetssperre
-- ═══════════════════════════════════════════════════════════════════
--
-- Ergebnis (jsonb):
--   lauf_id     ID des Laufs (neu oder uebernommen)
--   uebernommen true = ein verwaister Lauf wurde uebernommen
--
-- jsonb und nicht RETURNS TABLE: eine Tabellenfunktion kommt ueber
-- PostgREST als Zeilenliste zurueck und ueber einen direkten
-- SELECT-Aufruf als Verbundtyp. Ein jsonb-Objekt sieht auf beiden Wegen
-- gleich aus — das erspart dem Aufrufer eine Fallunterscheidung, die
-- niemand testet.
--
-- Laeuft bereits ein lebender Lauf, wird mit dem Code
-- 'ZUSTELLUNG_RETRY_LAEUFT' abgebrochen. Fail-closed: der zweite
-- Aufruf verschickt garantiert nichts.
CREATE OR REPLACE FUNCTION public.zustellung_retry_beanspruchen(
  p_stale_minuten integer DEFAULT 10
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_vorhanden public.zustellung_retry_laeufe%ROWTYPE;
  v_id        uuid;
  v_uebernommen boolean := false;
BEGIN
  IF p_stale_minuten IS NULL OR p_stale_minuten < 1 THEN
    RAISE EXCEPTION 'ZUSTELLUNG_RETRY_PARAMETER: p_stale_minuten muss >= 1 sein';
  END IF;

  -- Serialisiert ausschliesslich die Beanspruchung; faellt mit dieser
  -- Transaktion. Die Dauersperre ist die Zeile.
  PERFORM pg_advisory_xact_lock(hashtext('zustellung-retry-worker'));

  SELECT * INTO v_vorhanden
  FROM public.zustellung_retry_laeufe
  WHERE status = 'laeuft'
  FOR UPDATE;

  IF FOUND THEN
    IF v_vorhanden.heartbeat_am > now() - make_interval(mins => p_stale_minuten) THEN
      RAISE EXCEPTION
        'ZUSTELLUNG_RETRY_LAEUFT: Lauf % ist aktiv, letztes Lebenszeichen %.',
        v_vorhanden.id, v_vorhanden.heartbeat_am;
    END IF;

    -- Verwaiste Sperre uebernehmen. Die Zaehler werden zurueckgesetzt:
    -- was der abgestuerzte Lauf geschafft hat, steht in den Zeilen von
    -- notification_delivery_log, nicht hier.
    UPDATE public.zustellung_retry_laeufe
       SET heartbeat_am   = now(),
           gestartet_am   = now(),
           versuch        = versuch + 1,
           verarbeitet    = 0,
           erfolgreich    = 0,
           fehlgeschlagen = 0,
           dead_letter    = 0,
           uebersprungen  = 0,
           abbruchgrund   = NULL
     WHERE id = v_vorhanden.id;
    v_id := v_vorhanden.id;
    v_uebernommen := true;
  ELSE
    INSERT INTO public.zustellung_retry_laeufe DEFAULT VALUES
    RETURNING id INTO v_id;
  END IF;

  RETURN jsonb_build_object('lauf_id', v_id, 'uebernommen', v_uebernommen);
END;
$$;

-- ═══════════════════════════════════════════════════════════════════
-- 4) Herzschlag
-- ═══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.zustellung_retry_heartbeat(p_lauf_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  UPDATE public.zustellung_retry_laeufe
     SET heartbeat_am = now()
   WHERE id = p_lauf_id AND status = 'laeuft';
  RETURN FOUND;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════
-- 5) Abschliessen
-- ═══════════════════════════════════════════════════════════════════
-- Mit abbruchgrund wird der Lauf als 'abgebrochen' vermerkt, sonst als
-- 'fertig'. In beiden Faellen faellt die Sperre — ein abgebrochener Lauf
-- soll den naechsten Versuch nicht blockieren, denn die noch offenen
-- Zustellungen stehen weiterhin im Protokoll.
CREATE OR REPLACE FUNCTION public.zustellung_retry_abschliessen(
  p_lauf_id        uuid,
  p_verarbeitet    integer DEFAULT 0,
  p_erfolgreich    integer DEFAULT 0,
  p_fehlgeschlagen integer DEFAULT 0,
  p_dead_letter    integer DEFAULT 0,
  p_uebersprungen  integer DEFAULT 0,
  p_abbruchgrund   text    DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  UPDATE public.zustellung_retry_laeufe
     SET status         = CASE WHEN p_abbruchgrund IS NULL THEN 'fertig' ELSE 'abgebrochen' END,
         beendet_am     = now(),
         laufzeit_ms    = GREATEST(0, (EXTRACT(EPOCH FROM (now() - gestartet_am)) * 1000)::integer),
         verarbeitet    = GREATEST(0, COALESCE(p_verarbeitet, 0)),
         erfolgreich    = GREATEST(0, COALESCE(p_erfolgreich, 0)),
         fehlgeschlagen = GREATEST(0, COALESCE(p_fehlgeschlagen, 0)),
         dead_letter    = GREATEST(0, COALESCE(p_dead_letter, 0)),
         uebersprungen  = GREATEST(0, COALESCE(p_uebersprungen, 0)),
         -- Der Grund ist ein Betriebshinweis, kein Fehlertext: hart
         -- gekuerzt, damit hier keine Provider-Antwort mit Geheimnissen
         -- landet.
         abbruchgrund   = left(p_abbruchgrund, 200)
   WHERE id = p_lauf_id AND status = 'laeuft';
  RETURN FOUND;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════
-- 6) Rechte
-- ═══════════════════════════════════════════════════════════════════
-- Jede public-Funktion ist per Default anon-ausfuehrbar (siehe
-- 20260922000000). Ohne REVOKE koennte jeder die Sperre uebernehmen oder
-- einen laufenden Job als beendet markieren.
REVOKE ALL ON FUNCTION public.zustellung_retry_beanspruchen(integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.zustellung_retry_heartbeat(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.zustellung_retry_abschliessen(uuid, integer, integer, integer, integer, integer, text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.zustellung_retry_beanspruchen(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.zustellung_retry_heartbeat(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.zustellung_retry_abschliessen(uuid, integer, integer, integer, integer, integer, text) TO service_role;

COMMIT;
