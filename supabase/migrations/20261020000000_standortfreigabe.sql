-- ════════════════════════════════════════════════════════════════════
-- Standortfreigabe — freiwillig, sichtbar, jederzeit abschaltbar
-- (TRACK G2)
-- ════════════════════════════════════════════════════════════════════
--
-- WAS DIESES MODUL IST
-- Zwei Tabellen: eine, in der jedes Konto SELBST festlegt, ob und in
-- welchem Umfang sein Standort erhoben werden darf
-- (location_sharing_settings), und eine, in der die erhobenen Punkte
-- liegen (location_updates). Ohne einen Eintrag in der ersten entsteht
-- in der zweiten keine Zeile — das ist keine Zusage im Anwendungscode,
-- sondern ein Trigger auf der Tabelle (Abschnitt 4).
--
-- WAS DIESES MODUL AUSDRUECKLICH NICHT IST
--   * KEINE verdeckte Erfassung. Der Vorgabewert ist 'off'. Es gibt
--     keinen Weg, einen Modus fuer ein fremdes Konto einzuschalten:
--     `enabled_by_user` muss true sein (CHECK), und die einzige Route,
--     die schreibt, nimmt die Konto-Kennung aus der serverseitig
--     gepruefte Sitzung — nie aus dem Rumpf.
--   * KEINE Umgehung der Berechtigungen von iOS/Android. Der Standort
--     kommt vom Geraet, und das Geraet gibt ihn nur heraus, wenn das
--     Betriebssystem es erlaubt. `os_permission_granted` haelt fest,
--     was der Client dazu gemeldet hat; fuer den Dauermodus ist es
--     Pflicht (CHECK).
--   * KEINE MAC-Adressen. `device_info` traegt — wie in
--     security_audit_log — ausdruecklich {"mac_address":"not_available"}.
--     Es gibt keinen Ersatzwert und keinen Fingerprinting-Umweg.
--
-- DIE DREI MODI
--   'off'             Vorgabe. Es wird nichts erhoben. Jede Zeile in
--                     location_updates wird vom Trigger abgewiesen.
--   'during_service'  Nur waehrend eines laufenden Einsatzes. Der
--                     Trigger verlangt dann eine Einsatz-Kennung
--                     (service_id); DASS dieser Einsatz gerade laeuft
--                     und der Person gehoert, prueft lib/standort/
--                     erfassung.ts, bevor der Punkt ueberhaupt
--                     geschrieben wird. Zwei Siebe, absichtlich.
--   'always'          Dauerhaft. Nur mit enabled_by_user = true UND
--                     os_permission_granted = true.
--
-- MANDANTENBEZUG — KEIN RESTRICTIVE org_fence
-- Bewusst wie bei security_audit_log und aus demselben Grund, den
-- scripts/org-id-klassifizierung.json unter „admin_policy_verengt"
-- festhaelt: die Zeilen entstehen durch die Endnutzer selbst. Ein
-- RESTRICTIVE Fence auf current_org_id() wuerde genau die Person aus
-- ihren eigenen Zeilen aussperren, deren Org-Zuordnung sich spaeter
-- aendert — und aussperren heisst hier: sie kann ihre eigene
-- Standortfreigabe nicht mehr abschalten. Die Mandantenbedingung steht
-- deshalb IN der Admin-Policy, nicht daneben.
--
-- VORAUSSETZUNG: 20261018000002_security_audit_log.sql (liefert
-- public.ist_sicherheitsadmin()). Fehlt sie, schlaegt diese Migration
-- beim Anlegen der Policies fehl — mit Absicht: eine Standorttabelle
-- ohne Tuersteher darf nicht entstehen.
--
-- Idempotent (CREATE TABLE IF NOT EXISTS, DO-Block-Guards).
-- ════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- 1) location_sharing_settings — die Einwilligung
-- ─────────────────────────────────────────────────────────────────────
-- EINE Zeile je Konto (UNIQUE user_id). Der Verlauf der Entscheidung
-- steht NICHT hier, sondern in security_audit_log: jedes Ein- und
-- Ausschalten schreibt dort ein Ereignis mit Vorher/Nachher. Eine
-- Einwilligung, deren Aenderung nur die Einwilligung selbst
-- ueberschreibt, waere im Streitfall wertlos.
CREATE TABLE IF NOT EXISTS public.location_sharing_settings (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- CASCADE: die Einwilligung ist kein Protokoll. Sie verschwindet mit
  -- dem Konto; der NACHWEIS, dass sie erteilt und wieder entzogen
  -- wurde, bleibt in security_audit_log (dort SET NULL).
  user_id               uuid NOT NULL UNIQUE
                          REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id       uuid REFERENCES public.organizations(id),

  mode                  text NOT NULL DEFAULT 'off'
                          CHECK (mode IN ('off','during_service','always')),

  -- Wann der aktuelle Modus eingeschaltet bzw. zuletzt abgeschaltet
  -- wurde. Beide Zeitstempel setzt der Trigger (Abschnitt 3) — nicht
  -- der Client. Ein selbst gesetzter Zeitstempel waere eine Behauptung.
  enabled_at            timestamptz,
  disabled_at           timestamptz,

  -- „Der Nutzer muss den Modus SELBST aktivieren." Das ist hier keine
  -- Bitte an den Anwendungscode, sondern eine Bedingung der Tabelle.
  enabled_by_user       boolean NOT NULL DEFAULT false,

  -- Was der Client zur Betriebssystem-Berechtigung gemeldet hat.
  -- Es wird NICHT geraten und nichts umgangen: meldet das Geraet keine
  -- Berechtigung, bleibt der Wert false — und der Dauermodus ist dann
  -- nicht einstellbar.
  os_permission_granted boolean NOT NULL DEFAULT false,

  -- Wer zuletzt geschrieben hat. Immer das Konto selbst; die Spalte
  -- existiert, damit ein spaeterer Fremdschreibweg sofort auffiele.
  geaendert_von         uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  -- Jeder Modus ausser 'off' verlangt die ausdrueckliche eigene
  -- Aktivierung.
  CONSTRAINT location_sharing_settings_eigene_freigabe
    CHECK (mode = 'off' OR enabled_by_user = true),

  -- Der Dauermodus verlangt zusaetzlich die Berechtigung des
  -- Betriebssystems.
  CONSTRAINT location_sharing_settings_os_freigabe
    CHECK (mode <> 'always' OR os_permission_granted = true)
);

