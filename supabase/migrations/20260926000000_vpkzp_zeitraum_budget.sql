-- ═══════════════════════════════════════════════════════════════════════
-- VP/KZP — Zeitraeume, Tagekontingente und gemeinsamer Jahresbetrag
-- ═══════════════════════════════════════════════════════════════════════
--
-- AUSGANGSLAGE
-- Verhinderungspflege (§ 39 SGB XI) und Kurzzeitpflege (§ 42 SGB XI)
-- teilen sich seit 01.07.2025 EINEN gemeinsamen Jahresbetrag nach § 42a
-- SGB XI. In diesem Repo existierte davon bisher nur die Geldseite, und
-- auch die nur als eine Spalte in client_budgets:
--
--   client_budgets.combined_annual_amount  (Default 3539.00)
--   client_budgets.combined_used_amount    (Default 0)
--
-- Damit laesst sich weder sagen, WELCHE der beiden Leistungen den Topf
-- verbraucht hat, noch WIE VIELE TAGE ein Klient schon in Anspruch
-- genommen hat. Die Tagekontingente sind aber eine eigenstaendige,
-- gleichrangige Grenze — ein Klient kann sein Kontingent ausgeschoepft
-- haben, obwohl Geld uebrig ist.
--
-- DIE ZWEI DIMENSIONEN
--   GELD  EIN gemeinsamer Topf. VP-Verbrauch mindert, was fuer KZP bleibt,
--         und umgekehrt.  → combined_budget_remaining
--   TAGE  ZWEI getrennte Kontingente je Kalenderjahr. VP-Tage mindern das
--         KZP-Kontingent NICHT.  → vp_days_used / kzp_days_used
--
-- Diese Trennung ist der haeufigste Denkfehler bei VP/KZP. Wer die Tage
-- in einen gemeinsamen Topf wirft, sperrt berechtigte Leistungen; wer das
-- Geld in zwei Toepfe trennt, laesst zu viel durch.
--
-- WARUM DREI TABELLEN
--   vpkzp_buchungen      Belegebene. Fuehrend. Eine Zeile je Leistungs-
--                        zeitraum UND Kalenderjahr — ein Zeitraum ueber
--                        den Jahreswechsel wird beim Anlegen zerlegt
--                        (lib/billing/vpkzp/zeitraum.ts), weil sowohl
--                        Tage als auch Betrag kalenderjahresbezogen sind.
--                        Der CHECK unten erzwingt diese Zerlegung.
--   client_vpkzp_usage   Jahresstand. ABGELEITET, per Trigger aus den
--                        Buchungen fortgeschrieben — nie von Hand
--                        gepflegt, sonst laufen Beleg und Stand
--                        auseinander (dasselbe Problem wie bei
--                        client_budgets.used_amount).
--   vpkzp_audit_log      Aenderungsspur. Unveraenderlich.
--
-- TAGE WERDEN EINDEUTIG GEZAEHLT
-- Zwei Buchungen am selben Tag (Mehrfachleistung) verbrauchen EINEN Tag
-- des Kontingents, nicht zwei. Die Fortschreibung zaehlt deshalb
-- count(DISTINCT tag) ueber generate_series und nicht sum(tage) — sonst
-- ist ein Kontingent doppelt so schnell leer, wie es zusteht. Die
-- TypeScript-Seite rechnet in eindeutigeTage() genauso.
--
-- KEIN UEBERTRAG
-- § 42a Abs. 1 SGB XI kennt EINEN Jahresbetrag, keinen fortlaufenden Topf
-- — anders als § 45b, wo Restbetraege bis zum 30.06. des Folgejahres
-- weiterlaufen. Zum 01.01. beginnen Geld UND Tage neu. Deshalb gibt es
-- hier bewusst keine carryover-Spalte: eine Spalte, die immer 0 ist,
-- behauptet einen Mechanismus, den es nicht gibt.
--
-- Rollback: 20260926000001_rollback_vpkzp_zeitraum_budget.sql
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1) Tagekontingente als Datenbankfunktion ────────────────────────
-- Zwilling zu VPKZP_ZEIT_VERSIONEN in lib/billing/vpkzp/konstanten.ts.
-- Bewusst doppelt gefuehrt: TypeScript schuetzt den Anwendungsweg mit
-- verstaendlichen Meldungen, diese Funktion den direkten Schreibweg
-- (PostgREST, SQL-Editor, Import). Nur die Datenbank ist nicht umgehbar.
-- __tests__/billing/vpkzp-konstanten-sql.test.ts haelt beide Seiten
-- deckungsgleich — genau wie bei public.tarif_leistungsart().
--
-- Fail-closed: fuer ein Jahr ohne hinterlegte Kontingente wird NULL
-- geliefert, und der Trigger unten lehnt dann ab. Es wird kein
-- benachbarter Zeitraum geraten.
CREATE OR REPLACE FUNCTION public.vpkzp_max_tage(p_art text, p_jahr integer)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_catalog
AS $fn$
  SELECT CASE
    WHEN p_jahr IS NULL OR p_jahr < 2024 THEN NULL
    -- 6 Wochen a 7 Tage je Kalenderjahr (§ 39 SGB XI)
    WHEN lower(p_art) = 'verhinderungspflege' THEN 42
    -- 8 Wochen a 7 Tage je Kalenderjahr (§ 42 SGB XI)
    WHEN lower(p_art) = 'kurzzeitpflege' THEN 56
    ELSE NULL
  END;
