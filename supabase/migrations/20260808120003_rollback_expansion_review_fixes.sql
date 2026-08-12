-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK: Pre-Production-Review-Korrekturen
--           (20260808120000, 20260808120001, 20260808120002)
--
-- Stellt den Stand nach 20260808110000 wieder her.
--
-- ACHTUNG: Dieses Rollback entfernt Schutzmechanismen.
--   • Kassenmodule sind danach wieder per direktem UPDATE setzbar (ohne Audit).
--   • Die Freischaltung prueft danach keine Tarifdaten mehr.
--   • Die Abrechnungs-Guards fallen auf das Bundesland der Organisation zurueck.
-- Nur ausfuehren, wenn die Fix-Migration selbst ein Problem verursacht.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Trigger der Fix-Migration ────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_state_settings_kanal        ON public.state_settings;
DROP TRIGGER IF EXISTS trg_state_settings_audit_immer  ON public.state_settings;
DROP TRIGGER IF EXISTS trg_state_settings_kein_delete  ON public.state_settings;

DROP FUNCTION IF EXISTS public.enforce_state_settings_kanal();
DROP FUNCTION IF EXISTS public.audit_state_settings_immer();
DROP FUNCTION IF EXISTS public.verhindere_state_settings_delete();
DROP FUNCTION IF EXISTS public.expansion_rpc_marker_gesetzt();

-- ── 2. RPCs auf den Stand von 20260808100000 zurueckdrehen ──────────────────
-- activate_insurance_billing: ohne Tarifpflicht, ohne RPC-Markierung
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
  v_result   public.state_activation_result;
  v_before   JSONB;
  v_row      public.state_settings%ROWTYPE;
  v_waitlist INTEGER := 0;
  v_today    DATE := CURRENT_DATE;
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

  v_before := to_jsonb(v_row);

  UPDATE public.state_settings
     SET status = 'ANERKANNT', insurance_enabled = TRUE,
         kassentarife_enabled = TRUE, budgetpruefung_enabled = TRUE,
         kassenrechnung_enabled = TRUE, elnw_enabled = TRUE,
         dakota_export_enabled = TRUE, private_enabled = TRUE,
         approval_document = p_approval_document,
         approval_reference = COALESCE(p_approval_reference, approval_reference),
         approval_authority = COALESCE(p_approval_authority, approval_authority),
         anerkannt_am   = COALESCE(p_anerkannt_am, anerkannt_am, v_today),
         effective_date = COALESCE(p_effective_date, effective_date, v_today),
         abgelehnt_am = NULL, updated_at = now()
   WHERE id = v_row.id
   RETURNING * INTO v_row;

  SELECT COUNT(*) INTO v_waitlist FROM public.state_waitlist
   WHERE organization_id = p_org_id AND bundesland = p_bundesland
     AND benachrichtigen = TRUE AND notified_at IS NULL;

  PERFORM public.log_state_settings_change(
    p_org_id, p_bundesland, 'insurance_activated',
    v_before, to_jsonb(v_row), p_actor_id,
    'Ein-Klick-Freischaltung Kassenabrechnung. Bescheid: ' || p_approval_document);

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

DROP FUNCTION IF EXISTS public.zaehle_kassentarife(UUID, TEXT, DATE);

-- update_state_settings: zurueck auf die Signatur ohne p_felder_leeren
DROP FUNCTION IF EXISTS public.update_state_settings(
  UUID, TEXT, UUID, TEXT, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, DATE, DATE,
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[]);

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
  p_notes                TEXT    DEFAULT NULL
)
RETURNS public.state_settings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_row    public.state_settings%ROWTYPE;
  v_before JSONB;
BEGIN
  SELECT * INTO v_row FROM public.state_settings
   WHERE organization_id = p_org_id AND bundesland = p_bundesland FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Keine state_settings-Zeile fuer % / %', p_org_id, p_bundesland;
  END IF;
  IF p_status = 'ANERKANNT' AND v_row.status <> 'ANERKANNT' THEN
    RAISE EXCEPTION 'Status ANERKANNT wird ausschliesslich ueber activate_insurance_billing() gesetzt.';
  END IF;

  v_before := to_jsonb(v_row);
  UPDATE public.state_settings
     SET status = COALESCE(p_status, status),
         marketing_enabled    = COALESCE(p_marketing_enabled, marketing_enabled),
         registration_enabled = COALESCE(p_registration_enabled, registration_enabled),
         waitinglist_enabled  = COALESCE(p_waitinglist_enabled, waitinglist_enabled),
         private_enabled      = COALESCE(p_private_enabled, private_enabled),
         effective_date       = COALESCE(p_effective_date, effective_date),
         antrag_eingereicht_am = COALESCE(p_antrag_eingereicht_am, antrag_eingereicht_am),
         approval_document    = COALESCE(p_approval_document, approval_document),
         approval_reference   = COALESCE(p_approval_reference, approval_reference),
         approval_authority   = COALESCE(p_approval_authority, approval_authority),
         rechtsgrundlage_land = COALESCE(p_rechtsgrundlage_land, rechtsgrundlage_land),
         ansprechpartner_name    = COALESCE(p_ansprechpartner_name, ansprechpartner_name),
         ansprechpartner_email   = COALESCE(p_ansprechpartner_email, ansprechpartner_email),
         ansprechpartner_telefon = COALESCE(p_ansprechpartner_telefon, ansprechpartner_telefon),
         notes = COALESCE(p_notes, notes),
         updated_at = now()
   WHERE id = v_row.id RETURNING * INTO v_row;

  PERFORM public.log_state_settings_change(
    p_org_id, p_bundesland,
    CASE WHEN p_status IS NOT NULL AND p_status <> (v_before->>'status')
         THEN 'status_changed' ELSE 'updated' END,
    v_before, to_jsonb(v_row), p_actor_id, NULL);
  RETURN v_row;