COMMENT ON TABLE public.location_sharing_settings IS
  'Standortfreigabe je Konto. Vorgabe off. mode <> off nur mit '
  'enabled_by_user = true, mode = always zusaetzlich nur mit '
  'os_permission_granted = true. Aenderungen stehen in '
  'security_audit_log.';

COMMENT ON COLUMN public.location_sharing_settings.enabled_by_user IS
  'Ausdrueckliche eigene Aktivierung. Ohne sie ist kein Modus ausser '
  'off eintragbar (CHECK) — es gibt keinen Verwaltungsweg, der die '
  'Freigabe fuer ein fremdes Konto einschaltet.';

COMMENT ON COLUMN public.location_sharing_settings.os_permission_granted IS
  'Vom Geraet gemeldete Betriebssystem-Berechtigung. Wird nicht '
  'hergeleitet und nicht umgangen.';

CREATE INDEX IF NOT EXISTS idx_location_sharing_settings_org
  ON public.location_sharing_settings(organization_id);
CREATE INDEX IF NOT EXISTS idx_location_sharing_settings_aktiv
  ON public.location_sharing_settings(user_id) WHERE mode <> 'off';

-- ─────────────────────────────────────────────────────────────────────
-- 2) location_updates — die erhobenen Punkte
-- ─────────────────────────────────────────────────────────────────────
-- Ein Punkt ist eine MESSUNG, kein Datensatz, der gepflegt wird. Er
-- wird geschrieben und irgendwann geloescht (Aufbewahrung, Abschnitt 7)
-- — geaendert wird er nie; ein Trigger weist jedes UPDATE ab.
CREATE TABLE IF NOT EXISTS public.location_updates (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id   uuid REFERENCES public.organizations(id),

  -- Der Messwert. Die Grenzen stehen als CHECK, weil ein Punkt
  -- ausserhalb des Wertebereichs keine Ortsangabe ist, sondern ein
  -- Fehler — und ein Fehler gehoert abgewiesen, nicht auf einer Karte
  -- angezeigt.
  latitude          double precision NOT NULL CHECK (latitude  BETWEEN -90  AND 90),
  longitude         double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  accuracy_meters   double precision CHECK (accuracy_meters IS NULL OR accuracy_meters >= 0),
  altitude          double precision,
  speed             double precision CHECK (speed IS NULL OR speed >= 0),
  heading           double precision CHECK (heading IS NULL OR (heading >= 0 AND heading < 360)),

  -- Zeitpunkt der MESSUNG auf dem Geraet. Getrennt von created_at
  -- (Eingang auf dem Server), weil eine Nachlieferung aus dem Funkloch
  -- sonst so aussaehe, als sei die Person eben dort gewesen.
  timestamp_utc     timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now(),

  -- Undurchsichtige Sitzungskennung zum Gruppieren einer Fahrt/eines
  -- Einsatzes. KEIN Session-Token — aus ihr laesst sich keine Sitzung
  -- uebernehmen (gleiche Regel wie security_audit_log.session_reference).
  session_id        text,

  -- Der laufende Einsatz. Pflicht im Modus 'during_service' (Trigger,
  -- Abschnitt 4). SET NULL, weil ein geloeschter Einsatz den bereits
  -- erhobenen Punkt nicht rueckwirkend rechtfertigt oder entwertet.
  service_id        uuid REFERENCES public.service_records(id) ON DELETE SET NULL,

  platform          text CHECK (platform IS NULL OR platform IN ('ios','android','web')),
  app_version       text,
  device_info       jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Nur nach dem allgemeinen Datenschutzkonzept des Hauses: dieselbe
  -- Herkunft wie in security_audit_log (Kopfzeile des Reverse-Proxy,
  -- nie der Rumpf) und dieselbe Aufbewahrung. NULLABLE — ein Punkt ohne
  -- IP ist ein vollstaendiger Punkt.
  ip_address        inet,

  -- In welchem Modus dieser Punkt entstanden ist. Schnappschuss, kein
  -- Verweis: aendert die Person spaeter ihren Modus, bleibt nachvoll-
  -- ziehbar, auf welcher Grundlage dieser Punkt erhoben wurde.
  erfasst_im_modus  text NOT NULL CHECK (erfasst_im_modus IN ('during_service','always'))
);

