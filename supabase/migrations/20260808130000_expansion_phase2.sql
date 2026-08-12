-- ════════════════════════════════════════════════════════════════════════════
-- Migration: Expansion Deutschland — Phase 2
-- Datum:     2026-08-08
-- Branch:    review/expansion-preproduction
-- Voraussetzung: 20260808100000, 110000, 120000, 120001, 120002
--
-- ZWECK
--   Die Ein-Klick-Freischaltung schaltete bisher nur die MODULSCHALTER.
--   Vorbereitete Kassentarife und Landesregeln blieben inaktiv und mussten
--   von Hand nachgezogen werden. Die Vorgabe lautet aber:
--
--     „Sobald ein Bundesland auf ANERKANNT gesetzt wird, müssen automatisch
--      freigeschaltet werden: Kassenleistungen, Budgets, Pflegekassen-
--      abrechnung, Leistungsnachweise, Dakota-Export, TARIFE, LANDESREGELN —
--      ohne weiteren Code ändern zu müssen."
--
--   Diese Migration schließt die letzten beiden Punkte.
--
-- ÄNDERUNGEN
--   1. zaehle_kassentarife() zählt VORBEREITETE Tarife (aktiv ODER inaktiv).
--      Vorher wurden nur aktive gezählt — das war widersprüchlich, weil
--      Tarife bis zur Anerkennung bewusst inaktiv vorbereitet werden sollen.
--   2. activate_insurance_billing() v3 setzt zusätzlich
--        billing_tariffs.ist_aktiv    = TRUE  (Kassentarife des Bundeslands)
--        billing_landesregeln.ist_aktiv = TRUE (Regeln des Bundeslands)
--      und meldet zurück, wie viele Datensätze scharf geschaltet wurden.
--   3. deactivate_insurance_billing() nimmt beides wieder zurück.
--   4. Neue View state_expansion_dashboard: alle Kennzahlen je Bundesland
--      in EINER Abfrage — Grundlage des Admin-Dashboards (kein N+1).
--
-- KEINE erfundenen Preise. KEINE Production-Migration.
-- Rollback: 20260808130001_rollback_expansion_phase2.sql
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Vorbereitete Kassentarife zählen (aktiv ODER inaktiv)
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
     AND t.deleted_at IS NULL
     AND (t.bundesland IS NULL OR t.bundesland = p_bundesland)
     AND t.gueltig_ab <= p_stichtag
     AND (t.gueltig_bis IS NULL OR t.gueltig_bis >= p_stichtag);
$fn$;

COMMENT ON FUNCTION public.zaehle_kassentarife IS
  'Anzahl der am Stichtag gueltigen VORBEREITETEN Kassentarife (aktiv oder inaktiv) '
  'einer Organisation fuer ein Bundesland, inkl. bundeslandunabhaengiger Tarife. '
  'Die Freischaltung setzt sie anschliessend auf ist_aktiv = TRUE.';

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Ergebnistyp erweitern (Tarif-/Regel-Zähler)
--    Reihenfolge: erst Funktion weg, dann Typ — sonst haengt die Signatur.
-- ────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.activate_insurance_billing(
  UUID, TEXT, UUID, TEXT, TEXT, TEXT, DATE, DATE);
DROP TYPE IF EXISTS public.state_activation_result CASCADE;

CREATE TYPE public.state_activation_result AS (
  state_setting_id  UUID,
  bundesland        TEXT,
  status            TEXT,
  insurance_enabled BOOLEAN,
  effective_date    DATE,
  waitlist_count    INTEGER,
  tarife_aktiviert  INTEGER,
  regeln_aktiviert  INTEGER,
  already_active    BOOLEAN
);

