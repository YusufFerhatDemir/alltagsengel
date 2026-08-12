-- ════════════════════════════════════════════════════════════════════════════
-- Migration: Expansion Deutschland — bundeslandfähige Freischaltungssteuerung
-- Datum:     2026-08-08
-- Branch:    feature/expansion-deutschland
--
-- ZWECK
--   Die Plattform muss deutschlandweit betrieben werden können, OHNE dass eine
--   fehlende §45a-Anerkennung ein ganzes Bundesland oder gar die komplette
--   Plattform blockiert. Jedes Bundesland trägt seinen eigenen Status und
--   seine eigenen Modul-Schalter.
--
--   Bisher war die Kassen-Freischaltung hart auf Hessen kodiert
--   (lib/hessen-plz.ts, PLZ-Präfixe im Code). Diese Migration verlagert die
--   Entscheidung in Stammdaten: state_settings ist ab sofort die EINZIGE
--   Wahrheit darüber, was in einem Bundesland erlaubt ist.
--
-- KERNREGELN (in der DB erzwungen, nicht nur in der UI)
--   1. insurance_enabled = TRUE ist NUR möglich, wenn
--        status = 'ANERKANNT' UND ein Anerkennungsbescheid hinterlegt ist.
--   2. Alle abhängigen Kassenmodule (Kassentarife, Budgetprüfung,
--      Kassenrechnung, digitale Leistungsnachweise, Dakota-Export) können
--      nur eingeschaltet sein, wenn insurance_enabled = TRUE ist.
--   3. Werbung, Registrierung, Warteliste und Privatleistungen sind von der
--      Anerkennung UNABHÄNGIG und laufen unabhängig weiter.
--
-- EIN-KLICK-FREISCHALTUNG
--   public.activate_insurance_billing(...) setzt in EINER Transaktion:
--     status → ANERKANNT, insurance_enabled → TRUE und alle fünf
--     abhängigen Modulschalter → TRUE, inkl. Audit-Eintrag.
--   Kein weiterer Programmieraufwand nötig.
--
-- KEINE erfundenen Preise. KEINE Production-Migration ohne Freigabe.
-- Rollback: 20260808100001_rollback_expansion_deutschland.sql
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- 0. Katalog: Bundesländer (kontrollierte Codes, keine Freitext-Strings)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bundeslaender (
  code        TEXT PRIMARY KEY,
  bezeichnung TEXT NOT NULL,
  iso_code    TEXT NOT NULL,          -- ISO 3166-2:DE, z. B. DE-HE
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.bundeslaender IS
  'Kontrollierter Katalog der 16 Bundeslaender. Referenzziel fuer state_settings, '
  'billing_tariffs.bundesland, billing_gesetzliche_obergrenzen u. a.';

INSERT INTO public.bundeslaender (code, bezeichnung, iso_code, sort_order) VALUES
  ('baden_wuerttemberg',      'Baden-Württemberg',      'DE-BW',  1),
  ('bayern',                  'Bayern',                 'DE-BY',  2),
  ('berlin',                  'Berlin',                 'DE-BE',  3),
  ('brandenburg',             'Brandenburg',            'DE-BB',  4),
  ('bremen',                  'Bremen',                 'DE-HB',  5),
  ('hamburg',                 'Hamburg',                'DE-HH',  6),
  ('hessen',                  'Hessen',                 'DE-HE',  7),
  ('mecklenburg_vorpommern',  'Mecklenburg-Vorpommern', 'DE-MV',  8),
  ('niedersachsen',           'Niedersachsen',          'DE-NI',  9),
  ('nordrhein_westfalen',     'Nordrhein-Westfalen',    'DE-NW', 10),
  ('rheinland_pfalz',         'Rheinland-Pfalz',        'DE-RP', 11),
  ('saarland',                'Saarland',               'DE-SL', 12),
  ('sachsen',                 'Sachsen',                'DE-SN', 13),
  ('sachsen_anhalt',          'Sachsen-Anhalt',         'DE-ST', 14),
  ('schleswig_holstein',      'Schleswig-Holstein',     'DE-SH', 15),
  ('thueringen',              'Thüringen',              'DE-TH', 16)
ON CONFLICT (code) DO NOTHING;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. state_settings — Freischaltungs-Matrix je Organisation × Bundesland
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.state_settings (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id        UUID NOT NULL
                           REFERENCES public.organizations(id) ON DELETE CASCADE,
  bundesland             TEXT NOT NULL
                           REFERENCES public.bundeslaender(code),

  -- ═══ Anerkennungs-Status ═══
  status                 TEXT NOT NULL DEFAULT 'VORBEREITUNG'
                           CHECK (status IN (
                             'VORBEREITUNG',
                             'ANTRAG_EINGEREICHT',
                             'IN_PRUEFUNG',
                             'ANERKANNT',
                             'ABGELEHNT'
                           )),

  -- ═══ Unabhängige Module (laufen OHNE Anerkennung) ═══
  marketing_enabled      BOOLEAN NOT NULL DEFAULT TRUE,
  registration_enabled   BOOLEAN NOT NULL DEFAULT TRUE,
  waitinglist_enabled    BOOLEAN NOT NULL DEFAULT TRUE,
  private_enabled        BOOLEAN NOT NULL DEFAULT FALSE,

  -- ═══ Kassenabrechnung — Hauptschalter ═══
  insurance_enabled      BOOLEAN NOT NULL DEFAULT FALSE,

  -- ═══ Abhängige Kassenmodule (Ein-Klick-Kaskade) ═══
  kassentarife_enabled   BOOLEAN NOT NULL DEFAULT FALSE,
  budgetpruefung_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  kassenrechnung_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  elnw_enabled           BOOLEAN NOT NULL DEFAULT FALSE,  -- digitale Leistungsnachweise
  dakota_export_enabled  BOOLEAN NOT NULL DEFAULT FALSE,  -- §302/§105 Datenaustausch

  -- ═══ Termine ═══
  effective_date         DATE,          -- GO-Live-Datum (geplant oder erfolgt)
  antrag_eingereicht_am  DATE,
  anerkannt_am           DATE,
  abgelehnt_am           DATE,

  -- ═══ Nachweis / Behörde ═══
  approval_document      TEXT,          -- Storage-Pfad oder Aktenzeichen des Bescheids
  approval_reference     TEXT,          -- Aktenzeichen
  approval_authority     TEXT,          -- z. B. "Hessisches Ministerium für Soziales und Integration"
  rechtsgrundlage_land   TEXT,          -- z. B. "PfluV Hessen"

  -- ═══ Ansprechpartner (wird in der Kundenapp angezeigt) ═══
  ansprechpartner_name    TEXT,
  ansprechpartner_email   TEXT,
  ansprechpartner_telefon TEXT,

  notes                  TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_state_settings_org_land UNIQUE (organization_id, bundesland),

  -- ═══ HARTE COMPLIANCE-GUARDS ═══
  -- Kassenabrechnung nur mit Anerkennung UND hinterlegtem Bescheid.
  CONSTRAINT chk_insurance_requires_anerkennung CHECK (
    insurance_enabled = FALSE
    OR (status = 'ANERKANNT' AND approval_document IS NOT NULL)
  ),
  -- Jedes abhängige Kassenmodul setzt den Hauptschalter voraus.
  CONSTRAINT chk_kassenmodule_require_insurance CHECK (
    insurance_enabled = TRUE
    OR (
      kassentarife_enabled   = FALSE AND
      budgetpruefung_enabled = FALSE AND
      kassenrechnung_enabled = FALSE AND
      elnw_enabled           = FALSE AND
      dakota_export_enabled  = FALSE
    )
  ),
  -- Ein abgelehntes Land darf keine Kassenabrechnung führen.
  CONSTRAINT chk_abgelehnt_keine_kasse CHECK (
    status <> 'ABGELEHNT' OR insurance_enabled = FALSE
  )
);

COMMENT ON TABLE public.state_settings IS
  'Freischaltungs-Matrix je Organisation und Bundesland. EINZIGE Wahrheit darueber, '
  'welche Module in welchem Bundesland aktiv sind. Ersetzt jedes Hessen-Hardcoding. '
  'insurance_enabled ist per CHECK an status=ANERKANNT + hinterlegten Bescheid gebunden.';

COMMENT ON COLUMN public.state_settings.status IS
  'VORBEREITUNG | ANTRAG_EINGEREICHT | IN_PRUEFUNG | ANERKANNT | ABGELEHNT';
COMMENT ON COLUMN public.state_settings.private_enabled IS
  'Privatleistungen (ohne Kasse) — von der §45a-Anerkennung unabhaengig.';
COMMENT ON COLUMN public.state_settings.insurance_enabled IS
  'Hauptschalter Kassenabrechnung. Nur via activate_insurance_billing() setzbar.';
COMMENT ON COLUMN public.state_settings.approval_document IS
  'Storage-Pfad oder Aktenzeichen des Anerkennungsbescheids. Pflicht fuer insurance_enabled.';
COMMENT ON COLUMN public.state_settings.effective_date IS
  'GO-Live-Datum des Bundeslands (geplant, bzw. tatsaechlich nach Freischaltung).';

CREATE INDEX IF NOT EXISTS idx_state_settings_org
  ON public.state_settings (organization_id);
CREATE INDEX IF NOT EXISTS idx_state_settings_land
  ON public.state_settings (bundesland);
CREATE INDEX IF NOT EXISTS idx_state_settings_lookup
  ON public.state_settings (organization_id, bundesland)
  INCLUDE (insurance_enabled, private_enabled, registration_enabled,
           waitinglist_enabled, marketing_enabled, status);

DROP TRIGGER IF EXISTS trg_state_settings_updated_at ON public.state_settings;
CREATE TRIGGER trg_state_settings_updated_at
  BEFORE UPDATE ON public.state_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ────────────────────────────────────────────────────────────────────────────
-- 2. state_settings_audit — revisionssichere Historie jeder Änderung
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.state_settings_audit (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  bundesland      TEXT NOT NULL,
  action          TEXT NOT NULL,          -- created | updated | insurance_activated | insurance_deactivated | status_changed
  previous_state  JSONB,
  new_state       JSONB,
  actor_id        UUID,
  begruendung     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  checksum        TEXT NOT NULL
);

COMMENT ON TABLE public.state_settings_audit IS
  'Revisionssichere Historie aller Aenderungen an state_settings. '
  'Nachweis gegenueber Pflegekassen und Landesbehoerden, wann welches Modul '
  'in welchem Bundesland aktiv war. Append-only.';

CREATE INDEX IF NOT EXISTS idx_state_audit_org_land
  ON public.state_settings_audit (organization_id, bundesland, created_at DESC);

-- Append-only erzwingen: kein UPDATE, kein DELETE
CREATE OR REPLACE FUNCTION public.state_audit_append_only()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $fn$
BEGIN
  RAISE EXCEPTION 'state_settings_audit ist append-only (% nicht erlaubt)', TG_OP;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_state_audit_no_update ON public.state_settings_audit;
CREATE TRIGGER trg_state_audit_no_update
  BEFORE UPDATE OR DELETE ON public.state_settings_audit
  FOR EACH ROW EXECUTE FUNCTION public.state_audit_append_only();

-- ────────────────────────────────────────────────────────────────────────────
-- 3. state_waitlist — Warteliste für noch nicht freigeschaltete Bundesländer
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.state_waitlist (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
                    REFERENCES public.organizations(id) ON DELETE CASCADE,
  bundesland      TEXT NOT NULL REFERENCES public.bundeslaender(code),
  plz             TEXT CHECK (plz IS NULL OR plz ~ '^[0-9]{5}$'),
  ort             TEXT,
  name            TEXT,
  email           TEXT NOT NULL,
  telefon         TEXT,
  interesse       TEXT NOT NULL DEFAULT 'kasse'
                    CHECK (interesse IN ('kasse', 'privat', 'beides', 'mitarbeit')),
  benachrichtigen BOOLEAN NOT NULL DEFAULT TRUE,
  quelle          TEXT,                   -- web | native | landingpage | admin
  user_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notified_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_waitlist_org_land_email UNIQUE (organization_id, bundesland, email)
);

COMMENT ON TABLE public.state_waitlist IS
  'Warteliste fuer Bundeslaender ohne Kassen-Freischaltung. Wird bei Aktivierung '
  'via activate_insurance_billing() als Benachrichtigungsbasis genutzt.';

CREATE INDEX IF NOT EXISTS idx_waitlist_land_pending
  ON public.state_waitlist (organization_id, bundesland)
  WHERE notified_at IS NULL;

DROP TRIGGER IF EXISTS trg_state_waitlist_updated_at ON public.state_waitlist;
CREATE TRIGGER trg_state_waitlist_updated_at
  BEFORE UPDATE ON public.state_waitlist
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ────────────────────────────────────────────────────────────────────────────
-- 4. Seed: alle 16 Bundesländer für JEDE bestehende Organisation
--    Default: Werbung + Registrierung + Warteliste an, Privat/Kasse aus.
--    Hessen der Stamm-Org: Antrag eingereicht, Privatleistungen aktiv.
-- ────────────────────────────────────────────────────────────────────────────
INSERT INTO public.state_settings (organization_id, bundesland, notes)
SELECT o.id, b.code,
       'Automatisch angelegt bei Einführung der Deutschland-Architektur (2026-08-08).'
  FROM public.organizations o
 CROSS JOIN public.bundeslaender b
ON CONFLICT (organization_id, bundesland) DO NOTHING;

-- Hessen (Stamm-Org): Ist-Stand 08.08.2026 — Antrag eingereicht, kein Bescheid.
-- Werbung ✓ Registrierung ✓ Warteliste ✓ Privatleistungen ✓ Kassenabrechnung ✗
UPDATE public.state_settings
   SET status               = 'ANTRAG_EINGEREICHT',
       marketing_enabled    = TRUE,
       registration_enabled = TRUE,
       waitinglist_enabled  = TRUE,
       private_enabled      = TRUE,
       insurance_enabled    = FALSE,
       rechtsgrundlage_land = 'PfluV Hessen',
       approval_authority   = 'Zuständige Landesbehörde Hessen (§45a SGB XI)',
       notes                = 'Anerkennungsverfahren §45a SGB XI läuft. '
                              'Anerkennungsbescheid liegt am 08.08.2026 NICHT vor. '
                              'Privatleistungen laufen unabhängig weiter. '
                              'Kassenabrechnung wird nach Bescheid per Ein-Klick freigeschaltet.'
 WHERE bundesland = 'hessen'
   AND organization_id = '00000000-0000-4000-8000-000460629986';

-- Bundesländer mit laufender Antragsvorbereitung (Unterlagen im Repo vorhanden):
-- Bayern, NRW, Rheinland-Pfalz, Saarland → Werbung/Registrierung/Warteliste an.
UPDATE public.state_settings
   SET notes = 'Antragsunterlagen in Vorbereitung. Werbung, Registrierung und '
               'Warteliste sind aktiv; Kassenabrechnung erst nach Anerkennung.'
 WHERE bundesland IN ('bayern', 'nordrhein_westfalen', 'rheinland_pfalz', 'saarland')
   AND organization_id = '00000000-0000-4000-8000-000460629986';

-- ────────────────────────────────────────────────────────────────────────────
-- 5. Audit-Helper
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.log_state_settings_change(
  p_org_id      UUID,
  p_bundesland  TEXT,
  p_action      TEXT,
  p_previous    JSONB,
  p_new         JSONB,
  p_actor_id    UUID,
  p_begruendung TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_id  UUID;
  v_now TIMESTAMPTZ := now();
BEGIN
  INSERT INTO public.state_settings_audit (
    organization_id, bundesland, action,
    previous_state, new_state, actor_id, begruendung, created_at, checksum
  ) VALUES (
    p_org_id, p_bundesland, p_action,
    p_previous, p_new, p_actor_id, p_begruendung, v_now,
    encode(
      extensions.digest(
        (p_org_id::TEXT || p_bundesland || p_action
          || COALESCE(p_previous::TEXT, '') || COALESCE(p_new::TEXT, '')
          || COALESCE(p_actor_id::TEXT, '') || v_now::TEXT)::bytea,
        'sha256'
      ),
      'hex'
    )
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$fn$;

COMMENT ON FUNCTION public.log_state_settings_change IS
  'Schreibt einen revisionssicheren Audit-Eintrag (SHA-256-Checksumme) fuer state_settings.';

-- ────────────────────────────────────────────────────────────────────────────
-- 6. RPC: Ein-Klick-Freischaltung der Kassenabrechnung
--
--    EIN Aufruf schaltet in einer Transaktion frei:
--      • Status → ANERKANNT
--      • Kassenabrechnung (Hauptschalter)
--      • Kassentarife
--      • Budgetprüfung
--      • Kassenrechnungen
--      • Digitale Leistungsnachweise
--      • Dakota-Export
--    plus Audit-Eintrag. Kein weiterer Programmieraufwand.
-- ────────────────────────────────────────────────────────────────────────────
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
  v_after    JSONB;
  v_row      public.state_settings%ROWTYPE;
  v_waitlist INTEGER := 0;
  v_today    DATE := CURRENT_DATE;
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

  v_before := to_jsonb(v_row);

  -- ═══ Kaskade: EIN Klick, alle Kassenmodule ═══
  UPDATE public.state_settings
     SET status                 = 'ANERKANNT',
         insurance_enabled      = TRUE,
         kassentarife_enabled   = TRUE,
         budgetpruefung_enabled = TRUE,
         kassenrechnung_enabled = TRUE,
         elnw_enabled           = TRUE,
         dakota_export_enabled  = TRUE,
         -- Privatleistungen laufen ohnehin weiter; bei Freischaltung sicherstellen.
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

  -- ═══ Wartelisten-Kandidaten zählen (Versand übernimmt die Anwendung) ═══
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
  );

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
  'Ein-Klick-Freischaltung der Kassenabrechnung fuer ein Bundesland. Setzt Status ANERKANNT '
  'und alle fuenf abhaengigen Kassenmodule in einer Transaktion. Verlangt zwingend einen '
  'hinterlegten Anerkennungsbescheid. SECURITY DEFINER, nur service_role.';

-- ────────────────────────────────────────────────────────────────────────────
-- 7. RPC: Kassenabrechnung wieder abschalten (Widerruf / Fehleingabe)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.deactivate_insurance_billing(
  p_org_id      UUID,
  p_bundesland  TEXT,
  p_actor_id    UUID,
  p_begruendung TEXT,
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
    RETURN FALSE;   -- war bereits aus
  END IF;

  v_before := to_jsonb(v_row);

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

  RETURN TRUE;
END;
$fn$;

COMMENT ON FUNCTION public.deactivate_insurance_billing IS
  'Schaltet die Kassenabrechnung eines Bundeslands ab (Widerruf/Korrektur) und setzt alle '
  'abhaengigen Module zurueck. Begruendung ist Pflicht, Audit-Eintrag wird geschrieben.';

-- ────────────────────────────────────────────────────────────────────────────
-- 8. RPC: einzelne Schalter setzen (Werbung/Registrierung/Warteliste/Privat)
--    Kassenmodule sind hier BEWUSST nicht änderbar — dafür gibt es Punkt 6/7.
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
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'actor_id darf nicht NULL sein';
  END IF;
  IF p_status IS NOT NULL
     AND p_status NOT IN ('VORBEREITUNG','ANTRAG_EINGEREICHT','IN_PRUEFUNG','ANERKANNT','ABGELEHNT') THEN
    RAISE EXCEPTION 'Ungueltiger Status: %', p_status;
  END IF;

  SELECT * INTO v_row
    FROM public.state_settings
   WHERE organization_id = p_org_id AND bundesland = p_bundesland
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Keine state_settings-Zeile fuer % / %', p_org_id, p_bundesland;
  END IF;

  -- Status ANERKANNT ist NUR ueber activate_insurance_billing() erreichbar,
  -- damit Bescheid-Pflicht und Modul-Kaskade nicht umgangen werden koennen.
  IF p_status = 'ANERKANNT' AND v_row.status <> 'ANERKANNT' THEN
    RAISE EXCEPTION 'Status ANERKANNT wird ausschliesslich ueber activate_insurance_billing() gesetzt.';
  END IF;

  v_before := to_jsonb(v_row);

  UPDATE public.state_settings
     SET status                  = COALESCE(p_status, status),
         marketing_enabled       = COALESCE(p_marketing_enabled, marketing_enabled),
         registration_enabled    = COALESCE(p_registration_enabled, registration_enabled),
         waitinglist_enabled     = COALESCE(p_waitinglist_enabled, waitinglist_enabled),
         private_enabled         = COALESCE(p_private_enabled, private_enabled),
         effective_date          = COALESCE(p_effective_date, effective_date),
         antrag_eingereicht_am   = COALESCE(p_antrag_eingereicht_am, antrag_eingereicht_am),
         approval_document       = COALESCE(p_approval_document, approval_document),
         approval_reference      = COALESCE(p_approval_reference, approval_reference),
         approval_authority      = COALESCE(p_approval_authority, approval_authority),
         rechtsgrundlage_land    = COALESCE(p_rechtsgrundlage_land, rechtsgrundlage_land),
         ansprechpartner_name    = COALESCE(p_ansprechpartner_name, ansprechpartner_name),
         ansprechpartner_email   = COALESCE(p_ansprechpartner_email, ansprechpartner_email),
         ansprechpartner_telefon = COALESCE(p_ansprechpartner_telefon, ansprechpartner_telefon),
         notes                   = COALESCE(p_notes, notes),
         updated_at              = now()
   WHERE id = v_row.id
   RETURNING * INTO v_row;

  PERFORM public.log_state_settings_change(
    p_org_id, p_bundesland,
    CASE WHEN p_status IS NOT NULL AND p_status <> (v_before->>'status')
         THEN 'status_changed' ELSE 'updated' END,
    v_before, to_jsonb(v_row), p_actor_id, NULL
  );

  RETURN v_row;
END;
$fn$;

-- Signatur explizit: ein spaeterer Migrationsschritt legt eine Ueberladung mit
-- zusaetzlichem p_felder_leeren an. Bei einem Wiederholungslauf dieser Datei
-- waere COMMENT ON FUNCTION ohne Argumentliste sonst mehrdeutig
-- ("function name is not unique") und die Migration braeche ab.
COMMENT ON FUNCTION public.update_state_settings(
  UUID, TEXT, UUID, TEXT, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, DATE, DATE,
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) IS
  'Setzt die von der Anerkennung UNABHAENGIGEN Schalter sowie Stammdaten eines Bundeslands. '
  'Kassenmodule und Status ANERKANNT sind hier bewusst gesperrt.';

-- ────────────────────────────────────────────────────────────────────────────
-- 9. Lese-Helper für andere Module (STABLE, für Trigger/Policies nutzbar)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.state_flag(
  p_org_id     UUID,
  p_bundesland TEXT,
  p_flag       TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_row public.state_settings%ROWTYPE;
BEGIN
  IF p_org_id IS NULL OR p_bundesland IS NULL THEN
    RETURN FALSE;   -- fail-safe: unbekannt ⇒ nicht erlaubt
  END IF;

  SELECT * INTO v_row
    FROM public.state_settings
   WHERE organization_id = p_org_id
     AND bundesland = LOWER(p_bundesland);

  IF NOT FOUND THEN
    RETURN FALSE;   -- fail-safe
  END IF;

  RETURN CASE p_flag
    WHEN 'marketing'      THEN v_row.marketing_enabled
    WHEN 'registration'   THEN v_row.registration_enabled
    WHEN 'waitinglist'    THEN v_row.waitinglist_enabled
    WHEN 'private'        THEN v_row.private_enabled
    WHEN 'insurance'      THEN v_row.insurance_enabled
    WHEN 'kassentarife'   THEN v_row.kassentarife_enabled
    WHEN 'budgetpruefung' THEN v_row.budgetpruefung_enabled
    WHEN 'kassenrechnung' THEN v_row.kassenrechnung_enabled
    WHEN 'elnw'           THEN v_row.elnw_enabled
    WHEN 'dakota_export'  THEN v_row.dakota_export_enabled
    ELSE FALSE
  END;
END;
$fn$;

COMMENT ON FUNCTION public.state_flag IS
  'Fail-safe Lesezugriff auf einen Modulschalter. Unbekannte Org/Bundesland/Flag ⇒ FALSE.';

-- ────────────────────────────────────────────────────────────────────────────
-- 10. Öffentliche Sicht: nur die Schalter, keine internen Felder
--     (Kundenapp/Native lesen hierüber — ohne Bescheid-Pfade und Notizen)
-- ────────────────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.state_settings_public;
CREATE VIEW public.state_settings_public
WITH (security_invoker = false) AS
SELECT
  s.organization_id,
  s.bundesland,
  b.bezeichnung        AS bundesland_label,
  s.status,
  s.marketing_enabled,
  s.registration_enabled,
  s.waitinglist_enabled,
  s.private_enabled,
  s.insurance_enabled,
  s.effective_date,
  s.ansprechpartner_name,
  s.ansprechpartner_email,
  s.ansprechpartner_telefon
FROM public.state_settings s
JOIN public.bundeslaender b ON b.code = s.bundesland;

COMMENT ON VIEW public.state_settings_public IS
  'Oeffentlich lesbare Teilmenge von state_settings fuer Kunden-Web und Native-App. '
  'Enthaelt KEINE Bescheid-Pfade, Aktenzeichen oder internen Notizen.';

-- ────────────────────────────────────────────────────────────────────────────
-- 11. RLS
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.state_settings       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.state_settings_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.state_waitlist       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bundeslaender        ENABLE ROW LEVEL SECURITY;

-- Bundesland-Katalog: für alle lesbar, nur Service-Role schreibt
DROP POLICY IF EXISTS bundeslaender_read ON public.bundeslaender;
CREATE POLICY bundeslaender_read ON public.bundeslaender
  FOR SELECT TO anon, authenticated USING (TRUE);

-- state_settings: nur Admins der eigenen Org (Kundenzugriff läuft über die View)
DROP POLICY IF EXISTS state_settings_admin_all ON public.state_settings;
CREATE POLICY state_settings_admin_all ON public.state_settings
  FOR ALL TO authenticated
  USING (public.is_admin() AND organization_id = public.current_org_id())
  WITH CHECK (public.is_admin() AND organization_id = public.current_org_id());

-- Audit: nur lesen, nur Admins der eigenen Org
DROP POLICY IF EXISTS state_audit_admin_read ON public.state_settings_audit;
CREATE POLICY state_audit_admin_read ON public.state_settings_audit
  FOR SELECT TO authenticated
  USING (public.is_admin() AND organization_id = public.current_org_id());

-- Warteliste: Eintragen darf jeder (auch anonym, Lead-Erfassung),
-- Lesen/Ändern nur Admins der eigenen Org.
DROP POLICY IF EXISTS state_waitlist_insert ON public.state_waitlist;
CREATE POLICY state_waitlist_insert ON public.state_waitlist
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    email IS NOT NULL
    AND public.state_flag(organization_id, bundesland, 'waitinglist') = TRUE
  );

DROP POLICY IF EXISTS state_waitlist_admin_read ON public.state_waitlist;
CREATE POLICY state_waitlist_admin_read ON public.state_waitlist
  FOR SELECT TO authenticated
  USING (
    (public.is_admin() AND organization_id = public.current_org_id())
    OR user_id = auth.uid()
  );

DROP POLICY IF EXISTS state_waitlist_admin_write ON public.state_waitlist;
CREATE POLICY state_waitlist_admin_write ON public.state_waitlist
  FOR UPDATE TO authenticated
  USING (public.is_admin() AND organization_id = public.current_org_id())
  WITH CHECK (public.is_admin() AND organization_id = public.current_org_id());

DROP POLICY IF EXISTS state_waitlist_admin_delete ON public.state_waitlist;
CREATE POLICY state_waitlist_admin_delete ON public.state_waitlist
  FOR DELETE TO authenticated
  USING (public.is_admin() AND organization_id = public.current_org_id());

-- ────────────────────────────────────────────────────────────────────────────
-- 12. Berechtigungen
-- ────────────────────────────────────────────────────────────────────────────
GRANT SELECT ON public.bundeslaender          TO anon, authenticated;
GRANT SELECT ON public.state_settings_public  TO anon, authenticated;
GRANT SELECT ON public.state_settings         TO authenticated;
GRANT SELECT ON public.state_settings_audit   TO authenticated;
GRANT INSERT, SELECT ON public.state_waitlist TO anon, authenticated;
GRANT UPDATE, DELETE ON public.state_waitlist TO authenticated;

-- Schreibende RPCs: ausschliesslich service_role (API-Routen pruefen die Rolle)
REVOKE ALL ON FUNCTION public.activate_insurance_billing(UUID, TEXT, UUID, TEXT, TEXT, TEXT, DATE, DATE)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.deactivate_insurance_billing(UUID, TEXT, UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_state_settings(
  UUID, TEXT, UUID, TEXT, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, DATE, DATE,
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.log_state_settings_change(UUID, TEXT, TEXT, JSONB, JSONB, UUID, TEXT)
  FROM PUBLIC, anon, authenticated;

-- state_flag wird in RLS-Policies (Warteliste) ausgewertet ⇒ auch anon braucht EXECUTE.
GRANT EXECUTE ON FUNCTION public.state_flag(UUID, TEXT, TEXT) TO anon, authenticated, service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 13. Initialer Audit-Eintrag für den Ist-Stand
-- ────────────────────────────────────────────────────────────────────────────
INSERT INTO public.state_settings_audit (
  organization_id, bundesland, action, previous_state, new_state,
  actor_id, begruendung, checksum
)
SELECT s.organization_id, s.bundesland, 'created', NULL, to_jsonb(s),
       NULL,
       'Initialer Stand bei Einfuehrung der Deutschland-Architektur (Migration 20260808100000).',
       encode(extensions.digest(
         (s.organization_id::TEXT || s.bundesland || 'created' || s.id::TEXT)::bytea, 'sha256'), 'hex')
  FROM public.state_settings s
 WHERE NOT EXISTS (
   SELECT 1 FROM public.state_settings_audit a
    WHERE a.organization_id = s.organization_id
      AND a.bundesland = s.bundesland
 );

-- ────────────────────────────────────────────────────────────────────────────
-- 14. Neue Organisationen bekommen automatisch alle 16 Bundesländer
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.seed_state_settings_for_org()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  INSERT INTO public.state_settings (organization_id, bundesland, notes)
  SELECT NEW.id, b.code, 'Automatisch angelegt beim Anlegen der Organisation.'
    FROM public.bundeslaender b
  ON CONFLICT (organization_id, bundesland) DO NOTHING;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_seed_state_settings ON public.organizations;
CREATE TRIGGER trg_seed_state_settings
  AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.seed_state_settings_for_org();

COMMENT ON FUNCTION public.seed_state_settings_for_org IS
  'Legt fuer jede neue Organisation alle 16 Bundeslaender in state_settings an '
  '(Default: Werbung/Registrierung/Warteliste an, Privat/Kasse aus).';