$fn$;

COMMENT ON FUNCTION public.vpkzp_max_tage(text, integer) IS
  'Tageskontingent je Leistungsart und Kalenderjahr. Zwilling zu '
  'VPKZP_ZEIT_VERSIONEN (lib/billing/vpkzp/konstanten.ts). NULL = kein '
  'hinterlegtes Kontingent; der Fortschreibungs-Trigger lehnt dann ab.';

-- ── 2) Belegebene: Buchungen ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vpkzp_buchungen (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid NOT NULL REFERENCES public.organizations(id),
  client_id          uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  art                text NOT NULL
    CHECK (art IN ('verhinderungspflege', 'kurzzeitpflege')),
  calendar_year      integer NOT NULL CHECK (calendar_year >= 2024),
  zeitraum_von       date NOT NULL,
  zeitraum_bis       date NOT NULL,
  -- Beide Grenzen einschliesslich; ein eintaegiger Einsatz hat von = bis.
  CONSTRAINT vpkzp_buchungen_zeitraum_richtung CHECK (zeitraum_bis >= zeitraum_von),
  -- Erzwingt die Zerlegung am Jahreswechsel. Ohne diesen CHECK koennte
  -- eine Buchung vom 27.12. bis 09.01. komplett einem Jahr zugeschlagen
  -- werden — die Summe stimmt dann, beide Jahresstaende sind falsch.
  CONSTRAINT vpkzp_buchungen_im_kalenderjahr CHECK (
    EXTRACT(YEAR FROM zeitraum_von) = calendar_year
    AND EXTRACT(YEAR FROM zeitraum_bis) = calendar_year
  ),
  tage               integer NOT NULL CHECK (tage > 0),
  -- Betraege in EURO (nicht Cent) — wie invoices.total_amount und
  -- client_budgets.annual_amount im ganzen Repo.
  betrag_euro        numeric(12,2) NOT NULL DEFAULT 0,
  budget_betrag_euro numeric(12,2) NOT NULL DEFAULT 0,
  privat_betrag_euro numeric(12,2) NOT NULL DEFAULT 0,
  -- Herkunft des Preises. tarif_status wird beim Anlegen mitgeschrieben,
  -- damit spaeter nachvollziehbar bleibt, auf welcher Grundlage gebucht
  -- wurde — eine spaetere Statusaenderung am Tarif darf den Beleg nicht
  -- rueckwirkend umdeuten.
  tarif_id           uuid,
  tarif_status       text
    CHECK (tarif_status IS NULL OR tarif_status IN ('verified', 'unverified', 'blocked')),
  status             text NOT NULL DEFAULT 'gebucht'
    CHECK (status IN ('geplant', 'gebucht', 'storniert')),
  service_record_id  uuid,
  notiz              text,
  created_by         uuid,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vpkzp_buchungen_klient_jahr
  ON public.vpkzp_buchungen(organization_id, client_id, calendar_year);

CREATE INDEX IF NOT EXISTS idx_vpkzp_buchungen_zeitraum
  ON public.vpkzp_buchungen(client_id, art, zeitraum_von, zeitraum_bis)
  WHERE status <> 'storniert';

-- ── 3) Jahresstand ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.client_vpkzp_usage (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid NOT NULL REFERENCES public.organizations(id),
  client_id             uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  calendar_year         integer NOT NULL CHECK (calendar_year >= 2024),
  vp_days_used          integer NOT NULL DEFAULT 0 CHECK (vp_days_used >= 0),
  kzp_days_used         integer NOT NULL DEFAULT 0 CHECK (kzp_days_used >= 0),
  vp_amount_used        numeric(12,2) NOT NULL DEFAULT 0,
  kzp_amount_used       numeric(12,2) NOT NULL DEFAULT 0,
  -- Gemeinsamer Jahresbetrag § 42a SGB XI. Default = gesetzlicher Wert
  -- seit 01.01.2025 (siehe lib/config/budget-constants.ts). Abweichende
  -- Bewilligungen der Kasse werden hier eingetragen.
  combined_budget_total numeric(12,2) NOT NULL DEFAULT 3539.00
    CHECK (combined_budget_total >= 0),
  -- Generiert, nicht gepflegt: ein Restbetrag, den man von Hand setzen
  -- kann, driftet garantiert irgendwann vom Verbrauch weg.
  combined_budget_remaining numeric(12,2)
    GENERATED ALWAYS AS (
      GREATEST(0::numeric, combined_budget_total - vp_amount_used - kzp_amount_used)
    ) STORED,
  letzte_fortschreibung timestamptz NOT NULL DEFAULT now(),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_client_vpkzp_usage UNIQUE (organization_id, client_id, calendar_year)
);