COMMENT ON TYPE public.state_activation_result IS
  'Rueckgabe der Ein-Klick-Freischaltung inkl. Anzahl scharf geschalteter '
  'Kassentarife und Landesregeln.';

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Ein-Klick-Freischaltung v3 — Module + Tarife + Landesregeln
-- ────────────────────────────────────────────────────────────────────────────
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
  v_aktiviert INTEGER := 0;
  v_regeln    INTEGER := 0;
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
    v_result.tarife_aktiviert  := 0;
    v_result.regeln_aktiviert  := 0;
    v_result.already_active    := TRUE;
    RETURN v_result;
  END IF;

  -- ═══ Tarifdaten sind Pflicht (Anforderung 6 aus dem Review) ═══
  v_stichtag := COALESCE(p_effective_date, v_row.effective_date, v_today);
  v_tarife := public.zaehle_kassentarife(p_org_id, p_bundesland, v_stichtag);

  IF v_tarife = 0 THEN
    RAISE EXCEPTION
      'FREISCHALTUNG_OHNE_TARIFE: Fuer Bundesland "%" existiert zum % kein '
      'vorbereiteter Kassentarif (billing_tariffs mit rechtsgrundlage <> ''privat'' '
      'und passender Gueltigkeit). Bitte zuerst die Tarifdaten pflegen — sie werden '
      'bei der Freischaltung automatisch scharf geschaltet.',
      p_bundesland, v_stichtag;
  END IF;

  v_before := to_jsonb(v_row);
  PERFORM set_config('app.expansion_rpc', 'aktiv', TRUE);

  -- ═══ Modulschalter ═══
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

  -- ═══ TARIFE scharf schalten ═══
  -- Bis zur Anerkennung werden Kassentarife bewusst inaktiv vorbereitet
  -- (GUARD 2 verbietet nur die Quelle ANERKENNUNGSBESCHEID). Jetzt gehen sie
  -- in einem Zug live — ohne dass jemand 20 Zeilen von Hand umstellt.
  WITH aktiviert AS (
    UPDATE public.billing_tariffs t
       SET ist_aktiv  = TRUE,
           updated_at = now()
     WHERE t.organization_id = p_org_id
       AND t.rechtsgrundlage <> 'privat'
       AND t.deleted_at IS NULL
       AND t.ist_aktiv = FALSE
       AND (t.bundesland IS NULL OR t.bundesland = p_bundesland)
       AND t.gueltig_ab <= v_stichtag
       AND (t.gueltig_bis IS NULL OR t.gueltig_bis >= v_stichtag)
    RETURNING t.id
  )
  SELECT COUNT(*)::INTEGER INTO v_aktiviert FROM aktiviert;

  -- ═══ LANDESREGELN scharf schalten ═══
  WITH regeln AS (
    UPDATE public.billing_landesregeln r
       SET ist_aktiv  = TRUE,
           updated_at = now()
     WHERE r.bundesland = p_bundesland
       AND r.ist_aktiv = FALSE
       AND (r.organization_id IS NULL OR r.organization_id = p_org_id)
       AND r.gueltig_ab <= v_stichtag
       AND (r.gueltig_bis IS NULL OR r.gueltig_bis >= v_stichtag)
    RETURNING r.id
  )
  SELECT COUNT(*)::INTEGER INTO v_regeln FROM regeln;

  SELECT COUNT(*) INTO v_waitlist
    FROM public.state_waitlist
   WHERE organization_id = p_org_id
     AND bundesland = p_bundesland
     AND benachrichtigen = TRUE
     AND notified_at IS NULL;

  PERFORM public.log_state_settings_change(
    p_org_id, p_bundesland, 'insurance_activated',
    v_before, v_after, p_actor_id,
    'Ein-Klick-Freischaltung. Bescheid: ' || p_approval_document
      || ' · vorbereitete Kassentarife: ' || v_tarife
      || ' · davon neu aktiviert: ' || v_aktiviert
      || ' · Landesregeln aktiviert: ' || v_regeln
  );

  PERFORM set_config('app.expansion_rpc', '', TRUE);

  v_result.state_setting_id  := v_row.id;
  v_result.bundesland        := v_row.bundesland;
  v_result.status            := v_row.status;
  v_result.insurance_enabled := v_row.insurance_enabled;
  v_result.effective_date    := v_row.effective_date;
  v_result.waitlist_count    := v_waitlist;
  v_result.tarife_aktiviert  := v_aktiviert;
  v_result.regeln_aktiviert  := v_regeln;
  v_result.already_active    := FALSE;

  RETURN v_result;
END;
$fn$;

COMMENT ON FUNCTION public.activate_insurance_billing IS
  'Ein-Klick-Freischaltung v3. Verlangt Anerkennungsbescheid UND mindestens einen '
  'vorbereiteten Kassentarif. Setzt in einer Transaktion: Status ANERKANNT, alle '
  'fuenf Kassenmodule, alle vorbereiteten Kassentarife des Bundeslands auf aktiv '
  'und alle Landesregeln des Bundeslands auf aktiv. SECURITY DEFINER, nur service_role.';

REVOKE ALL ON FUNCTION public.activate_insurance_billing(UUID, TEXT, UUID, TEXT, TEXT, TEXT, DATE, DATE)
  FROM PUBLIC, anon, authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. Abschaltung nimmt Tarife und Regeln wieder zurück
