-- ════════════════════════════════════════════════════════════════════
-- Security- und Audit-System: zentrale Spur sicherheitsrelevanter
-- Ereignisse (security_audit_log)
-- ════════════════════════════════════════════════════════════════════
--
-- WARUM ES DIESE TABELLE GIBT
-- Das Produkt fuehrt bereits mehrere Spuren: mis_audit_log (Admin-
-- Aktionen), mis_auth_log (An-/Abmeldung), billing_audit_trail (Geld),
-- wf_audit_log (Workflow), sync_audit_log (Offline-Sync). Keine davon
-- beantwortet die Sicherheitsfrage: „Was ist an DIESEM Konto passiert —
-- von wo, mit welchem Geraet, mit welcher Rolle, und war das
-- ungewoehnlich?" Genau dafuer ist security_audit_log da. Sie ersetzt
-- die bestehenden Spuren NICHT (die haben fachliche Aufgaben), sie legt
-- die sicherheitsrelevante Sicht darueber.
--
-- WAS HIER BEWUSST NICHT HINEINGEHOERT
--   * Passwoerter, Passwort-Hashes, Tokens, Cookies, Session-Tokens,
--     API-Schluessel, MFA-Geheimnisse. Es gibt keine Spalte dafuer, und
--     lib/security/audit.ts entfernt entsprechende Schluessel aus
--     `metadata`, bevor geschrieben wird.
--   * MAC-Adressen. Ein Browser gibt sie nicht heraus, eine native App
--     bekommt sie auf iOS/Android seit Jahren nicht mehr. `device_info`
--     traegt deshalb ausdruecklich {"mac_address": "not_available"} —
--     kein Ersatzwert, kein Fingerprinting-Umweg.
--
-- CHECK-CONSTRAINTS — NUR AUF `severity`
-- Bewusste Entscheidung nach dem Befund zu mis_audit_log.action: ein
-- CHECK auf einer offenen Werteliste laesst den INSERT scheitern, sobald
-- ein neuer Ereignistyp auftaucht — und ein Sicherheitsereignis, das
-- wegen einer Werteliste NICHT geschrieben wird, ist der schlimmste
-- Ausgang, den diese Tabelle haben kann. `event_type` und
-- `event_category` sind deshalb offener Text; die gueltigen Werte stehen
-- in lib/security/ereignisse.ts und werden dort vor dem Schreiben
-- geprueft (unbekannter Wert ⇒ Ereignis wird trotzdem geschrieben,
-- Kategorie faellt auf 'security', Schweregrad auf 'warning'). Nur
-- `severity` hat einen CHECK, weil diese drei Werte die Oberflaeche und
-- die Benachrichtigungsregel steuern und wirklich abgeschlossen sind.
--
-- MANDANTENBEZUG
-- `organization_id` ist NULLABLE — und zwar nur fuer einen Fall: eine
-- fehlgeschlagene Anmeldung mit einer E-Mail-Adresse, zu der es kein
-- Konto gibt. Dann gibt es keinen Mandanten, dem das Ereignis gehoert.
-- Sobald ein Konto bekannt ist, loest lib/security/audit.ts die
-- Organisation auf und schreibt sie mit. Zeilen ohne Organisation
-- enthalten deshalb keine Mandantendaten, nur die eingegebene Adresse
-- und technische Merkmale.
--
-- Idempotent (CREATE TABLE IF NOT EXISTS, DO-Block-Guards fuer Policies).
--
-- VORAUSSETZUNG: 20261018000000_rollenmatrix_sicherheit_lesen.sql muss
-- vorher laufen — dort steht die Berechtigung 'sicherheit.lesen'. Ohne
-- sie greift der zweite Weg in ist_sicherheitsadmin() (is_admin()), die
-- Aufsicht faellt also nicht aus; sauber ist es trotzdem nur mit beiden.
-- ════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- 2a) ist_sicherheitsadmin() — der Tuersteher der Sicherheitsspur
-- ─────────────────────────────────────────────────────────────────────
-- Zwei Wege zur selben Antwort, mit Absicht:
--
--   darf('sicherheit.lesen') — die saubere Auskunft aus dem
--                              Rollenkonzept.
--   is_admin()               — dieselbe Personengruppe, aus profiles
--                              gelesen, unabhaengig von der Matrix.
--
-- Das ist keine Hintertuer: is_admin() ist genau admin|superadmin, und
-- 'sicherheit.lesen' steht in NUR_ADMINISTRATION — beide Ausdruecke
-- beschreiben dieselbe Menge. Der zweite Weg existiert, weil
-- rollen_matrix eine von mehreren Migrationen geteilte Funktion ist
-- (siehe Abschnitt 1): faellt die Berechtigung dort durch eine spaetere
-- Ueberschreibung heraus, wuerde die Sicherheitsspur sonst fuer ALLE
-- unlesbar — ein stiller Ausfall der Aufsicht, und niemand merkt es.
CREATE OR REPLACE FUNCTION public.ist_sicherheitsadmin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT COALESCE(public.darf('sicherheit.lesen'), false)
      OR COALESCE(public.is_admin(), false);