CREATE INDEX IF NOT EXISTS idx_client_vpkzp_usage_org_jahr
  ON public.client_vpkzp_usage(organization_id, calendar_year);

COMMENT ON TABLE public.client_vpkzp_usage IS
  'Jahresstand VP/KZP je Klient. ABGELEITET aus vpkzp_buchungen (Trigger '
  'trg_vpkzp_fortschreibung) — nicht von Hand pflegen.';
COMMENT ON COLUMN public.client_vpkzp_usage.combined_budget_remaining IS
  'Generiert: combined_budget_total - vp_amount_used - kzp_amount_used, nie negativ.';
COMMENT ON COLUMN public.client_vpkzp_usage.vp_days_used IS
  'Eindeutige Kalendertage mit Verhinderungspflege. Zwei Buchungen am selben '
  'Tag zaehlen als EIN Tag.';

-- ── 4) Aenderungsspur ───────────────────────────────────────────────
-- BEWUSST OHNE Fremdschluessel auf clients/vpkzp_buchungen: ein FK mit
-- CASCADE wuerde die Spur beim Loeschen des Belegs mitloeschen — dann
-- protokolliert sie genau den Fall nicht, fuer den sie da ist. Ohne FK
-- kann auch keine DSGVO-Kaskade an dieser Tabelle haengenbleiben
-- (bekannte Falle: unbedingtes RAISE im BEFORE-DELETE blockiert CASCADE).
CREATE TABLE IF NOT EXISTS public.vpkzp_audit_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  buchung_id      uuid,
  client_id       uuid,
  calendar_year   integer,
  art             text,
  aktion          text NOT NULL CHECK (aktion IN ('anlage', 'aenderung', 'storno', 'loeschung')),
  vorher          jsonb,
  nachher         jsonb,
  actor_id        uuid,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vpkzp_audit_log_buchung
  ON public.vpkzp_audit_log(buchung_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vpkzp_audit_log_org
  ON public.vpkzp_audit_log(organization_id, created_at DESC);

-- ── 5) Fortschreibung des Jahresstands ──────────────────────────────
-- p_erlaube_anlage = false auf dem Loeschweg: dort darf keine Standzeile
-- neu entstehen (siehe unten). Bewusst ein Parameter und nicht TG_OP —
-- TG_OP gibt es nur in Trigger-Funktionen und wird an eine per PERFORM
-- gerufene Funktion NICHT durchgereicht.
CREATE OR REPLACE FUNCTION public.vpkzp_fortschreiben(
  p_org uuid, p_client uuid, p_jahr integer, p_erlaube_anlage boolean DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $fn$
DECLARE
  v_vp_tage    integer;
  v_kzp_tage   integer;
  v_vp_betrag  numeric(12,2);
  v_kzp_betrag numeric(12,2);
  v_max_vp     integer;
  v_max_kzp    integer;
  v_treffer    integer;
BEGIN
  IF p_org IS NULL OR p_client IS NULL OR p_jahr IS NULL THEN
    RETURN;
  END IF;

  -- Eindeutige Kalendertage je Leistungsart. count(DISTINCT tag) und
  -- NICHT sum(tage): zwei Buchungen am selben Tag verbrauchen einen Tag.
  SELECT
    COALESCE(count(DISTINCT tag) FILTER (WHERE art = 'verhinderungspflege'), 0),
    COALESCE(count(DISTINCT tag) FILTER (WHERE art = 'kurzzeitpflege'), 0)
  INTO v_vp_tage, v_kzp_tage
  FROM (
    SELECT b.art, g::date AS tag
    FROM public.vpkzp_buchungen b
    CROSS JOIN LATERAL generate_series(b.zeitraum_von, b.zeitraum_bis, interval '1 day') AS g
    WHERE b.organization_id = p_org
      AND b.client_id = p_client
      AND b.calendar_year = p_jahr
      AND b.status <> 'storniert'
  ) tage;

  SELECT
    COALESCE(sum(budget_betrag_euro) FILTER (WHERE art = 'verhinderungspflege'), 0),
    COALESCE(sum(budget_betrag_euro) FILTER (WHERE art = 'kurzzeitpflege'), 0)
  INTO v_vp_betrag, v_kzp_betrag
  FROM public.vpkzp_buchungen
  WHERE organization_id = p_org
    AND client_id = p_client
    AND calendar_year = p_jahr
    AND status <> 'storniert';

  -- Kontingentgrenze. NULL = fuer dieses Jahr ist nichts hinterlegt →
  -- fail-closed, es wird kein Kontingent geraten.
  v_max_vp  := public.vpkzp_max_tage('verhinderungspflege', p_jahr);
  v_max_kzp := public.vpkzp_max_tage('kurzzeitpflege', p_jahr);

  IF v_max_vp IS NULL OR v_max_kzp IS NULL THEN
    RAISE EXCEPTION 'VPKZP_JAHR_OHNE_KONTINGENT: Fuer % sind keine Tagekontingente hinterlegt. Neuen Zeitraum in vpkzp_max_tage() und VPKZP_ZEIT_VERSIONEN eintragen.', p_jahr
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_vp_tage > v_max_vp THEN
    RAISE EXCEPTION 'VPKZP_TAGE_UEBERSCHRITTEN: Verhinderungspflege % Tage im Jahr % ueberschreitet das Kontingent von % Tagen.', v_vp_tage, p_jahr, v_max_vp
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_kzp_tage > v_max_kzp THEN
    RAISE EXCEPTION 'VPKZP_TAGE_UEBERSCHRITTEN: Kurzzeitpflege % Tage im Jahr % ueberschreitet das Kontingent von % Tagen.', v_kzp_tage, p_jahr, v_max_kzp
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.client_vpkzp_usage
     SET vp_days_used = v_vp_tage,
         kzp_days_used = v_kzp_tage,
         vp_amount_used = v_vp_betrag,
         kzp_amount_used = v_kzp_betrag,
         letzte_fortschreibung = now(),
         updated_at = now()
   WHERE organization_id = p_org
     AND client_id = p_client
     AND calendar_year = p_jahr;

  GET DIAGNOSTICS v_treffer = ROW_COUNT;

  -- Kein INSERT auf dem Loeschweg: waehrend einer DSGVO-Kaskade ist die
  -- Standzeile moeglicherweise schon weg, und eine neu angelegte Zeile
  -- wuerde den geloeschten Klienten wieder auferstehen lassen.
  IF v_treffer = 0 AND p_erlaube_anlage THEN
    INSERT INTO public.client_vpkzp_usage (
      organization_id, client_id, calendar_year,
      vp_days_used, kzp_days_used, vp_amount_used, kzp_amount_used
    )
    VALUES (p_org, p_client, p_jahr, v_vp_tage, v_kzp_tage, v_vp_betrag, v_kzp_betrag)
    ON CONFLICT (organization_id, client_id, calendar_year) DO UPDATE
      SET vp_days_used = EXCLUDED.vp_days_used,
          kzp_days_used = EXCLUDED.kzp_days_used,
          vp_amount_used = EXCLUDED.vp_amount_used,
          kzp_amount_used = EXCLUDED.kzp_amount_used,
          letzte_fortschreibung = now(),
          updated_at = now();
  END IF;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.trg_vpkzp_fortschreibung()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.vpkzp_fortschreiben(OLD.organization_id, OLD.client_id, OLD.calendar_year, false);
    RETURN OLD;
  END IF;

  -- Beim UPDATE kann sich der Klient, das Jahr oder der Mandant aendern.
  -- Dann muessen BEIDE Jahresstaende neu gerechnet werden, sonst bleibt
  -- der alte auf einem Wert stehen, den kein Beleg mehr traegt.
  IF TG_OP = 'UPDATE' AND (
       OLD.organization_id IS DISTINCT FROM NEW.organization_id
    OR OLD.client_id       IS DISTINCT FROM NEW.client_id
    OR OLD.calendar_year   IS DISTINCT FROM NEW.calendar_year
  ) THEN
    -- Nur aufraeumen, nichts anlegen: der alte Schluessel bekommt keine
    -- neue Nullzeile, wenn dort gar keine mehr existiert.
    PERFORM public.vpkzp_fortschreiben(OLD.organization_id, OLD.client_id, OLD.calendar_year, false);
  END IF;

  PERFORM public.vpkzp_fortschreiben(NEW.organization_id, NEW.client_id, NEW.calendar_year);
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_vpkzp_fortschreibung ON public.vpkzp_buchungen;
CREATE TRIGGER trg_vpkzp_fortschreibung
  AFTER INSERT OR UPDATE OR DELETE ON public.vpkzp_buchungen
  FOR EACH ROW EXECUTE FUNCTION public.trg_vpkzp_fortschreibung();

-- ── 6) Aenderungsspur schreiben ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_vpkzp_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $fn$
DECLARE
  v_aktion text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_aktion := 'anlage';
  ELSIF TG_OP = 'DELETE' THEN
    v_aktion := 'loeschung';
  ELSIF NEW.status = 'storniert' AND OLD.status IS DISTINCT FROM 'storniert' THEN
    v_aktion := 'storno';
  ELSE
    v_aktion := 'aenderung';
  END IF;

  INSERT INTO public.vpkzp_audit_log (
    organization_id, buchung_id, client_id, calendar_year, art, aktion,
    vorher, nachher, actor_id
  )
  VALUES (
    COALESCE(NEW.organization_id, OLD.organization_id),
    COALESCE(NEW.id, OLD.id),
    COALESCE(NEW.client_id, OLD.client_id),
    COALESCE(NEW.calendar_year, OLD.calendar_year),
    COALESCE(NEW.art, OLD.art),
    v_aktion,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END,
    COALESCE(NEW.created_by, OLD.created_by)
  );

  RETURN COALESCE(NEW, OLD);
