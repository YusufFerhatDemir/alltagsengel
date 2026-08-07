-- ════════════════════════════════════════════════════════════════════════════
-- Migration: Expansion Deutschland — Pre-Production-Review-Korrekturen
-- Datum:     2026-08-08
-- Branch:    review/expansion-preproduction
-- Voraussetzung: 20260808100000, 20260808110000
-- Folgt:         20260808120001_plz_bundesland_seed.sql (generiert)
--
-- Behebt die im finalen Pre-Production-Review gefundenen Befunde:
--
--   B1  Freischaltung prüfte KEINE Tarifdaten (Anforderung 6).
--   B2  Ein Administrator konnte insurance_enabled per direktem UPDATE
--       setzen — an der Kaskade, der Tarifprüfung und dem Audit vorbei
--       (Anforderungen 11 und 12).
--   B3  Die Abrechnungs-Guards prüften das Bundesland der ORGANISATION.
--       Sobald ein Bundesland frei ist, wäre für Klienten in JEDEM anderen
--       Bundesland eine Kassenrechnung freigebbar gewesen.
--   B4  Tarifauflösung in create_invoice_draft_atomic nutzte ebenfalls das
--       Bundesland der Organisation statt das des Klienten.
--   B5  state_settings-Zeilen waren löschbar (16-Zeilen-Invariante).
--   B6  Warteliste: anon konnte organization_id, user_id und notified_at
--       frei setzen.
--   B7  Landesregeln ohne Organisationsbezug (Anforderungen 8 und 10).
--   B8  update_state_settings konnte Felder nicht wieder leeren.
--
-- KEINE erfundenen Preise. KEINE Production-Migration.
-- Rollback: 20260808120002_rollback_expansion_review_fixes.sql
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- B3/B4 — PLZ → Bundesland auch in SQL
--
-- Bisher kannten nur TypeScript-Module die Zuordnung. Die Trigger, die die
-- Anerkennungssperre durchsetzen, konnten deshalb nur das Bundesland der
-- Organisation prüfen — und wären umgehbar gewesen, sobald ein einziges
-- Bundesland freigeschaltet ist.
--
-- Die Regeln werden aus lib/expansion/plz-bundesland.ts GENERIERT
-- (scripts/generate-plz-bundesland-sql.ts). TypeScript bleibt die einzige
-- Quelle; der Test __tests__/expansion/plz-sql-sync.test.ts bewacht die
-- Übereinstimmung.
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.plz_bundesland_regeln (
  praefix    TEXT PRIMARY KEY CHECK (praefix ~ '^[0-9]{2,5}$'),
  bundesland TEXT NOT NULL REFERENCES public.bundeslaender(code),
  sicher     BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.plz_bundesland_regeln IS
  'GENERIERT aus lib/expansion/plz-bundesland.ts — nicht von Hand pflegen. '
  'Laengster passender Praefix gewinnt. sicher=FALSE bedeutet: Leitregion '
  'ueberschreitet eine Landesgrenze, fuer die Kassenabrechnung NICHT verwendbar.';

CREATE INDEX IF NOT EXISTS idx_plz_regeln_laenge
  ON public.plz_bundesland_regeln (length(praefix) DESC);

ALTER TABLE public.plz_bundesland_regeln ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS plz_regeln_read ON public.plz_bundesland_regeln;
CREATE POLICY plz_regeln_read ON public.plz_bundesland_regeln
  FOR SELECT TO anon, authenticated USING (TRUE);
GRANT SELECT ON public.plz_bundesland_regeln TO anon, authenticated;

-- Auflösung: laengster Praefix gewinnt, sonst NULL (fail-safe).
CREATE OR REPLACE FUNCTION public.bundesland_fuer_plz(p_input TEXT)
RETURNS TABLE (code TEXT, sicher BOOLEAN)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_plz TEXT;
BEGIN
  v_plz := substring(COALESCE(p_input, '') FROM '[0-9]{5}');
  IF v_plz IS NULL THEN
    RETURN;   -- kein Treffer ⇒ leere Menge ⇒ Aufrufer sieht NULL
  END IF;

  RETURN QUERY
    SELECT r.bundesland, r.sicher
      FROM public.plz_bundesland_regeln r
     WHERE v_plz LIKE r.praefix || '%'
     ORDER BY length(r.praefix) DESC
     LIMIT 1;
END;
$fn$;

COMMENT ON FUNCTION public.bundesland_fuer_plz IS
  'Ordnet eine Postleitzahl einem Bundesland zu. Leere Menge, wenn nicht '
  'zuordenbar. sicher=FALSE ⇒ Grenzregion, fuer Kassenentscheidungen unbrauchbar.';

GRANT EXECUTE ON FUNCTION public.bundesland_fuer_plz(TEXT)
  TO anon, authenticated, service_role;

-- Bequemer Einzelwert: nur EINDEUTIG zuordenbare Bundeslaender.
CREATE OR REPLACE FUNCTION public.eindeutiges_bundesland_fuer_plz(p_input TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE
SET search_path = public
AS $fn$
  SELECT b.code FROM public.bundesland_fuer_plz(p_input) b WHERE b.sicher;
$fn$;

COMMENT ON FUNCTION public.eindeutiges_bundesland_fuer_plz IS
  'Bundesland-Code nur bei eindeutiger Zuordnung, sonst NULL. Grundlage jeder '
  'Kassen-Entscheidung in Triggern und RPCs.';

GRANT EXECUTE ON FUNCTION public.eindeutiges_bundesland_fuer_plz(TEXT)
  TO anon, authenticated, service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- B2 — Freischaltung nur über die RPC, niemals per direktem UPDATE
--
-- Die CHECK-Constraints verhindern zwar eine Aktivierung ohne Bescheid,
-- aber ein Administrator konnte Status, Bescheid und alle Modulschalter in
-- EINEM UPDATE setzen: an der Tarifprüfung und am Audit vorbei.
--
-- Lösung: Die RPCs setzen eine transaktionslokale Markierung. Der Trigger
-- lässt Änderungen an den Kassenschaltern nur mit dieser Markierung zu.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.expansion_rpc_marker_gesetzt()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $fn$
  SELECT COALESCE(current_setting('app.expansion_rpc', TRUE), '') = 'aktiv';
$fn$;

CREATE OR REPLACE FUNCTION public.enforce_state_settings_kanal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_kassenschalter_geaendert BOOLEAN;
BEGIN
  IF public.expansion_rpc_marker_gesetzt() THEN
    RETURN NEW;   -- Aufruf kam aus activate_/deactivate_/update_state_settings
  END IF;

  v_kassenschalter_geaendert :=
       NEW.insurance_enabled      IS DISTINCT FROM OLD.insurance_enabled
    OR NEW.kassentarife_enabled   IS DISTINCT FROM OLD.kassentarife_enabled
    OR NEW.budgetpruefung_enabled IS DISTINCT FROM OLD.budgetpruefung_enabled
    OR NEW.kassenrechnung_enabled IS DISTINCT FROM OLD.kassenrechnung_enabled
    OR NEW.elnw_enabled           IS DISTINCT FROM OLD.elnw_enabled
    OR NEW.dakota_export_enabled  IS DISTINCT FROM OLD.dakota_export_enabled
    OR (NEW.status = 'ANERKANNT' AND OLD.status IS DISTINCT FROM 'ANERKANNT');

  IF v_kassenschalter_geaendert THEN
    RAISE EXCEPTION
      'FREISCHALTUNG_NUR_UEBER_RPC: Kassenmodule und der Status ANERKANNT duerfen '
      'nicht per direktem UPDATE gesetzt werden. Bitte activate_insurance_billing() '
      'bzw. deactivate_insurance_billing() verwenden — nur dort werden Bescheid- und '
      'Tarifpflicht geprueft und der Audit-Eintrag geschrieben.';
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_state_settings_kanal ON public.state_settings;
CREATE TRIGGER trg_state_settings_kanal
  BEFORE UPDATE ON public.state_settings
  FOR EACH ROW EXECUTE FUNCTION public.enforce_state_settings_kanal();

COMMENT ON FUNCTION public.enforce_state_settings_kanal IS
  'GUARD: Kassenschalter und Status ANERKANNT nur ueber die vorgesehenen RPCs. '
  'Schliesst den Weg, per direktem UPDATE ohne Tarifpruefung und ohne Audit '
  'freizuschalten.';

-- ────────────────────────────────────────────────────────────────────────────
-- B2/Anforderung 11 — keine Änderung ohne Audit-Eintrag
--
-- Die RPCs schreiben ihren eigenen, semantisch benannten Eintrag. Alles, was
-- daran vorbei geändert wird (erlaubte Felder per direktem UPDATE), landet
-- hier als 'direct_update'. Damit ist JEDE Änderung nachvollziehbar.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.audit_state_settings_immer()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF public.expansion_rpc_marker_gesetzt() THEN
    RETURN NULL;   -- die RPC hat bereits einen praeziseren Eintrag geschrieben
  END IF;

  IF TG_OP = 'UPDATE' AND to_jsonb(NEW) = to_jsonb(OLD) THEN
    RETURN NULL;   -- Nulloperation
  END IF;

  PERFORM public.log_state_settings_change(
    NEW.organization_id,
    NEW.bundesland,
    CASE TG_OP WHEN 'INSERT' THEN 'created' ELSE 'direct_update' END,
    CASE TG_OP WHEN 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END,
    to_jsonb(NEW),
    auth.uid(),
    'Aenderung ausserhalb der Expansion-RPCs (direkter Tabellenzugriff).'
  );

  RETURN NULL;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_state_settings_audit_immer ON public.state_settings;
CREATE TRIGGER trg_state_settings_audit_immer
  AFTER INSERT OR UPDATE ON public.state_settings
  FOR EACH ROW EXECUTE FUNCTION public.audit_state_settings_immer();

-- ────────────────────────────────────────────────────────────────────────────
-- B5 — state_settings-Zeilen sind nicht löschbar
--
-- Eine fehlende Zeile lässt state_flag() fail-safe FALSE liefern — das ist
-- sicher, aber es verschwindet auch die Historie und die Matrix wird
-- unvollständig. Löschen ist deshalb nur über das Löschen der Organisation
-- (ON DELETE CASCADE) zulässig.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.verhindere_state_settings_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF EXISTS (SELECT 1 FROM public.organizations WHERE id = OLD.organization_id) THEN
    RAISE EXCEPTION
      'STATE_SETTINGS_UNLOESCHBAR: Jede Organisation fuehrt dauerhaft alle 16 '
      'Bundeslaender. Zum Abschalten die Modulschalter auf FALSE setzen, '
      'nicht die Zeile loeschen. (Bundesland: %)', OLD.bundesland;
  END IF;
  RETURN OLD;   -- Organisation wird geloescht ⇒ CASCADE zulassen
END;
$fn$;

DROP TRIGGER IF EXISTS trg_state_settings_kein_delete ON public.state_settings;
CREATE TRIGGER trg_state_settings_kein_delete
  BEFORE DELETE ON public.state_settings
  FOR EACH ROW EXECUTE FUNCTION public.verhindere_state_settings_delete();

-- ────────────────────────────────────────────────────────────────────────────
-- B1 — Freischaltung verlangt Bescheid UND Tarifdaten
--     (ersetzt activate_insurance_billing aus 20260808100000)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.zaehle_kassentarife(
  p_org_id     UUID,
  p_bundesland TEXT,
  p_stichtag   DATE DEFAULT CURRENT_DATE
)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT COUNT(*)::INTEGER
    FROM public.billing_tariffs t
   WHERE t.organization_id = p_org_id
     AND t.rechtsgrundlage <> 'privat'
     AND t.ist_aktiv = TRUE
     AND t.deleted_at IS NULL
     AND (t.bundesland IS NULL OR t.bundesland = p_bundesland)
     AND t.gueltig_ab <= p_stichtag
     AND (t.gueltig_bis IS NULL OR t.gueltig_bis >= p_stichtag);
$fn$;

COMMENT ON FUNCTION public.zaehle_kassentarife IS
  'Anzahl der am Stichtag gueltigen, aktiven Kassentarife einer Organisation '
  'fuer ein Bundesland (inkl. bundeslandunabhaengiger Tarife).';

CREATE OR REPLACE FUNCTION public.activate_insurance_billing(
  p_org_id             UUID,
  p_bundesland         TEXT,
  p_actor_id           UUID,
  p_approval_document  TEXT,
  p_approval_reference TEXT DEFAULT NULL,
  p_approval_authority TEXT DEFAULT NULL,
  p_effective_date     DATE DEFAULT NULL,
  p_anerkannt_am       DATE DEFAULT NULL
)
RETURNS public.state_activation_result
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_result    public.state_activation_result;
  v_before    JSONB;
  v_after     JSONB;
  v_row       public.state_settings%ROWTYPE;
  v_waitlist  INTEGER := 0;
  v_tarife    INTEGER := 0;
  v_today     DATE := CURRENT_DATE;
  v_stichtag  DATE;
BEGIN
  -- ═══ Eingabe-Validierung ═══
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'organization_id darf nicht NULL sein';
  END IF;
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'actor_id darf nicht NULL sein — jede Freischaltung braucht einen Verantwortlichen';
  END IF;
  IF p_bundesland IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.bundeslaender WHERE code = p_bundesland) THEN
    RAISE EXCEPTION 'Unbekanntes Bundesland: "%"', p_bundesland;
  END IF;
  IF p_approval_document IS NULL OR btrim(p_approval_document) = '' THEN
    RAISE EXCEPTION 'FREISCHALTUNG_OHNE_BESCHEID: Ohne hinterlegten Anerkennungsbescheid '
                    'darf die Kassenabrechnung nicht aktiviert werden.';
  END IF;

  -- ═══ Zeile sperren ═══
  SELECT * INTO v_row
    FROM public.state_settings
   WHERE organization_id = p_org_id
     AND bundesland = p_bundesland
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Keine state_settings-Zeile fuer Organisation % / Bundesland %',
      p_org_id, p_bundesland;
  END IF;

  -- ═══ Idempotenz ═══
  IF v_row.insurance_enabled
     AND v_row.kassentarife_enabled
     AND v_row.budgetpruefung_enabled
     AND v_row.kassenrechnung_enabled
     AND v_row.elnw_enabled
     AND v_row.dakota_export_enabled THEN
    v_result.state_setting_id  := v_row.id;
    v_result.bundesland        := v_row.bundesland;
    v_result.status            := v_row.status;
    v_result.insurance_enabled := TRUE;
    v_result.effective_date    := v_row.effective_date;
    v_result.waitlist_count    := 0;
    v_result.already_active    := TRUE;
    RETURN v_result;
  END IF;

  -- ═══ B1: Tarifdaten sind Pflicht ═══
  -- Ohne gueltigen Kassentarif wuerde jede Rechnung mit MISSING_VALID_TARIFF
  -- scheitern — die Freischaltung waere eine leere Zusage.
  v_stichtag := COALESCE(p_effective_date, v_row.effective_date, v_today);
  v_tarife := public.zaehle_kassentarife(p_org_id, p_bundesland, v_stichtag);

  IF v_tarife = 0 THEN
    RAISE EXCEPTION
      'FREISCHALTUNG_OHNE_TARIFE: Fuer Bundesland "%" existiert zum %  kein '
      'gueltiger, aktiver Kassentarif (billing_tariffs mit rechtsgrundlage <> '
      '''privat'', ist_aktiv = TRUE, Gueltigkeit passend). Bitte zuerst die '
      'Tarifdaten pflegen — sonst scheitert jede Rechnung mit MISSING_VALID_TARIFF.',
      p_bundesland, v_stichtag;
  END IF;

  v_before := to_jsonb(v_row);

  -- Markierung: dieser UPDATE kommt aus der vorgesehenen RPC.
  PERFORM set_config('app.expansion_rpc', 'aktiv', TRUE);

  -- ═══ Kaskade: EIN Klick, alle Kassenmodule ═══
  UPDATE public.state_settings
     SET status                 = 'ANERKANNT',
         insurance_enabled      = TRUE,
         kassentarife_enabled   = TRUE,
         budgetpruefung_enabled = TRUE,
         kassenrechnung_enabled = TRUE,
         elnw_enabled           = TRUE,
         dakota_export_enabled  = TRUE,
         private_enabled        = TRUE,
         approval_document      = p_approval_document,
         approval_reference     = COALESCE(p_approval_reference, approval_reference),
         approval_authority     = COALESCE(p_approval_authority, approval_authority),
         anerkannt_am           = COALESCE(p_anerkannt_am, anerkannt_am, v_today),
         effective_date         = COALESCE(p_effective_date, effective_date, v_today),
         abgelehnt_am           = NULL,
         updated_at             = now()
   WHERE id = v_row.id
   RETURNING * INTO v_row;

  v_after := to_jsonb(v_row);

  SELECT COUNT(*) INTO v_waitlist
    FROM public.state_waitlist
   WHERE organization_id = p_org_id
     AND bundesland = p_bundesland
     AND benachrichtigen = TRUE
     AND notified_at IS NULL;

  PERFORM public.log_state_settings_change(
    p_org_id, p_bundesland, 'insurance_activated',
    v_before, v_after, p_actor_id,
    'Ein-Klick-Freischaltung Kassenabrechnung. Bescheid: ' || p_approval_document
      || ' · gueltige Kassentarife am ' || v_stichtag || ': ' || v_tarife
  );

  PERFORM set_config('app.expansion_rpc', '', TRUE);

  v_result.state_setting_id  := v_row.id;
  v_result.bundesland        := v_row.bundesland;
  v_result.status            := v_row.status;
  v_result.insurance_enabled := v_row.insurance_enabled;
  v_result.effective_date    := v_row.effective_date;
  v_result.waitlist_count    := v_waitlist;
  v_result.already_active    := FALSE;

  RETURN v_result;
END;
$fn$;

COMMENT ON FUNCTION public.activate_insurance_billing IS
  'Ein-Klick-Freischaltung der Kassenabrechnung. Verlangt zwingend (a) einen '
  'hinterlegten Anerkennungsbescheid und (b) mindestens einen gueltigen aktiven '
  'Kassentarif fuer das Bundesland. Setzt Status ANERKANNT und alle fuenf '
  'abhaengigen Module in einer Transaktion. SECURITY DEFINER, nur service_role.';

-- ── deactivate: Markierung ergänzen ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.deactivate_insurance_billing(
  p_org_id       UUID,
  p_bundesland   TEXT,
  p_actor_id     UUID,
  p_begruendung  TEXT,
  p_neuer_status TEXT DEFAULT 'IN_PRUEFUNG'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_row    public.state_settings%ROWTYPE;
  v_before JSONB;
BEGIN
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'actor_id darf nicht NULL sein';
  END IF;
  IF p_begruendung IS NULL OR btrim(p_begruendung) = '' THEN
    RAISE EXCEPTION 'Eine Deaktivierung der Kassenabrechnung erfordert eine Begruendung.';
  END IF;
  IF p_neuer_status NOT IN ('VORBEREITUNG', 'ANTRAG_EINGEREICHT', 'IN_PRUEFUNG', 'ABGELEHNT') THEN
    RAISE EXCEPTION 'Ungueltiger Zielstatus fuer Deaktivierung: %', p_neuer_status;
  END IF;

  SELECT * INTO v_row
    FROM public.state_settings
   WHERE organization_id = p_org_id AND bundesland = p_bundesland
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Keine state_settings-Zeile fuer % / %', p_org_id, p_bundesland;
  END IF;

  IF NOT v_row.insurance_enabled THEN
    RETURN FALSE;
  END IF;

  v_before := to_jsonb(v_row);
  PERFORM set_config('app.expansion_rpc', 'aktiv', TRUE);

  UPDATE public.state_settings
     SET insurance_enabled      = FALSE,
         kassentarife_enabled   = FALSE,
         budgetpruefung_enabled = FALSE,
         kassenrechnung_enabled = FALSE,
         elnw_enabled           = FALSE,
         dakota_export_enabled  = FALSE,
         status                 = p_neuer_status,
         abgelehnt_am           = CASE WHEN p_neuer_status = 'ABGELEHNT'
                                       THEN CURRENT_DATE ELSE abgelehnt_am END,
         updated_at             = now()
   WHERE id = v_row.id
   RETURNING * INTO v_row;

  PERFORM public.log_state_settings_change(
    p_org_id, p_bundesland, 'insurance_deactivated',
    v_before, to_jsonb(v_row), p_actor_id, p_begruendung
  );

  PERFORM set_config('app.expansion_rpc', '', TRUE);
  RETURN TRUE;
END;
$fn$;

-- ────────────────────────────────────────────────────────────────────────────
-- B8 — update_state_settings: Felder gezielt leeren können
--      (COALESCE allein macht ein einmal gesetztes Feld unlöschbar)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_state_settings(
  p_org_id               UUID,
  p_bundesland           TEXT,
  p_actor_id             UUID,
  p_status               TEXT    DEFAULT NULL,
  p_marketing_enabled    BOOLEAN DEFAULT NULL,
  p_registration_enabled BOOLEAN DEFAULT NULL,
  p_waitinglist_enabled  BOOLEAN DEFAULT NULL,
  p_private_enabled      BOOLEAN DEFAULT NULL,
  p_effective_date       DATE    DEFAULT NULL,
  p_antrag_eingereicht_am DATE   DEFAULT NULL,
  p_approval_document    TEXT    DEFAULT NULL,
  p_approval_reference   TEXT    DEFAULT NULL,
  p_approval_authority   TEXT    DEFAULT NULL,
  p_rechtsgrundlage_land TEXT    DEFAULT NULL,
  p_ansprechpartner_name    TEXT DEFAULT NULL,
  p_ansprechpartner_email   TEXT DEFAULT NULL,
  p_ansprechpartner_telefon TEXT DEFAULT NULL,
  p_notes                TEXT    DEFAULT NULL,
  p_felder_leeren        TEXT[]  DEFAULT NULL
)
RETURNS public.state_settings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_row      public.state_settings%ROWTYPE;
  v_before   JSONB;
  v_leeren   TEXT[] := COALESCE(p_felder_leeren, ARRAY[]::TEXT[]);
  v_erlaubt  TEXT[] := ARRAY[
    'effective_date', 'antrag_eingereicht_am', 'approval_document',
    'approval_reference', 'approval_authority', 'rechtsgrundlage_land',
    'ansprechpartner_name', 'ansprechpartner_email', 'ansprechpartner_telefon',
    'notes'
  ];
  v_feld     TEXT;
BEGIN
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'actor_id darf nicht NULL sein';
  END IF;
  IF p_status IS NOT NULL
     AND p_status NOT IN ('VORBEREITUNG','ANTRAG_EINGEREICHT','IN_PRUEFUNG','ANERKANNT','ABGELEHNT') THEN
    RAISE EXCEPTION 'Ungueltiger Status: %', p_status;
  END IF;

  FOREACH v_feld IN ARRAY v_leeren LOOP
    IF NOT (v_feld = ANY (v_erlaubt)) THEN
      RAISE EXCEPTION 'Feld "%" darf nicht geleert werden. Erlaubt: %',
        v_feld, array_to_string(v_erlaubt, ', ');
    END IF;
  END LOOP;

  SELECT * INTO v_row
    FROM public.state_settings
   WHERE organization_id = p_org_id AND bundesland = p_bundesland
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Keine state_settings-Zeile fuer % / %', p_org_id, p_bundesland;
  END IF;

  IF p_status = 'ANERKANNT' AND v_row.status <> 'ANERKANNT' THEN
    RAISE EXCEPTION 'Status ANERKANNT wird ausschliesslich ueber activate_insurance_billing() gesetzt.';
  END IF;

  -- Ein anerkanntes Bundesland darf den Bescheid nicht verlieren, solange die
  -- Kassenabrechnung laeuft — sonst schlaegt der CHECK zu oder es entstuende
  -- eine Freischaltung ohne Nachweis.
  IF v_row.insurance_enabled AND 'approval_document' = ANY (v_leeren) THEN
    RAISE EXCEPTION
      'BESCHEID_NICHT_LOESCHBAR: Solange die Kassenabrechnung aktiv ist, kann der '
      'Anerkennungsbescheid nicht entfernt werden. Zuerst deactivate_insurance_billing().';
  END IF;

  v_before := to_jsonb(v_row);
  PERFORM set_config('app.expansion_rpc', 'aktiv', TRUE);

  UPDATE public.state_settings
     SET status                  = COALESCE(p_status, status),
         marketing_enabled       = COALESCE(p_marketing_enabled, marketing_enabled),
         registration_enabled    = COALESCE(p_registration_enabled, registration_enabled),
         waitinglist_enabled     = COALESCE(p_waitinglist_enabled, waitinglist_enabled),
         private_enabled         = COALESCE(p_private_enabled, private_enabled),
         effective_date          = CASE WHEN 'effective_date' = ANY (v_leeren) THEN NULL
                                        ELSE COALESCE(p_effective_date, effective_date) END,
         antrag_eingereicht_am   = CASE WHEN 'antrag_eingereicht_am' = ANY (v_leeren) THEN NULL
                                        ELSE COALESCE(p_antrag_eingereicht_am, antrag_eingereicht_am) END,
         approval_document       = CASE WHEN 'approval_document' = ANY (v_leeren) THEN NULL
                                        ELSE COALESCE(p_approval_document, approval_document) END,
         approval_reference      = CASE WHEN 'approval_reference' = ANY (v_leeren) THEN NULL
                                        ELSE COALESCE(p_approval_reference, approval_reference) END,
         approval_authority      = CASE WHEN 'approval_authority' = ANY (v_leeren) THEN NULL
                                        ELSE COALESCE(p_approval_authority, approval_authority) END,
         rechtsgrundlage_land    = CASE WHEN 'rechtsgrundlage_land' = ANY (v_leeren) THEN NULL
                                        ELSE COALESCE(p_rechtsgrundlage_land, rechtsgrundlage_land) END,
         ansprechpartner_name    = CASE WHEN 'ansprechpartner_name' = ANY (v_leeren) THEN NULL
                                        ELSE COALESCE(p_ansprechpartner_name, ansprechpartner_name) END,
         ansprechpartner_email   = CASE WHEN 'ansprechpartner_email' = ANY (v_leeren) THEN NULL
                                        ELSE COALESCE(p_ansprechpartner_email, ansprechpartner_email) END,
         ansprechpartner_telefon = CASE WHEN 'ansprechpartner_telefon' = ANY (v_leeren) THEN NULL
                                        ELSE COALESCE(p_ansprechpartner_telefon, ansprechpartner_telefon) END,
         notes                   = CASE WHEN 'notes' = ANY (v_leeren) THEN NULL
                                        ELSE COALESCE(p_notes, notes) END,
         updated_at              = now()
   WHERE id = v_row.id
   RETURNING * INTO v_row;

  PERFORM public.log_state_settings_change(
    p_org_id, p_bundesland,
    CASE WHEN p_status IS NOT NULL AND p_status <> (v_before->>'status')
         THEN 'status_changed' ELSE 'updated' END,
    v_before, to_jsonb(v_row), p_actor_id,
    CASE WHEN array_length(v_leeren, 1) > 0
         THEN 'Geleert: ' || array_to_string(v_leeren, ', ') ELSE NULL END
  );

  PERFORM set_config('app.expansion_rpc', '', TRUE);
  RETURN v_row;
END;
$fn$;

-- Alte Signatur (ohne p_felder_leeren) entfernen, damit kein Aufruf sie trifft.
DROP FUNCTION IF EXISTS public.update_state_settings(
  UUID, TEXT, UUID, TEXT, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, DATE, DATE,
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);

-- ────────────────────────────────────────────────────────────────────────────
-- B3 — Abrechnungs-Guards prüfen das Bundesland des KLIENTEN
-- ────────────────────────────────────────────────────────────────────────────

-- Zentrale Auskunft: darf fuer diese PLZ mit der Kasse abgerechnet werden?
CREATE OR REPLACE FUNCTION public.kassenabrechnung_erlaubt(
  p_org_id UUID,
  p_plz    TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_land TEXT;
BEGIN
  -- Nur EINDEUTIG zuordenbare Postleitzahlen. Grenzregionen ⇒ nein.
  v_land := public.eindeutiges_bundesland_fuer_plz(p_plz);
  IF v_land IS NULL THEN
    RETURN FALSE;
  END IF;
  RETURN public.state_flag(p_org_id, v_land, 'kassenrechnung');
END;
$fn$;

COMMENT ON FUNCTION public.kassenabrechnung_erlaubt IS
  'Fail-safe Kernentscheidung: Kassenabrechnung nur bei eindeutig zuordenbarer '
  'PLZ UND freigeschaltetem Bundesland. Spiegelt lib/expansion/state-settings.ts.';

GRANT EXECUTE ON FUNCTION public.kassenabrechnung_erlaubt(UUID, TEXT)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.enforce_kassenrechnung_freigeschaltet()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_kassen_pos INTEGER;
  v_plz        TEXT;
  v_land       TEXT;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;
  IF NEW.status IN ('entwurf', 'storniert') THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_kassen_pos
    FROM public.invoice_items i
   WHERE i.invoice_id = NEW.id
     AND i.budget_type IS NOT NULL
     AND i.budget_type <> 'private';

  IF v_kassen_pos = 0 THEN
    RETURN NEW;   -- reine Privatrechnung
  END IF;

  -- B3-FIX: Massgeblich ist das Bundesland des KLIENTEN, nicht das der
  -- Organisation. Sonst waere nach der Freischaltung eines einzigen
  -- Bundeslands bundesweit abrechenbar.
  SELECT c.zip_code INTO v_plz
    FROM public.clients c
   WHERE c.id = NEW.client_id;

  v_land := public.eindeutiges_bundesland_fuer_plz(v_plz);

  IF v_land IS NULL THEN
    RAISE EXCEPTION
      'KASSENRECHNUNG_BUNDESLAND_UNKLAR: Die Postleitzahl des Klienten ("%") laesst '
      'sich keinem Bundesland eindeutig zuordnen. Ohne eindeutiges Bundesland kann '
      'keine Kassenforderung freigegeben werden. Bitte clients.zip_code pruefen. '
      'Die Rechnung bleibt als Entwurf erhalten.',
      COALESCE(v_plz, 'nicht gesetzt');
  END IF;

  IF NOT public.state_flag(NEW.organization_id, v_land, 'kassenrechnung') THEN
    RAISE EXCEPTION
      'KASSENRECHNUNG_NICHT_FREIGESCHALTET: Fuer das Bundesland des Klienten ("%") '
      'ist die Kassenabrechnung nicht freigeschaltet. Die Rechnung bleibt als Entwurf '
      'erhalten und kann nach der Anerkennung ohne Neuberechnung freigegeben werden. '
      'Privatabrechnung ist unabhaengig davon moeglich. (% Kassenposition(en), '
      'Zielstatus: %)',
      v_land, v_kassen_pos, NEW.status;
  END IF;

  RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION public.enforce_kassenrechnung_freigeschaltet IS
  'GUARD: Eine Rechnung mit Kassenpositionen verlaesst den Entwurfsstatus nur, wenn '
  'das Bundesland des KLIENTEN (aus clients.zip_code) freigeschaltet ist. '
  'Nicht zuordenbare PLZ ⇒ blockiert (fail-safe).';

-- ── Buchungs-Guard ebenfalls auf die Kunden-PLZ umstellen ───────────────────
CREATE OR REPLACE FUNCTION public.enforce_booking_zahlungsart()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_org  UUID;
  v_plz  TEXT;
BEGIN
  IF NEW.payment_method IS NULL OR NEW.payment_method = 'privat' THEN
    RETURN NEW;
  END IF;

  v_org := COALESCE(NEW.organization_id, public.current_org_id());
  IF v_org IS NULL THEN
    NEW.payment_method := 'privat';
    RETURN NEW;
  END IF;

  -- B3-FIX: PLZ des buchenden Kunden statt Bundesland der Organisation.
  SELECT COALESCE(p.postal_code, p.location) INTO v_plz
    FROM public.profiles p
   WHERE p.id = NEW.customer_id;

  IF NOT public.kassenabrechnung_erlaubt(v_org, v_plz) THEN
    -- Kein Abbruch: die Buchung bleibt bestehen, aber als Privatleistung.
    NEW.payment_method := 'privat';
  END IF;

  RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION public.enforce_booking_zahlungsart IS
  'GUARD: setzt payment_method auf "privat" zurueck, wenn fuer die PLZ des Kunden '
  'keine Kassenabrechnung freigeschaltet ist. Verwirft die Buchung NICHT.';

-- ────────────────────────────────────────────────────────────────────────────
-- B6 — Warteliste: anon darf nur harmlose Werte setzen
-- ────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS state_waitlist_insert ON public.state_waitlist;
CREATE POLICY state_waitlist_insert ON public.state_waitlist
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    email IS NOT NULL
    AND email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$'
    AND notified_at IS NULL
    AND (user_id IS NULL OR user_id = auth.uid())
    AND public.state_flag(organization_id, bundesland, 'waitinglist') = TRUE
  );

COMMENT ON POLICY state_waitlist_insert ON public.state_waitlist IS
  'Eintragen fuer alle offen, aber: gueltige E-Mail, notified_at nur NULL und '
  'user_id nur die eigene — sonst koennte man fremde Konten verknuepfen oder '
  'den Benachrichtigungsversand ueberspringen.';

-- ────────────────────────────────────────────────────────────────────────────
-- Wartelisten-Versand: Empfänger atomar beanspruchen (Race Condition)
--
-- Bisher: SELECT (notified_at IS NULL) → Mail → UPDATE. Zwei parallele Läufe
-- (Doppelklick, zweiter Tab, Retry nach Timeout) sehen dieselben Zeilen und
-- schreiben dieselben Menschen zweimal an.
--
-- Jetzt: EIN atomares UPDATE … RETURNING markiert und liefert die Zeilen.
-- Jede Zeile geht garantiert an genau einen Lauf. Schlägt der Versand fehl,
-- setzt die API notified_at wieder auf NULL.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.claim_waitlist_batch(
  p_org_id     UUID,
  p_bundesland TEXT,
  p_limit      INTEGER DEFAULT 200
)
RETURNS TABLE (id UUID, email TEXT, name TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  RETURN QUERY
  WITH kandidaten AS (
    SELECT w.id
      FROM public.state_waitlist w
     WHERE w.organization_id = p_org_id
       AND w.bundesland = p_bundesland
       AND w.benachrichtigen = TRUE
       AND w.notified_at IS NULL
     ORDER BY w.created_at
     LIMIT GREATEST(p_limit, 0)
     FOR UPDATE SKIP LOCKED
  )
  UPDATE public.state_waitlist w
     SET notified_at = now()
    FROM kandidaten k
   WHERE w.id = k.id
  RETURNING w.id, w.email, w.name;
END;
$fn$;

COMMENT ON FUNCTION public.claim_waitlist_batch IS
  'Beansprucht bis zu p_limit noch nicht benachrichtigte Wartelisten-Eintraege '
  'atomar (UPDATE … RETURNING + SKIP LOCKED). Verhindert Doppelversand bei '
  'parallelen Laeufen.';

REVOKE ALL ON FUNCTION public.claim_waitlist_batch(UUID, TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- B7 — Landesregeln: optionaler Organisationsbezug
--      NULL = gilt fuer alle Organisationen (gesetzliche Grundlage).
--      Gesetzt = organisationsspezifische Auslegung/Verschaerfung.
--      Gesetzliche Obergrenzen bleiben bewusst global — ein Gesetz gilt fuer
--      jeden Anbieter gleich.
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.billing_landesregeln
  ADD COLUMN IF NOT EXISTS organization_id UUID
    REFERENCES public.organizations(id) ON DELETE CASCADE;

COMMENT ON COLUMN public.billing_landesregeln.organization_id IS
  'NULL = gilt fuer alle Organisationen (gesetzliche Grundlage). '
  'Gesetzt = organisationsspezifische Regel, die die allgemeine ueberschreibt.';

ALTER TABLE public.billing_landesregeln DROP CONSTRAINT IF EXISTS uq_landesregel;
CREATE UNIQUE INDEX IF NOT EXISTS uq_landesregel_global
  ON public.billing_landesregeln (bundesland, regel_key, COALESCE(rechtsgrundlage, ''), gueltig_ab)
  WHERE organization_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_landesregel_org
  ON public.billing_landesregeln (organization_id, bundesland, regel_key, COALESCE(rechtsgrundlage, ''), gueltig_ab)
  WHERE organization_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.landesregel(
  p_bundesland      TEXT,
  p_regel_key       TEXT,
  p_datum           DATE DEFAULT CURRENT_DATE,
  p_rechtsgrundlage TEXT DEFAULT NULL,
  p_org_id          UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = public
AS $fn$
  SELECT r.regel_wert
    FROM public.billing_landesregeln r
   WHERE r.bundesland = public.normalize_bundesland(p_bundesland)
     AND r.regel_key = p_regel_key
     AND r.ist_aktiv
     AND r.gueltig_ab <= p_datum
     AND (r.gueltig_bis IS NULL OR r.gueltig_bis >= p_datum)
     AND (r.organization_id IS NULL OR r.organization_id = p_org_id)
     AND (p_rechtsgrundlage IS NULL
          OR r.rechtsgrundlage IS NULL
          OR r.rechtsgrundlage = p_rechtsgrundlage)
   ORDER BY (r.organization_id IS NOT NULL) DESC,
            (r.rechtsgrundlage IS NOT NULL) DESC,
            r.gueltig_ab DESC
   LIMIT 1;
$fn$;

COMMENT ON FUNCTION public.landesregel IS
  'Landesspezifischer Regelwert. Reihenfolge der Spezifitaet: organisationsspezifisch '
  'vor allgemein, mit Rechtsgrundlage vor ohne, juengste Fassung zuerst.';

GRANT EXECUTE ON FUNCTION public.landesregel(TEXT, TEXT, DATE, TEXT, UUID)
  TO anon, authenticated, service_role;
DROP FUNCTION IF EXISTS public.landesregel(TEXT, TEXT, DATE, TEXT);

-- Org-Fence auf Landesregeln: allgemeine Regeln sieht jeder, eigene nur die Org.
DROP POLICY IF EXISTS landesregeln_read ON public.billing_landesregeln;
CREATE POLICY landesregeln_read ON public.billing_landesregeln
  FOR SELECT TO authenticated
  USING (organization_id IS NULL OR organization_id = public.current_org_id());

-- ────────────────────────────────────────────────────────────────────────────
-- Berechtigungen der neu erstellten Funktionen
-- ────────────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.activate_insurance_billing(UUID, TEXT, UUID, TEXT, TEXT, TEXT, DATE, DATE)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.deactivate_insurance_billing(UUID, TEXT, UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_state_settings(
  UUID, TEXT, UUID, TEXT, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, DATE, DATE,
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[])
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.zaehle_kassentarife(UUID, TEXT, DATE)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.zaehle_kassentarife(UUID, TEXT, DATE)
  TO authenticated, service_role;