COMMENT ON TABLE public.location_updates IS
  'Standortpunkte freigegebener Konten. Entsteht nur bei aktiver '
  'Freigabe (Trigger location_update_pruefe_freigabe). Unveraenderlich; '
  'Loeschung ueber standort_aufbewahrung_bereinigen() und den '
  'Loeschkatalog.';

COMMENT ON COLUMN public.location_updates.timestamp_utc IS
  'Zeitpunkt der Messung auf dem Geraet. created_at ist der Eingang auf '
  'dem Server — bei Nachlieferung aus dem Funkloch liegen beide weit '
  'auseinander.';

COMMENT ON COLUMN public.location_updates.session_id IS
  'Undurchsichtige Kennung zum Gruppieren einer Fahrt. KEIN Session-Token.';

COMMENT ON COLUMN public.location_updates.device_info IS
  'Merkmale aus dem User-Agent. mac_address ist immer "not_available".';

-- Die Oberflaeche fragt: „letzter Punkt je Konto", „Punkte eines Kontos
-- im Zeitraum", „alles im Mandanten im Zeitraum". Genau diese drei.
CREATE INDEX IF NOT EXISTS idx_location_updates_user_zeit
  ON public.location_updates(user_id, timestamp_utc DESC);
CREATE INDEX IF NOT EXISTS idx_location_updates_org_zeit
  ON public.location_updates(organization_id, timestamp_utc DESC);
