-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK: Expansion Deutschland — Phase 2 (20260808130000)
--
-- Stellt den Stand nach 20260808120002 wieder her:
--   • Ergebnistyp ohne Tarif-/Regel-Zaehler
--   • Freischaltung setzt nur die Modulschalter, keine Tarife/Landesregeln
--   • zaehle_kassentarife() zaehlt wieder nur AKTIVE Tarife
--   • Dashboard-View entfaellt
--
-- ACHTUNG: Bereits aktivierte Tarife und Landesregeln bleiben aktiv — dieses
-- Rollback dreht nur die Funktionen zurueck, nicht die Daten. Das ist Absicht:
-- ein bereits freigeschaltetes Bundesland soll durch ein Code-Rollback nicht
-- stillschweigend abrechnungsunfaehig werden.
-- ════════════════════════════════════════════════════════════════════════════

DROP VIEW IF EXISTS public.state_expansion_dashboard;

-- ── Ergebnistyp zurueck auf die 7-Felder-Fassung ────────────────────────────
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
  already_active    BOOLEAN
);

-- ── zaehle_kassentarife: wieder nur aktive Tarife ───────────────────────────
CREATE OR REPLACE FUNCTION public.zaehle_kassentarife(
  p_org_id     UUID,
  p_bundesland TEXT,
  p_stichtag   DATE DEFAULT CURRENT_DATE
)
RETURNS INTEGER
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
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

-- ── Freischaltung ohne Tarif-/Regel-Aktivierung ─────────────────────────────
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
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_result   public.state_activation_result;
  v_before   JSONB;
  v_row      public.state_settings%ROWTYPE;
  v_waitlist INTEGER := 0;
  v_tarife   INTEGER := 0;
  v_today    DATE := CURRENT_DATE;
  v_stichtag DATE;
BEGIN
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'actor_id darf nicht NULL sein';
  END IF;
  IF p_approval_document IS NULL OR btrim(p_approval_document) = '' THEN
    RAISE EXCEPTION 'FREISCHALTUNG_OHNE_BESCHEID: Ohne hinterlegten Anerkennungsbescheid '
                    'darf die Kassenabrechnung nicht aktiviert werden.';
  END IF;

  SELECT * INTO v_row FROM public.state_settings
   WHERE organization_id = p_org_id AND bundesland = p_bundesland FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Keine state_settings-Zeile fuer % / %', p_org_id, p_bundesland;
  END IF;

  IF v_row.insurance_enabled AND v_row.dakota_export_enabled THEN
    v_result.state_setting_id  := v_row.id;
    v_result.bundesland        := v_row.bundesland;
    v_result.status            := v_row.status;
    v_result.insurance_enabled := TRUE;
    v_result.effective_date    := v_row.effective_date;
    v_result.waitlist_count    := 0;
    v_result.already_active    := TRUE;
    RETURN v_result;
  END IF;

  v_stichtag := COALESCE(p_effective_date, v_row.effective_date, v_today);
  v_tarife := public.zaehle_kassentarife(p_org_id, p_bundesland, v_stichtag);
  IF v_tarife = 0 THEN
    RAISE EXCEPTION 'FREISCHALTUNG_OHNE_TARIFE: Fuer Bundesland "%" existiert zum % '
                    'kein gueltiger aktiver Kassentarif.', p_bundesland, v_stichtag;
  END IF;

  v_before := to_jsonb(v_row);
  PERFORM set_config('app.expansion_rpc', 'aktiv', TRUE);

  UPDATE public.state_settings
     SET status = 'ANERKANNT', insurance_enabled = TRUE,
         kassentarife_enabled = TRUE, budgetpruefung_enabled = TRUE,
         kassenrechnung_enabled = TRUE, elnw_enabled = TRUE,
         dakota_export_enabled = TRUE, private_enabled = TRUE,
         approval_document  = p_approval_document,
         approval_reference = COALESCE(p_approval_reference, approval_reference),
         approval_authority = COALESCE(p_approval_authority, approval_authority),
         anerkannt_am   = COALESCE(p_anerkannt_am, anerkannt_am, v_today),
         effective_date = COALESCE(p_effective_date, effective_date, v_today),
         abgelehnt_am = NULL, updated_at = now()
   WHERE id = v_row.id RETURNING * INTO v_row;

  SELECT COUNT(*) INTO v_waitlist FROM public.state_waitlist
   WHERE organization_id = p_org_id AND bundesland = p_bundesland
     AND benachrichtigen = TRUE AND notified_at IS NULL;

  PERFORM public.log_state_settings_change(
    p_org_id, p_bundesland, 'insurance_activated',
    v_before, to_jsonb(v_row), p_actor_id,
    'Ein-Klick-Freischaltung. Bescheid: ' || p_approval_document);

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

REVOKE ALL ON FUNCTION public.activate_insurance_billing(UUID, TEXT, UUID, TEXT, TEXT, TEXT, DATE, DATE)
  FROM PUBLIC, anon, authenticated;

-- ── Abschaltung ohne Tarif-/Regel-Ruecknahme ────────────────────────────────
-- Der Stand aus 20260808120000 steht vollstaendig in dieser Datei; erneut
-- einspielen, um die Phase-2-Fassung zu ersetzen:
--   psql "$DB_URL" -f supabase/migrations/20260808120000_expansion_review_fixes.sql