$$;

COMMENT ON FUNCTION public.ist_sicherheitsadmin() IS
  'Wer die Sicherheitsspur lesen darf: admin/superadmin. Zwei Quellen '
  'derselben Aussage, damit eine ueberschriebene rollen_matrix die '
  'Aufsicht nicht still abschaltet.';

REVOKE ALL ON FUNCTION public.ist_sicherheitsadmin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ist_sicherheitsadmin() TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────
-- 2) security_audit_log
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.security_audit_log (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Wer. SET NULL, weil der Eintrag die Kontoloeschung ueberlebt
  -- (Art. 30/32 DSGVO) — siehe lib/dsgvo/loeschkatalog.ts.
  user_id           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Adress-Schnappschuss. Zwei Gruende: (a) bei 'login_failed' zu einer
  -- unbekannten Adresse gibt es kein Konto, die Adresse IST das einzige
  -- Merkmal; (b) nach einer Kontoloeschung bliebe der Eintrag sonst
  -- ohne jede Zuordnung. Enthaelt nie mehr als die Anmeldeadresse.
  user_email        text,

  organization_id   uuid REFERENCES public.organizations(id),

  -- Was. Offener Text, absichtlich ohne CHECK (siehe Kopf).
  event_type        text NOT NULL,
  event_category    text,

  created_at        timestamptz NOT NULL DEFAULT now(),

  -- Von wo / womit.
  ip_address        inet,
  user_agent        text,
  platform          text,          -- 'web' | 'ios' | 'android' | 'server'
  device_info       jsonb,         -- Browser, OS, Geraeteklasse, mac_address
  app_version       text,

  -- Sitzungsbezug. BEWUSST KEIN Session-Token: eine undurchsichtige,
  -- serverseitig gebildete Kennung, mit der sich Ereignisse derselben
  -- Sitzung gruppieren lassen. Aus ihr laesst sich keine Sitzung
  -- uebernehmen.
  session_reference text,

  metadata          jsonb NOT NULL DEFAULT '{}'::jsonb,

  severity          text NOT NULL DEFAULT 'info'
                      CHECK (severity IN ('info','warning','critical'))
);

COMMENT ON TABLE public.security_audit_log IS
  'Zentrale Spur sicherheitsrelevanter Ereignisse. Nur service_role '
  'schreibt; lesen darf ausschliesslich, wer darf(''sicherheit.lesen'') '
  'hat (admin/superadmin). Keine Passwoerter, Tokens oder Cookies — '
  'siehe lib/security/audit.ts.';

COMMENT ON COLUMN public.security_audit_log.device_info IS
  'Aus dem User-Agent abgeleitete Merkmale (Browser, Betriebssystem, '
  'Geraeteklasse). mac_address ist immer "not_available" — es gibt '
  'keinen Weg, sie zu erheben, und es wird keiner gesucht.';

COMMENT ON COLUMN public.security_audit_log.session_reference IS
  'Undurchsichtige Sitzungskennung zum Gruppieren. KEIN Session-Token.';