-- ────────────────────────────────────────────────────────────────────────────
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
  v_row      public.state_settings%ROWTYPE;
  v_before   JSONB;
  v_tarife   INTEGER := 0;
  v_regeln   INTEGER := 0;
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

  -- Kassentarife dieses Bundeslands wieder auf inaktiv. Sie waeren ohnehin
  -- nicht abrechenbar; inaktiv zu sein macht den Zustand ehrlich und
  -- verhindert, dass sie bei einer Wiederfreischaltung ungeprueft gelten.
  -- Bundeslandunabhaengige Tarife (bundesland IS NULL) bleiben unangetastet —
  -- sie koennen fuer andere, weiterhin freigeschaltete Laender gelten.
  WITH deaktiviert AS (
    UPDATE public.billing_tariffs t
       SET ist_aktiv = FALSE, updated_at = now()
     WHERE t.organization_id = p_org_id
       AND t.rechtsgrundlage <> 'privat'
       AND t.deleted_at IS NULL
       AND t.ist_aktiv = TRUE
       AND t.bundesland = p_bundesland
    RETURNING t.id
  )
  SELECT COUNT(*)::INTEGER INTO v_tarife FROM deaktiviert;

  WITH deaktiviert AS (
    UPDATE public.billing_landesregeln r
       SET ist_aktiv = FALSE, updated_at = now()
     WHERE r.bundesland = p_bundesland
       AND r.ist_aktiv = TRUE
       AND (r.organization_id IS NULL OR r.organization_id = p_org_id)
    RETURNING r.id
  )
  SELECT COUNT(*)::INTEGER INTO v_regeln FROM deaktiviert;

  PERFORM public.log_state_settings_change(
    p_org_id, p_bundesland, 'insurance_deactivated',
    v_before, to_jsonb(v_row), p_actor_id,
    p_begruendung || ' · deaktivierte Kassentarife: ' || v_tarife
      || ' · deaktivierte Landesregeln: ' || v_regeln
  );

  PERFORM set_config('app.expansion_rpc', '', TRUE);
  RETURN TRUE;
END;
$fn$;

COMMENT ON FUNCTION public.deactivate_insurance_billing IS
  'Schaltet Kassenabrechnung, alle fuenf Module, die Kassentarife und die '
  'Landesregeln eines Bundeslands ab. Begruendung ist Pflicht, Audit-Eintrag folgt.';

