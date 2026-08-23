-- ═══════════════════════════════════════════════════════════════════════
-- VP/KZP — Integritaetshaertung (Wettlauf, Vorzeichen, Aenderungsspur)
-- ═══════════════════════════════════════════════════════════════════════
--
-- Delta-Sicherheitspruefung 23.08.2026 zu 20260926000000. Drei Befunde,
-- alle an derselben Stelle: die Datenbank ist die letzte Sperre vor dem
-- Kontingent, und sie hielt in drei Faellen nicht.
--
-- ── BEFUND 1 (hoch): Das Tagekontingent war im Wettlauf umgehbar ──────
-- vpkzp_fortschreiben() zaehlt erst (SELECT ueber vpkzp_buchungen), prueft
-- dann das Kontingent und schreibt zuletzt den Jahresstand. Zwischen
-- Zaehlen und Schreiben lag keine Sperre. Zwei gleichzeitige Buchungen
-- desselben Klienten laufen in READ COMMITTED damit beide gegen ihren
-- eigenen Schnappschuss:
--
--   Tx A  INSERT 30 Tage → zaehlt 30 (sieht B nicht) → 30 <= 56 → UPDATE
--   Tx B  INSERT 30 Tage → zaehlt 30 (sieht A nicht) → 30 <= 56 → UPDATE
--                                                       ↑ wartet auf A
--   commit beider  ⇒  60 Tage gebucht, Kontingent 56, Jahresstand 30
--
-- Beides ist falsch: das Kontingent ist ueberzogen UND der Jahresstand
-- steht auf dem Wert der zuletzt schreibenden Transaktion statt auf der
-- Summe (klassisches Lost Update). Der Zeilen-Lock des UPDATE kommt zu
-- spaet — gezaehlt wurde da schon.
--
-- Es braucht dafuer keinen Angreifer und keine erhoehten Rechte: ein
-- doppelt abgeschickter Antrag oder zwei Bearbeiter am selben Klienten
-- reichen.
--
-- Die Sperre muss deshalb VOR das Zaehlen. pg_advisory_xact_lock je
-- (Mandant, Klient, Jahr) ist hier das richtige Werkzeug — anders als
-- beim Sammelrechnungslauf (20260925000000, Sperre als Tabellenzeile)
-- laeuft die Fortschreibung vollstaendig in EINER Transaktion, genau der
-- Lebensdauer eines Transaktions-Locks. Die wartende Transaktion liest
-- nach dem Lock in READ COMMITTED mit frischem Schnappschuss und sieht
-- die eben committete Buchung.
--
-- Die Sperre ist eng gefasst: zwei Klienten oder zwei Jahre blockieren
-- sich nicht, nur derselbe Jahresstand.
--
-- ── BEFUND 2 (mittel): Negativbetraege gaben Budget frei ─────────────
-- betrag_euro, budget_betrag_euro und privat_betrag_euro hatten keinen
-- Vorzeichen-CHECK. vpkzp_fortschreiben() summiert budget_betrag_euro in
-- vp_amount_used/kzp_amount_used, und combined_budget_remaining ist
-- daraus generiert. Eine Buchung ueber -1000 EUR senkt damit den
-- Verbrauch und hebt den Rest des gemeinsamen Jahresbetrags nach § 42a
-- um 1000 EUR an — aus einer Buchung wird eine Gutschrift auf das
-- Kassenbudget.
--
-- Stornierungen brauchen das nicht: dafuer gibt es status='storniert',
-- und die Fortschreibung laesst stornierte Buchungen aus. Ein
-- Negativbetrag ist hier immer ein Fehler.
--
-- ── BEFUND 3 (niedrig): Die Aenderungsspur war beschreibbar ──────────
-- vpkzp_audit_log war gegen UPDATE und DELETE geschuetzt, aber nicht
-- gegen INSERT. Die RLS-Policy ist FOR ALL USING (is_admin()) — jede
-- Administrationsrolle konnte also frei erfundene Eintraege in die Spur
-- schreiben. Eine Spur, in die man schreiben kann, belegt nichts mehr:
-- sie kann einen Vorgang behaupten, den es nie gab, oder einen echten
-- Eintrag zwischen Faelschungen unauffindbar machen.
--
-- Eintraege entstehen ausschliesslich in trg_vpkzp_audit. Der Trigger
-- laeuft auf Trigger-Tiefe 1 (er haengt an vpkzp_buchungen), sein INSERT
-- loest diesen Waechter auf Tiefe 2 aus. Ein Schreibzugriff von aussen
-- kommt auf Tiefe 0 an und wird abgelehnt.
--
-- ── NICHT GEAENDERT ──────────────────────────────────────────────────
-- Der Geld-Deckel des gemeinsamen Jahresbetrags bleibt in TypeScript
-- (lib/billing/vpkzp/pruefprotokoll.ts), wie der Budgetdeckel im
-- Rechnungsweg auch. Diese Migration verschiebt keine fachliche Grenze,
-- sie sorgt dafuer, dass die vorhandenen halten.
--
-- Voraussetzung: 20260926000000_vpkzp_zeitraum_budget.sql
-- Rollback: 20260929000001_rollback_vpkzp_integritaet_haertung.sql
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1) Vorzeichen (Befund 2) ────────────────────────────────────────
-- NOT VALID und danach VALIDATE: der CHECK greift ab sofort fuer jede
-- neue Zeile, und die Pruefung des Bestands kann die Migration nicht
-- umwerfen. Findet sie etwas, ist das eine Warnung mit Ansage — kein
-- stiller Durchlauf und kein abgebrochenes Deployment.
DO $$
DECLARE
  r record;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'vpkzp_buchungen'
  ) THEN
    RAISE EXCEPTION 'VPKZP_BASIS_FEHLT: 20260926000000_vpkzp_zeitraum_budget.sql muss zuerst laufen.';
  END IF;

  FOR r IN
    SELECT * FROM (VALUES
      ('vpkzp_buchungen_betrag_nicht_negativ',        'betrag_euro >= 0'),
      ('vpkzp_buchungen_budgetbetrag_nicht_negativ',  'budget_betrag_euro >= 0'),
      ('vpkzp_buchungen_privatbetrag_nicht_negativ',  'privat_betrag_euro >= 0')
    ) AS v(name, ausdruck)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = r.name) THEN
      EXECUTE format(
        'ALTER TABLE public.vpkzp_buchungen ADD CONSTRAINT %I CHECK (%s) NOT VALID',
        r.name, r.ausdruck
      );
      BEGIN
        EXECUTE format('ALTER TABLE public.vpkzp_buchungen VALIDATE CONSTRAINT %I', r.name);
      EXCEPTION WHEN check_violation THEN
        RAISE WARNING
          'VPKZP_BESTAND_NEGATIV: % konnte nicht validiert werden — es gibt Buchungen, die % verletzen. Der CHECK greift fuer neue Zeilen; der Bestand muss von Hand bereinigt werden.',
          r.name, r.ausdruck;
      END;
    END IF;
  END LOOP;