-- Indizes: die Oberflaeche filtert nach Zeitraum, Konto, Organisation,
-- Ereignistyp, Schweregrad, Plattform und IP — jede dieser Achsen
-- zusammen mit created_at DESC, weil immer nach Zeit sortiert wird.
CREATE INDEX IF NOT EXISTS idx_security_audit_log_created
  ON public.security_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_audit_log_user
  ON public.security_audit_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_audit_log_org
  ON public.security_audit_log(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_audit_log_type
  ON public.security_audit_log(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_audit_log_category
  ON public.security_audit_log(event_category, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_audit_log_severity
  ON public.security_audit_log(severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_audit_log_ip
  ON public.security_audit_log(ip_address);
CREATE INDEX IF NOT EXISTS idx_security_audit_log_email
  ON public.security_audit_log(lower(user_email));

ALTER TABLE public.security_audit_log ENABLE ROW LEVEL SECURITY;

-- ── Policies ────────────────────────────────────────────────────────
-- Genau EINE Policy, und die ist eine SELECT-Policy. Kein INSERT, kein
-- UPDATE, kein DELETE fuer `authenticated` — auch nicht fuer die
-- Administration. Wer einen Eintrag nachtraeglich aendern koennte,
-- haette kein Protokoll, sondern eine Behauptung. Geschrieben wird
-- ausschliesslich mit dem Dienstschluessel (service_role umgeht RLS)
-- ueber log_security_event() bzw. lib/security/audit.ts.
--
-- Die Mandantenbedingung steckt in derselben Policy statt in einem
-- eigenen RESTRICTIVE org_fence: permissive Policies sind ODER-
-- verknuepft, ein zweiter permissiver Eintrag wuerde die Bedingung hier
-- wieder aufheben (Befund „FOR-ALL-Policy hebt engere auf").
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'security_audit_log'
      AND policyname = 'sicherheitsadmin_liest_security_audit_log'
  ) THEN
    CREATE POLICY sicherheitsadmin_liest_security_audit_log
      ON public.security_audit_log
      FOR SELECT TO authenticated
      USING (
        public.ist_sicherheitsadmin()
        AND (
          organization_id = public.current_org_id()
          -- Mandantenlose Zeilen: nur fehlgeschlagene Anmeldungen zu
          -- unbekannten Adressen (siehe Kopf). Sie gehoeren keinem
          -- Mandanten und wuerden sonst niemandem auffallen.
          OR organization_id IS NULL
        )
      );
  END IF;
END $$;

-- Der Standard-Grant an `anon` ist in diesem Schema die eigentliche
-- Gefahr (siehe 20260915000000). Hier gibt es nichts zu holen.
REVOKE ALL ON public.security_audit_log FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.security_audit_log FROM authenticated;
GRANT SELECT ON public.security_audit_log TO authenticated;
GRANT ALL ON public.security_audit_log TO service_role;

-- ─────────────────────────────────────────────────────────────────────
-- 3) security_known_devices — Grundlage fuer 'unknown_device'
-- ─────────────────────────────────────────────────────────────────────
-- „Unbekanntes Geraet" braucht einen Vergleichsmassstab. Der hier ist
-- bewusst der schwaechste, der die Frage noch beantwortet: ein SHA-256
-- ueber (Konto-ID + Plattform + normalisierter User-Agent). Es wird
-- KEIN Browser-Fingerprint erhoben — kein Canvas, keine Schriftenliste,
-- keine Aufloesung, kein Zeitzonen-Abgleich. Der User-Agent wird ohnehin
-- bei jedem Aufruf mitgeschickt; mehr wird nicht gesammelt.
--
-- Folge dieser Entscheidung, offen benannt: zwei Rechner mit derselben
-- Browser-Version erzeugen denselben Hash und gelten als dasselbe
-- Geraet. Das Merkmal erkennt den Wechsel der Geraeteklasse zuverlaessig
-- und den Wechsel zwischen baugleichen Rechnern nicht. Ein
-- zuverlaessigeres Merkmal gaebe es nur um den Preis echten
-- Fingerprintings — den zahlt dieses System nicht.
CREATE TABLE IF NOT EXISTS public.security_known_devices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_hash     text NOT NULL,
  platform        text,
  user_agent      text,
  device_label    text,
  first_seen_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at    timestamptz NOT NULL DEFAULT now(),
  seen_count      integer NOT NULL DEFAULT 1,
  UNIQUE (user_id, device_hash)
);

COMMENT ON TABLE public.security_known_devices IS
  'Bekannte Geraete je Konto. device_hash = SHA-256 ueber Konto-ID, '
  'Plattform und normalisierten User-Agent. Kein Fingerprinting. '
  'ON DELETE CASCADE: das Geraetegedaechtnis ist kein Protokoll und '
  'verschwindet mit dem Konto.';

CREATE INDEX IF NOT EXISTS idx_security_known_devices_user
  ON public.security_known_devices(user_id, last_seen_at DESC);

ALTER TABLE public.security_known_devices ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'security_known_devices'
      AND policyname = 'sicherheitsadmin_liest_security_known_devices'
  ) THEN
    CREATE POLICY sicherheitsadmin_liest_security_known_devices
      ON public.security_known_devices
      FOR SELECT TO authenticated
      USING (public.ist_sicherheitsadmin() OR user_id = auth.uid());
  END IF;
END $$;

REVOKE ALL ON public.security_known_devices FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.security_known_devices FROM authenticated;
GRANT SELECT ON public.security_known_devices TO authenticated;
GRANT ALL ON public.security_known_devices TO service_role;

-- ─────────────────────────────────────────────────────────────────────
-- 4) security_watchlist — welche Konten Mails ausloesen
-- ─────────────────────────────────────────────────────────────────────
-- Die Aufgabe sagt „bei ueberwachten/privilegierten Konten". Das sind
-- zwei Mengen, und beide stehen offen da:
--
--   1. PRIVILEGIERT — jedes Konto mit einer Verwaltungsrolle
--      (superadmin, admin, pdl, qm, buchhaltung). Diese Menge ergibt
--      sich aus profiles.role, sie wird nicht gepflegt. Die Regel steht
--      in lib/security/benachrichtigung.ts.
--   2. UEBERWACHT — jedes Konto, das hier eingetragen ist. Ein Eintrag
--      ist eine Entscheidung eines Menschen und traegt deshalb `grund`
--      und `angelegt_von`.
--
-- Es gibt keine dritte, versteckte Menge. Wer eine Mail bekommt, laesst
-- sich aus profiles.role und dieser Tabelle vollstaendig herleiten.
CREATE TABLE IF NOT EXISTS public.security_watchlist (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id   uuid REFERENCES public.organizations(id),
  aktiv             boolean NOT NULL DEFAULT true,
  -- Abweichende Empfaengeradresse (z. B. ein Sicherheitspostfach).
  -- Leer ⇒ die Mail geht an die Adresse des Kontos selbst.
  melde_email       text,
  grund             text NOT NULL,
  angelegt_von      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

COMMENT ON TABLE public.security_watchlist IS
  'Ausdruecklich ueberwachte Konten. Ergaenzt die privilegierten Konten '
  '(profiles.role), ersetzt sie nicht. Jeder Eintrag traegt einen Grund.';

ALTER TABLE public.security_watchlist ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'security_watchlist'
      AND policyname = 'sicherheitsadmin_liest_security_watchlist'
  ) THEN
    CREATE POLICY sicherheitsadmin_liest_security_watchlist
      ON public.security_watchlist
      FOR SELECT TO authenticated
      USING (public.ist_sicherheitsadmin());
  END IF;