END;
$fn$;

DROP TRIGGER IF EXISTS trg_vpkzp_audit ON public.vpkzp_buchungen;
CREATE TRIGGER trg_vpkzp_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.vpkzp_buchungen
  FOR EACH ROW EXECUTE FUNCTION public.trg_vpkzp_audit();

-- Die Spur ist unveraenderlich. Kein Fremdschluessel zeigt hierher, also
-- kann dieses RAISE auch keine DSGVO-Kaskade blockieren.
CREATE OR REPLACE FUNCTION public.trg_vpkzp_audit_unveraenderlich()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $fn$
BEGIN
  RAISE EXCEPTION 'VPKZP_AUDIT_UNVERAENDERLICH: vpkzp_audit_log ist eine Aenderungsspur und wird weder geaendert noch geloescht.'
    USING ERRCODE = 'insufficient_privilege';
END;
$fn$;

DROP TRIGGER IF EXISTS trg_vpkzp_audit_unveraenderlich ON public.vpkzp_audit_log;
CREATE TRIGGER trg_vpkzp_audit_unveraenderlich
  BEFORE UPDATE OR DELETE ON public.vpkzp_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.trg_vpkzp_audit_unveraenderlich();

-- Der Jahresstand ist abgeleitet und darf nur ueber die Fortschreibung
-- wandern. Ein direkter UPDATE auf vp_days_used wuerde Beleg und Stand
-- auseinanderlaufen lassen — genau der Fehler, den client_budgets.used_amount
-- schon einmal hatte. Das Bewilligungsfeld combined_budget_total bleibt
-- ausdruecklich aenderbar: es kommt von der Pflegekasse, nicht aus Belegen.
CREATE OR REPLACE FUNCTION public.trg_vpkzp_usage_abgeleitet()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $fn$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;   -- Aufruf aus vpkzp_fortschreiben() heraus
  END IF;

  IF NEW.vp_days_used    IS DISTINCT FROM OLD.vp_days_used
  OR NEW.kzp_days_used   IS DISTINCT FROM OLD.kzp_days_used
  OR NEW.vp_amount_used  IS DISTINCT FROM OLD.vp_amount_used
  OR NEW.kzp_amount_used IS DISTINCT FROM OLD.kzp_amount_used THEN
    RAISE EXCEPTION 'VPKZP_STAND_ABGELEITET: Verbrauchswerte werden aus vpkzp_buchungen fortgeschrieben und nicht direkt gesetzt.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_vpkzp_usage_abgeleitet ON public.client_vpkzp_usage;