REVOKE ALL ON FUNCTION public.deactivate_insurance_billing(UUID, TEXT, UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. Dashboard-View — alle Kennzahlen je Bundesland in einer Abfrage
--
-- Ohne diese View braeuchte das Admin-Dashboard fuenf Abfragen je Bundesland
-- (16 × 5 = 80 Roundtrips). Hier ist es eine.
-- ────────────────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.state_expansion_dashboard;
CREATE VIEW public.state_expansion_dashboard AS
SELECT
  s.organization_id,
  s.bundesland,
  b.bezeichnung        AS bundesland_label,
  b.iso_code,
  b.sort_order,
  s.status,

  s.marketing_enabled,
  s.registration_enabled,
  s.waitinglist_enabled,
  s.private_enabled,
  s.insurance_enabled,
  s.kassentarife_enabled,
  s.budgetpruefung_enabled,
  s.kassenrechnung_enabled,
  s.elnw_enabled,
  s.dakota_export_enabled,

  s.effective_date,
  s.antrag_eingereicht_am,
  s.anerkannt_am,
  s.abgelehnt_am,
  s.approval_document,
  s.approval_reference,
  s.approval_authority,
  s.rechtsgrundlage_land,
  s.ansprechpartner_name,
  s.ansprechpartner_email,
  s.ansprechpartner_telefon,
  s.notes,
  s.updated_at,

  -- Warteliste
  COALESCE(w.gesamt, 0)  AS warteliste_gesamt,
  COALESCE(w.offen, 0)   AS warteliste_offen,

  -- Tarife (Schichten 2/3)
  COALESCE(t.kassentarife_gesamt, 0) AS kassentarife_gesamt,
  COALESCE(t.kassentarife_aktiv, 0)  AS kassentarife_aktiv,
  COALESCE(t.privattarife_aktiv, 0)  AS privattarife_aktiv,

  -- Schicht 1 und 5
  COALESCE(o.obergrenzen_gesamt, 0)     AS obergrenzen_gesamt,
  COALESCE(o.obergrenzen_bestaetigt, 0) AS obergrenzen_bestaetigt,
  COALESCE(g.landesregeln_aktiv, 0)     AS landesregeln_aktiv,
  COALESCE(p.wegepauschalen_aktiv, 0)   AS wegepauschalen_aktiv,

  -- Operativer Bestand
  COALESCE(c.klienten, 0)        AS klienten,
  COALESCE(c.klienten_ohne_plz, 0) AS klienten_ohne_plz,

  -- Ist das Land startklar? Genau die Bedingungen der Freischaltung.
  (s.approval_document IS NOT NULL
   AND COALESCE(t.kassentarife_gesamt, 0) > 0) AS freischaltbar

FROM public.state_settings s
JOIN public.bundeslaender b ON b.code = s.bundesland

LEFT JOIN LATERAL (
  SELECT COUNT(*)::INTEGER AS gesamt,
         COUNT(*) FILTER (WHERE notified_at IS NULL)::INTEGER AS offen
    FROM public.state_waitlist wl
   WHERE wl.organization_id = s.organization_id
     AND wl.bundesland = s.bundesland
) w ON TRUE

LEFT JOIN LATERAL (
  SELECT
    COUNT(*) FILTER (WHERE bt.rechtsgrundlage <> 'privat')::INTEGER AS kassentarife_gesamt,
    COUNT(*) FILTER (WHERE bt.rechtsgrundlage <> 'privat' AND bt.ist_aktiv)::INTEGER AS kassentarife_aktiv,
    COUNT(*) FILTER (WHERE bt.rechtsgrundlage  = 'privat' AND bt.ist_aktiv)::INTEGER AS privattarife_aktiv
    FROM public.billing_tariffs bt
   WHERE bt.organization_id = s.organization_id
     AND bt.deleted_at IS NULL
     AND (bt.bundesland IS NULL OR bt.bundesland = s.bundesland)
) t ON TRUE

LEFT JOIN LATERAL (
  SELECT COUNT(*)::INTEGER AS obergrenzen_gesamt,
         COUNT(*) FILTER (WHERE bestaetigt)::INTEGER AS obergrenzen_bestaetigt
    FROM public.billing_gesetzliche_obergrenzen go
   WHERE go.ist_aktiv
     AND (go.bundesland IS NULL OR go.bundesland = s.bundesland)
) o ON TRUE

LEFT JOIN LATERAL (
  SELECT COUNT(*)::INTEGER AS landesregeln_aktiv
    FROM public.billing_landesregeln lr
   WHERE lr.bundesland = s.bundesland
     AND lr.ist_aktiv
     AND (lr.organization_id IS NULL OR lr.organization_id = s.organization_id)
) g ON TRUE

LEFT JOIN LATERAL (
  SELECT COUNT(*)::INTEGER AS wegepauschalen_aktiv
    FROM public.billing_wegepauschalen wp
   WHERE wp.organization_id = s.organization_id
     AND wp.ist_aktiv
     AND wp.deleted_at IS NULL
     AND (wp.bundesland IS NULL OR wp.bundesland = s.bundesland)
) p ON TRUE

LEFT JOIN LATERAL (
  SELECT COUNT(*)::INTEGER AS klienten,
         COUNT(*) FILTER (
           WHERE public.eindeutiges_bundesland_fuer_plz(cl.zip_code) IS NULL
         )::INTEGER AS klienten_ohne_plz
    FROM public.clients cl
   WHERE cl.organization_id = s.organization_id
     AND COALESCE(cl.status, 'active') <> 'inactive'
     AND (
       public.eindeutiges_bundesland_fuer_plz(cl.zip_code) = s.bundesland
       -- Klienten ohne zuordenbare PLZ werden dem Bundesland der Organisation
       -- zugerechnet, damit sie im Dashboard sichtbar bleiben statt zu verschwinden.
       OR (public.eindeutiges_bundesland_fuer_plz(cl.zip_code) IS NULL
           AND s.bundesland = (SELECT bundesland FROM public.organizations
                                WHERE id = s.organization_id))
     )
) c ON TRUE;

COMMENT ON VIEW public.state_expansion_dashboard IS
  'Kennzahlen je Organisation und Bundesland fuer das Admin-Dashboard: Status, alle '
  'Modulschalter, Warteliste, Tarife je Schicht, Klientenbestand und die Angabe, ob '
  'das Land freischaltbar ist (Bescheid + vorbereitete Tarife).';

GRANT SELECT ON public.state_expansion_dashboard TO authenticated;