END;
$$;

-- ── 2) Fortschreibung mit Sperre (Befund 1) ─────────────────────────
-- Wortgleich mit 20260926000000 bis auf den pg_advisory_xact_lock am
-- Anfang. Der Rest steht hier mit, weil CREATE OR REPLACE die ganze
-- Funktion ersetzt — ein Ausschnitt waere nicht anwendbar.
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

  -- MUSS vor dem Zaehlen stehen. Steht die Sperre erst beim UPDATE, hat
  -- die wartende Transaktion ihren Kontingent-Vergleich schon auf einem
  -- Schnappschuss gemacht, der die andere Buchung nicht enthaelt.
  -- Nur dieser eine Jahresstand wird serialisiert.
  PERFORM pg_advisory_xact_lock(
    hashtext('vpkzp:' || p_org::text || ':' || p_client::text || ':' || p_jahr::text)
  );

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

REVOKE ALL ON FUNCTION public.vpkzp_fortschreiben(uuid, uuid, integer, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vpkzp_fortschreiben(uuid, uuid, integer, boolean) TO service_role;

-- ── 3) Aenderungsspur nur aus dem Trigger (Befund 3) ────────────────
CREATE OR REPLACE FUNCTION public.trg_vpkzp_audit_nur_aus_trigger()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $fn$
BEGIN
  -- trg_vpkzp_audit haengt an vpkzp_buchungen und laeuft auf Tiefe 1;
  -- sein INSERT loest diesen Waechter auf Tiefe 2 aus. Ein Schreibzugriff
  -- ueber PostgREST oder den SQL-Editor kommt auf Tiefe 0 an.
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'VPKZP_AUDIT_NUR_AUS_TRIGGER: Eintraege in vpkzp_audit_log entstehen ausschliesslich aus trg_vpkzp_audit. Ein von Hand geschriebener Eintrag waere eine Faelschung der Aenderungsspur.'
    USING ERRCODE = 'insufficient_privilege';
END;
$fn$;

DROP TRIGGER IF EXISTS trg_vpkzp_audit_nur_aus_trigger ON public.vpkzp_audit_log;
CREATE TRIGGER trg_vpkzp_audit_nur_aus_trigger
  BEFORE INSERT ON public.vpkzp_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.trg_vpkzp_audit_nur_aus_trigger();

COMMIT;