END $$;

REVOKE ALL ON public.security_watchlist FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.security_watchlist FROM authenticated;
GRANT SELECT ON public.security_watchlist TO authenticated;
GRANT ALL ON public.security_watchlist TO service_role;

-- ─────────────────────────────────────────────────────────────────────
-- 5) log_security_event() — der Schreibweg in der Datenbank
-- ─────────────────────────────────────────────────────────────────────
-- SECURITY DEFINER mit festem search_path (Befund „SECDEF ohne
-- search_path", 13.08.2026). Ausfuehrbar NUR fuer service_role: jede
-- public-Funktion ist per Default anon-ausfuehrbar, ein REVOKE ist hier
-- also Pflicht und keine Zierde (Befund 20260922000000).
--
-- Die Funktion ist der Schreibweg fuer die Datenbank selbst (Trigger,
-- kuenftige RPCs). Der Anwendungscode schreibt ueber lib/security/audit.ts
-- direkt in die Tabelle — derselbe Dienstschluessel, ein Umweg weniger.
CREATE OR REPLACE FUNCTION public.log_security_event(
  p_user_id           uuid,
  p_event_type        text,
  p_event_category    text DEFAULT NULL,
  p_metadata          jsonb DEFAULT '{}'::jsonb,
  p_severity          text DEFAULT 'info',
  p_organization_id   uuid DEFAULT NULL,
  p_user_email        text DEFAULT NULL,
  p_ip_address        inet DEFAULT NULL,
  p_user_agent        text DEFAULT NULL,
  p_platform          text DEFAULT NULL,
  p_device_info       jsonb DEFAULT NULL,
  p_app_version       text DEFAULT NULL,
  p_session_reference text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_id        uuid;
  v_severity  text;
  v_metadata  jsonb;
BEGIN
  IF p_event_type IS NULL OR btrim(p_event_type) = '' THEN
    RAISE EXCEPTION 'log_security_event: event_type fehlt';
  END IF;

  -- Unbekannter Schweregrad darf den Eintrag NICHT verhindern (siehe
  -- Kopf): er wird auf 'warning' gehoben, damit der Fall auffaellt.
  v_severity := CASE
    WHEN p_severity IN ('info','warning','critical') THEN p_severity
    ELSE 'warning'
  END;

  v_metadata := COALESCE(p_metadata, '{}'::jsonb);

  -- Letzte Bastion gegen Geheimnisse in metadata. Der eigentliche Filter
  -- steht in lib/security/audit.ts (VERBOTENE_SCHLUESSEL); dieser hier
  -- greift auch fuer Aufrufe aus der Datenbank.
  v_metadata := v_metadata
    - 'password' - 'passwort' - 'pass' - 'token' - 'access_token'
    - 'refresh_token' - 'id_token' - 'session' - 'session_token'
    - 'cookie' - 'cookies' - 'authorization' - 'secret' - 'api_key'
    - 'apikey' - 'service_role_key' - 'anon_key' - 'totp' - 'otp'
    - 'mfa_secret' - 'private_key' - 'client_secret';

  INSERT INTO public.security_audit_log (
    user_id, user_email, organization_id,
    event_type, event_category,
    ip_address, user_agent, platform, device_info, app_version,
    session_reference, metadata, severity
  ) VALUES (
    p_user_id, p_user_email, p_organization_id,
    p_event_type, p_event_category,
    p_ip_address, p_user_agent, p_platform, p_device_info, p_app_version,
    p_session_reference, v_metadata, v_severity
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.log_security_event(uuid, text, text, jsonb, text, uuid, text, inet, text, text, jsonb, text, text) IS
  'Schreibweg fuer security_audit_log. Nur service_role. Entfernt '
  'Geheimnis-Schluessel aus metadata und hebt einen unbekannten '
  'Schweregrad auf warning, statt den Eintrag zu verwerfen.';

REVOKE ALL ON FUNCTION public.log_security_event(uuid, text, text, jsonb, text, uuid, text, inet, text, text, jsonb, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_security_event(uuid, text, text, jsonb, text, uuid, text, inet, text, text, jsonb, text, text)
  TO service_role;

-- ─────────────────────────────────────────────────────────────────────
-- 6) Kein UPDATE, kein DELETE — auch nicht mit dem Dienstschluessel
-- ─────────────────────────────────────────────────────────────────────
-- RLS haelt `authenticated` fern, aber service_role umgeht RLS. Ein
-- fehlgeleiteter Serverlauf koennte die Spur also ueberschreiben. Der
-- Trigger macht daraus einen harten Fehler. Loeschen bleibt allein der
-- Aufbewahrungsfrist vorbehalten (Abschnitt 7).
CREATE OR REPLACE FUNCTION public.security_audit_log_unveraenderlich()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  -- AUSNAHME: die Fremdschluessel-Kaskade der Kontoloeschung.
  -- user_id steht auf ON DELETE SET NULL. Postgres fuehrt das als
  -- UPDATE dieser Zeile aus — ein bedingungsloses RAISE haette also
  -- jede DSGVO-Loeschung eines Kontos blockiert, sobald es einen
  -- einzigen Sicherheitseintrag dazu gibt (derselbe Fehler wie beim
  -- Audit-Trigger vs. FK-Kaskade, 26.08.2026).
  --
  -- Durchgelassen wird deshalb GENAU dieser eine Fall: user_id faellt
  -- von einem Wert auf NULL und sonst aendert sich nichts. Der
  -- Adress-Schnappschuss in user_email bleibt bewusst stehen — er ist
  -- der Grund, warum der Eintrag nach der Loeschung ueberhaupt noch
  -- etwas aussagt; die Loeschung des Kontos selbst nimmt ihm den
  -- Personenbezug im Sinne des Loeschkatalogs nicht, deshalb steht er
  -- dort als 'aufbewahren' mit Rechtsgrundlage.
  IF TG_OP = 'UPDATE'
     AND OLD.user_id IS NOT NULL
     AND NEW.user_id IS NULL
     AND (to_jsonb(OLD) - 'user_id') = (to_jsonb(NEW) - 'user_id') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'security_audit_log ist unveraenderlich: % ist nicht erlaubt', TG_OP
    USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS trg_security_audit_log_unveraenderlich ON public.security_audit_log;
CREATE TRIGGER trg_security_audit_log_unveraenderlich
  BEFORE UPDATE OR DELETE ON public.security_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.security_audit_log_unveraenderlich();

-- ─────────────────────────────────────────────────────────────────────
-- 7) Aufbewahrung
-- ─────────────────────────────────────────────────────────────────────
-- Die Frist ist eine Entscheidung, keine Nebenwirkung: 24 Monate. Das
-- ist laenger als die 12 Monate, nach denen ein Sicherheitsvorfall
-- ueblicherweise entdeckt wird, und kuerzer als die 10-Jahres-Fristen
-- der Pflege- und Buchhaltungsdokumentation — diese Tabelle traegt
-- keinen Beleg, sondern ein Protokoll.
--
-- Die Funktion loescht NICHT von selbst. Sie wird von einem Cron-Lauf
-- gerufen; ohne Aufrufer passiert nichts. Der Unveraenderlichkeits-
-- Trigger wird dafuer kurzzeitig umgangen, indem die Funktion als
-- Eigentuemer laeuft und den Trigger fuer die eigene Sitzung abschaltet.
CREATE OR REPLACE FUNCTION public.security_audit_log_aufraeumen(
  p_aufbewahrung_tage integer DEFAULT 730
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_anzahl integer;
BEGIN
  IF p_aufbewahrung_tage < 90 THEN
    RAISE EXCEPTION 'Aufbewahrung unter 90 Tagen ist nicht vorgesehen (angefragt: %)', p_aufbewahrung_tage;
  END IF;

  ALTER TABLE public.security_audit_log DISABLE TRIGGER trg_security_audit_log_unveraenderlich;
  DELETE FROM public.security_audit_log
   WHERE created_at < now() - make_interval(days => p_aufbewahrung_tage);
  GET DIAGNOSTICS v_anzahl = ROW_COUNT;
  ALTER TABLE public.security_audit_log ENABLE TRIGGER trg_security_audit_log_unveraenderlich;

  RETURN v_anzahl;
END;
$$;

REVOKE ALL ON FUNCTION public.security_audit_log_aufraeumen(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.security_audit_log_aufraeumen(integer) TO service_role;

-- ─────────────────────────────────────────────────────────────────────
-- 8) Anmeldungen aus der Datenbank heraus mitschreiben
-- ─────────────────────────────────────────────────────────────────────
-- Der Anwendungscode protokolliert die Anmeldung selbst (app/auth/login/
-- actions.ts). Dieser Trigger ist der Sicherheitsnetz-Pfad fuer alles,
-- was NICHT ueber dieses Formular laeuft: Magic-Link, native App,
-- OAuth, Token-Refresh mit neuer Anmeldung.
--
-- auth.users gehoert `supabase_auth_admin`. Im SQL-Editor laeuft die
-- Migration als `postgres` und darf den Trigger anlegen; laeuft sie
-- unter einer schwaecheren Rolle, scheitert nur DIESER Block — die
-- Tabelle und der Anwendungspfad stehen dann trotzdem. Deshalb der
-- EXCEPTION-Handler mit klarer Meldung statt eines Abbruchs.
CREATE OR REPLACE FUNCTION public.security_audit_auth_anmeldung()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  -- Nur der Uebergang auf einen NEUEN Anmeldezeitpunkt zaehlt.
  IF NEW.last_sign_in_at IS DISTINCT FROM OLD.last_sign_in_at
     AND NEW.last_sign_in_at IS NOT NULL THEN
    INSERT INTO public.security_audit_log (
      user_id, user_email, event_type, event_category,
      platform, device_info, metadata, severity
    ) VALUES (
      NEW.id, NEW.email, 'login_success', 'auth',
      'server',
      jsonb_build_object('mac_address', 'not_available', 'quelle', 'db_trigger'),
      jsonb_build_object('herkunft', 'auth.users.last_sign_in_at'),
      'info'
    );
  END IF;
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  BEGIN
    DROP TRIGGER IF EXISTS trg_security_audit_auth_anmeldung ON auth.users;
    CREATE TRIGGER trg_security_audit_auth_anmeldung
      AFTER UPDATE OF last_sign_in_at ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.security_audit_auth_anmeldung();
  EXCEPTION WHEN insufficient_privilege OR undefined_table THEN
    RAISE WARNING
      'Trigger auf auth.users nicht angelegt (fehlende Rechte). Die '
      'Anmeldung wird weiterhin vom Anwendungscode protokolliert; der '
      'Sicherheitsnetz-Pfad fehlt. Migration im SQL-Editor als postgres '
      'erneut ausfuehren.';
  END;
END $$;

COMMIT;