CREATE TRIGGER trg_vpkzp_usage_abgeleitet
  BEFORE UPDATE ON public.client_vpkzp_usage
  FOR EACH ROW EXECUTE FUNCTION public.trg_vpkzp_usage_abgeleitet();

-- ── 7) RLS ──────────────────────────────────────────────────────────
ALTER TABLE public.vpkzp_buchungen    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_vpkzp_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vpkzp_audit_log    ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['vpkzp_buchungen', 'client_vpkzp_usage', 'vpkzp_audit_log'] LOOP
    -- Zugriffsrolle: Administration (is_admin() deckt die abrechnenden
    -- Rollen ab, siehe 20260924000000_rollenkonzept_least_privilege.sql).
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = t || '_admin'
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL USING (public.is_admin())',
        t || '_admin', t
      );
    END IF;

    -- Mandantengrenze ZUSAETZLICH als RESTRICTIVE Policy. Sie ersetzt die
    -- Admin-Policy nicht, sie schneidet sie zu: ohne RESTRICTIVE saehe ein
    -- Administrator des einen Mandanten die Jahresstaende des anderen.
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = 'org_fence_' || t
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL '
        'USING (organization_id = current_org_id())',
        'org_fence_' || t, t
      );
    END IF;

    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', t);
  END LOOP;
END;
$$;

-- Jede public-Funktion ist per Default anon-ausfuehrbar (siehe
-- 20260922000000_revoke_anon_cron_funktionen.sql). vpkzp_max_tage ist
-- reine Rechtsauskunft und darf angemeldet gelesen werden; die
-- SECURITY-DEFINER-Fortschreibung darf NUR der Trigger ausloesen.
REVOKE ALL ON FUNCTION public.vpkzp_max_tage(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vpkzp_max_tage(text, integer) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.vpkzp_fortschreiben(uuid, uuid, integer, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vpkzp_fortschreiben(uuid, uuid, integer, boolean) TO service_role;

COMMIT;