CREATE INDEX IF NOT EXISTS idx_location_updates_service
  ON public.location_updates(service_id) WHERE service_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_location_updates_session
  ON public.location_updates(session_id) WHERE session_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────
-- 3) Zeitstempel der Einwilligung setzt die Datenbank
-- ─────────────────────────────────────────────────────────────────────
-- Warum nicht der Anwendungscode: weil `authenticated` unten ein
-- schmales UPDATE-Recht auf der eigenen Zeile bekommt (Abschnitt 6,
-- „jederzeit abschaltbar"). Ohne diesen Trigger koennte ein Browser
-- beim Abschalten `disabled_at` auf ein beliebiges Datum setzen — und
-- damit den Zeitpunkt bestreiten, ab dem nicht mehr erhoben wurde.
CREATE OR REPLACE FUNCTION public.location_sharing_stempel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  NEW.updated_at := now();

  IF TG_OP = 'INSERT' THEN
    NEW.enabled_at  := CASE WHEN NEW.mode <> 'off' THEN now() ELSE NULL END;
    NEW.disabled_at := CASE WHEN NEW.mode  = 'off' THEN now() ELSE NULL END;
    RETURN NEW;
  END IF;

  -- Modus unveraendert: die Zeitstempel bleiben, wie sie sind. Ein
  -- erneutes Speichern derselben Einstellung darf den Beginn der
  -- Freigabe nicht nach vorne schieben.
  IF NEW.mode IS NOT DISTINCT FROM OLD.mode THEN
    NEW.enabled_at  := OLD.enabled_at;
    NEW.disabled_at := OLD.disabled_at;
    RETURN NEW;
  END IF;

  IF NEW.mode = 'off' THEN
    NEW.disabled_at := now();
    NEW.enabled_at  := OLD.enabled_at;
  ELSE
    NEW.enabled_at  := now();
    NEW.disabled_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.location_sharing_stempel() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_location_sharing_stempel
  ON public.location_sharing_settings;
CREATE TRIGGER trg_location_sharing_stempel
  BEFORE INSERT OR UPDATE ON public.location_sharing_settings
  FOR EACH ROW EXECUTE FUNCTION public.location_sharing_stempel();

-- ─────────────────────────────────────────────────────────────────────
-- 4) Kein Punkt ohne Freigabe — der Riegel in der Datenbank
-- ─────────────────────────────────────────────────────────────────────
-- DER WICHTIGSTE TEIL DIESER MIGRATION.
--
-- Der Anwendungscode prueft die Freigabe ebenfalls (lib/standort/
-- erfassung.ts). Dieser Trigger ist nicht die Wiederholung derselben
-- Pruefung an zweiter Stelle, sondern die Zusicherung fuer alles, was
-- NICHT durch diesen Code geht: ein Skript mit Dienstschluessel, eine
-- kuenftige Route, ein Import. RLS haelt den Dienstschluessel nicht auf
-- — ein Trigger schon.
--
-- Er prueft drei Dinge und keines davon lässt sich vom Aufrufer
-- behaupten:
--   1. Es gibt eine Freigabe fuer dieses Konto, und ihr Modus ist nicht
--      'off'.
--   2. Der gemeldete Erfassungsmodus stimmt mit der Freigabe ueberein.
--   3. Im Modus 'during_service' traegt der Punkt eine Einsatz-Kennung.
--      (DASS der Einsatz laeuft und der Person gehoert, prueft der
--      Anwendungscode vorher — die Datenbank kennt den Einsatzbeginn
--      als Uhrzeit ohne Zeitzone und waere hier die schlechtere Stelle.)
CREATE OR REPLACE FUNCTION public.location_update_pruefe_freigabe()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_mode text;
BEGIN
  SELECT s.mode INTO v_mode
    FROM public.location_sharing_settings s
   WHERE s.user_id = NEW.user_id
     AND s.enabled_by_user;

  IF v_mode IS NULL OR v_mode = 'off' THEN
    RAISE EXCEPTION
      'Standortfreigabe: fuer dieses Konto ist keine Freigabe aktiv (Modus %).',
      COALESCE(v_mode, 'nicht eingerichtet')
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.erfasst_im_modus <> v_mode THEN
    RAISE EXCEPTION
      'Standortfreigabe: gemeldeter Modus % passt nicht zur Freigabe %.',
      NEW.erfasst_im_modus, v_mode
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_mode = 'during_service' AND NEW.service_id IS NULL THEN
    RAISE EXCEPTION
      'Standortfreigabe: im Modus during_service ist eine Einsatz-Kennung Pflicht.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.location_update_pruefe_freigabe() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_location_update_pruefe_freigabe
  ON public.location_updates;