END;
$fn$;

-- ── 3. Guards auf Organisations-Bundesland zurueckdrehen ────────────────────
CREATE OR REPLACE FUNCTION public.enforce_kassenrechnung_freigeschaltet()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE v_land TEXT; v_kassen_pos INTEGER;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  IF NEW.status IN ('entwurf', 'storniert') THEN RETURN NEW; END IF;
  SELECT COUNT(*) INTO v_kassen_pos FROM public.invoice_items i
   WHERE i.invoice_id = NEW.id AND i.budget_type IS NOT NULL AND i.budget_type <> 'private';
  IF v_kassen_pos = 0 THEN RETURN NEW; END IF;
  v_land := (SELECT bundesland FROM public.organizations WHERE id = NEW.organization_id);
  IF v_land IS NULL OR NOT public.state_flag(NEW.organization_id, v_land, 'kassenrechnung') THEN
    RAISE EXCEPTION 'KASSENRECHNUNG_NICHT_FREIGESCHALTET: Bundesland "%".', COALESCE(v_land, 'unbekannt');
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.enforce_booking_zahlungsart()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE v_org UUID; v_land TEXT;
BEGIN
  IF NEW.payment_method IS NULL OR NEW.payment_method = 'privat' THEN RETURN NEW; END IF;
  v_org := COALESCE(NEW.organization_id, public.current_org_id());
  IF v_org IS NULL THEN NEW.payment_method := 'privat'; RETURN NEW; END IF;
  SELECT bundesland INTO v_land FROM public.organizations WHERE id = v_org;
  IF v_land IS NULL OR NOT public.state_flag(v_org, v_land, 'insurance') THEN
    NEW.payment_method := 'privat';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP FUNCTION IF EXISTS public.kassenabrechnung_erlaubt(UUID, TEXT);

-- ── 4. Rechnungs-RPC zurueck auf v4 ─────────────────────────────────────────
-- Der v4-Stand steht vollstaendig in 20260807180000_tariff_stammdaten_v2.sql.
-- Diese Datei erneut einspielen, um v5 zu ersetzen:
--   psql "$DB_URL" -f supabase/migrations/20260807180000_tariff_stammdaten_v2.sql
-- (Die Datei ist idempotent — CREATE OR REPLACE FUNCTION.)

-- ── 5. Landesregeln: Organisationsbezug entfernen ───────────────────────────
DROP POLICY IF EXISTS landesregeln_read ON public.billing_landesregeln;
CREATE POLICY landesregeln_read ON public.billing_landesregeln
  FOR SELECT TO authenticated USING (TRUE);

DROP INDEX IF EXISTS public.uq_landesregel_global;
DROP INDEX IF EXISTS public.uq_landesregel_org;
DELETE FROM public.billing_landesregeln WHERE organization_id IS NOT NULL;
ALTER TABLE public.billing_landesregeln DROP COLUMN IF EXISTS organization_id;
ALTER TABLE public.billing_landesregeln
  ADD CONSTRAINT uq_landesregel UNIQUE (bundesland, regel_key, rechtsgrundlage, gueltig_ab);

DROP FUNCTION IF EXISTS public.landesregel(TEXT, TEXT, DATE, TEXT, UUID);
CREATE OR REPLACE FUNCTION public.landesregel(
  p_bundesland TEXT, p_regel_key TEXT,
  p_datum DATE DEFAULT CURRENT_DATE, p_rechtsgrundlage TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE sql STABLE SET search_path = public
AS $fn$
  SELECT r.regel_wert FROM public.billing_landesregeln r
   WHERE r.bundesland = public.normalize_bundesland(p_bundesland)
     AND r.regel_key = p_regel_key AND r.ist_aktiv
     AND r.gueltig_ab <= p_datum
     AND (r.gueltig_bis IS NULL OR r.gueltig_bis >= p_datum)
     AND (p_rechtsgrundlage IS NULL OR r.rechtsgrundlage IS NULL
          OR r.rechtsgrundlage = p_rechtsgrundlage)
   ORDER BY (r.rechtsgrundlage IS NOT NULL) DESC, r.gueltig_ab DESC LIMIT 1;
$fn$;
GRANT EXECUTE ON FUNCTION public.landesregel(TEXT, TEXT, DATE, TEXT)
  TO anon, authenticated, service_role;

-- ── 6. Wartelisten-Policy zurueck ───────────────────────────────────────────
DROP POLICY IF EXISTS state_waitlist_insert ON public.state_waitlist;
CREATE POLICY state_waitlist_insert ON public.state_waitlist
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    email IS NOT NULL
    AND public.state_flag(organization_id, bundesland, 'waitinglist') = TRUE
  );

-- ── 7. Wartelisten-Batch-RPC entfernen ──────────────────────────────────────
DROP FUNCTION IF EXISTS public.claim_waitlist_batch(UUID, TEXT, INTEGER);

-- ── 8. PLZ-Regeln entfernen ─────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.eindeutiges_bundesland_fuer_plz(TEXT);
DROP FUNCTION IF EXISTS public.bundesland_fuer_plz(TEXT);
DROP POLICY   IF EXISTS plz_regeln_read ON public.plz_bundesland_regeln;
DROP TABLE    IF EXISTS public.plz_bundesland_regeln;