CREATE TRIGGER trg_location_update_pruefe_freigabe
  BEFORE INSERT ON public.location_updates
  FOR EACH ROW EXECUTE FUNCTION public.location_update_pruefe_freigabe();

-- Ein Standortpunkt wird nicht korrigiert. Wer ihn aendern koennte,
-- haette keine Messung, sondern eine Behauptung — dieselbe Begruendung
-- wie bei security_audit_log, nur dass dort schon der fehlende Grant
-- reicht: hier greift der Trigger auch fuer den Dienstschluessel.
CREATE OR REPLACE FUNCTION public.location_update_unveraenderlich()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION 'Standortpunkte sind unveraenderlich (id %).', OLD.id
    USING ERRCODE = 'check_violation';
END;
$$;

REVOKE ALL ON FUNCTION public.location_update_unveraenderlich() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_location_update_unveraenderlich
  ON public.location_updates;
CREATE TRIGGER trg_location_update_unveraenderlich
  BEFORE UPDATE ON public.location_updates
  FOR EACH ROW EXECUTE FUNCTION public.location_update_unveraenderlich();

-- ─────────────────────────────────────────────────────────────────────
-- 5) RLS: location_sharing_settings
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.location_sharing_settings ENABLE ROW LEVEL SECURITY;

-- Lesen: das Konto selbst — und die Sicherheitsaufsicht, aber nur im
-- eigenen Mandanten. Zeilen ohne Organisation sind hier NICHT
-- mitgelesen (anders als in security_audit_log): eine Freigabe ohne
-- Mandanten ist ein Fehler in der Anlage, kein Angriffshinweis.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'location_sharing_settings'
      AND policyname = 'standort_freigabe_lesen'
  ) THEN
    CREATE POLICY standort_freigabe_lesen
      ON public.location_sharing_settings
      FOR SELECT TO authenticated
      USING (
        user_id = auth.uid()
        OR (
          public.ist_sicherheitsadmin()
          AND organization_id = public.current_org_id()
        )
      );
  END IF;
END $$;

-- Abschalten muss IMMER gehen — auch dann, wenn die Route ausfaellt.
-- Deshalb genau ein schmales Schreibrecht direkt auf der Tabelle:
--   * nur die eigene Zeile (USING)
--   * nur nach 'off' (WITH CHECK) — das Einschalten bleibt der Route
--     vorbehalten, die dabei ein Sicherheitsereignis schreibt
--   * nur die Spalte `mode` (Spalten-Grant, Abschnitt 6); die
--     Zeitstempel setzt der Trigger.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'location_sharing_settings'
      AND policyname = 'standort_freigabe_selbst_abschalten'
  ) THEN
    CREATE POLICY standort_freigabe_selbst_abschalten
      ON public.location_sharing_settings
      FOR UPDATE TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid() AND mode = 'off');
  END IF;
END $$;

REVOKE ALL ON public.location_sharing_settings FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE
  ON public.location_sharing_settings FROM authenticated;
GRANT SELECT ON public.location_sharing_settings TO authenticated;
-- Spalten-Grant statt Tabellen-Grant: das UPDATE oben kann damit
-- ausschliesslich den Modus anfassen. Ohne diese Einschraenkung koennte
-- die Policy zwar nur nach 'off' schalten, dabei aber `enabled_by_user`
-- oder `organization_id` mit umschreiben.
GRANT UPDATE (mode) ON public.location_sharing_settings TO authenticated;
GRANT ALL ON public.location_sharing_settings TO service_role;

-- ─────────────────────────────────────────────────────────────────────
-- 6) RLS: location_updates
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.location_updates ENABLE ROW LEVEL SECURITY;

-- „Nur der Nutzer selbst und Security-Admins/Founder duerfen lesen."
-- Woertlich: keine Vorgesetzten-Policy, keine PDL, keine
-- Einsatzleitung. Wer den Standort von Kolleginnen und Kollegen sehen
-- soll, braucht 'sicherheit.lesen' — und das haben nur admin und
-- superadmin (NUR_ADMINISTRATION in lib/auth/rollen.ts).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'location_updates'
      AND policyname = 'standort_punkte_lesen'
  ) THEN
    CREATE POLICY standort_punkte_lesen
      ON public.location_updates
      FOR SELECT TO authenticated
      USING (
        user_id = auth.uid()
        OR (
          public.ist_sicherheitsadmin()
          AND organization_id = public.current_org_id()
        )
      );
  END IF;
END $$;

-- Die eigenen Punkte darf jedes Konto loeschen. Das ist die praktische
-- Seite des Widerrufs: „aus" beendet die Erhebung, dieses Recht raeumt
-- das Erhobene weg.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'location_updates'
      AND policyname = 'standort_punkte_selbst_loeschen'
  ) THEN
    CREATE POLICY standort_punkte_selbst_loeschen
      ON public.location_updates
      FOR DELETE TO authenticated
      USING (user_id = auth.uid());
  END IF;
END $$;

REVOKE ALL ON public.location_updates FROM anon;
REVOKE INSERT, UPDATE, TRUNCATE ON public.location_updates FROM authenticated;
GRANT SELECT, DELETE ON public.location_updates TO authenticated;
GRANT ALL ON public.location_updates TO service_role;

-- ─────────────────────────────────────────────────────────────────────
-- 7) Aufbewahrung
-- ─────────────────────────────────────────────────────────────────────
-- „Standort-Historie nur soweit fuer betrieblichen Zweck." Der
-- betriebliche Zweck eines Standortpunkts ist der laufende bzw. gerade
-- abgerechnete Einsatz — danach ist er Vorrat.
--
-- NICHT VERDRAHTET: diese Funktion laeuft noch von keinem Takt. Der
-- Takt liegt in vercel.json (Befund „Loeschkette: Takt liegt in
-- vercel.json"), und ein Takt, der Daten loescht, wird bewusst
-- eingeschaltet und nicht nebenbei mit einer Tabelle ausgeliefert.
-- Bis dahin ist sie der Hebel fuer den Hand-Lauf.
CREATE OR REPLACE FUNCTION public.standort_aufbewahrung_bereinigen(
  p_tage integer DEFAULT 90
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_anzahl integer;
BEGIN
  IF p_tage IS NULL OR p_tage < 1 THEN
    RAISE EXCEPTION 'standort_aufbewahrung_bereinigen: p_tage muss >= 1 sein';
  END IF;

  DELETE FROM public.location_updates
   WHERE timestamp_utc < now() - make_interval(days => p_tage);

  GET DIAGNOSTICS v_anzahl = ROW_COUNT;
  RETURN v_anzahl;
END;
$$;

COMMENT ON FUNCTION public.standort_aufbewahrung_bereinigen(integer) IS
  'Loescht Standortpunkte aelter als p_tage (Vorgabe 90). Noch von '
  'keinem Cron aufgerufen — bewusst.';

-- Jede public-Funktion ist per Default anon-ausfuehrbar (Befund
-- 20260922000000). Eine Loeschfunktion erst recht nicht.
REVOKE ALL ON FUNCTION public.standort_aufbewahrung_bereinigen(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.standort_aufbewahrung_bereinigen(integer)
  TO service_role;

COMMIT;
