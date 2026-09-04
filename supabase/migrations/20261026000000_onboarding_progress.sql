-- ═══════════════════════════════════════════════════════════════════════
-- Onboarding: Fortschritt je Person und Ablauf (onboarding_progress)
-- ═══════════════════════════════════════════════════════════════════════
--
-- AUSGANGSLAGE
-- Onboarding-Fortschritt war bisher EIN Boolean: profiles.onboarding_completed
-- (20260412000100). Damit laesst sich genau eine Frage beantworten — „schon
-- durch, ja/nein" — und keine der Fragen, auf die es im Betrieb ankommt:
--
--   * Wo ist jemand stehengeblieben, und was fehlt ihm noch?
--   * Welche Unterlagen sind angekommen, welche nicht?
--   * Wann wurde zuletzt automatisch erinnert (und wurde ueberhaupt)?
--
-- Ohne diese Angaben kann ein Ablauf nicht fortgesetzt, nicht erinnert und
-- nicht ausgewertet werden. Wer abbricht, verschwindet lautlos.
--
-- ── ABGRENZUNG: DREI DINGE HEISSEN HIER „ONBOARDING" ────────────────────
-- Das Wort ist im Bestand bereits doppelt vergeben. Diese Tabelle ist das
-- DRITTE und meint ausschliesslich den Ablauf einer PERSON:
--
--   app/onboarding/page.tsx        Mandanten-Einrichtung (Organisation,
--                                  IK-Nummer, ITSG-Zertifikat) — B2B, ein
--                                  Pflegedienst wird Mandant. NICHT hier.
--   components/OnboardingFlow.tsx  Begruessungs-Overlay in /kunde/home,
--                                  gesteuert von profiles.onboarding_completed.
--                                  Bleibt unveraendert bestehen.
--   onboarding_progress            DIESE Tabelle: der mehrstufige Ablauf
--                                  eines Bewerbers, einer Kundin oder
--                                  angehoeriger Personen.
--
-- profiles.onboarding_completed wird NICHT abgeloest und nicht angefasst.
-- Es beantwortet weiterhin „Overlay zeigen?"; diese Tabelle beantwortet
-- „wie weit ist der Ablauf?". Zwei Fragen, zwei Orte — ein gemeinsamer
-- waere in beiden Rollen halb falsch.
--
-- ── WARUM organization_id, obwohl user_id reicht ───────────────────────
-- Jede Tabelle dieses Schemas traegt die Mandantengrenze selbst; der
-- RESTRICTIVE org_fence unten haengt daran. profiles hat KEINE
-- organization_id (bekannte Falle) — die Spalte laesst sich hier also
-- nicht per Join ableiten und muss vom Aufrufer gesetzt werden.
-- lib/onboarding/service.ts holt sie ueber getActiveOrgId().
--
-- ── EIN ABLAUF JE PERSON UND ART ───────────────────────────────────────
-- UNIQUE (user_id, typ). Dieselbe Person kann Kundin sein und spaeter als
-- Angehoerige hinzukommen — das sind zwei Ablaeufe. Zweimal derselbe
-- Ablauf ist dagegen immer ein Fehler: der zweite wuesste nichts vom
-- ersten, und die Erinnerung liefe doppelt.
--
-- ── FORTSCHRITT IST ABGELEITET, ABER NICHT BERECHENBAR ─────────────────
-- schritte_daten traegt je Schritt {status, daten, zeitpunkt}. Der Inhalt
-- ist bewusst jsonb und nicht normalisiert: die Schrittfolge unterscheidet
-- sich je Ablaufart und wird sich aendern, waehrend Ablaeufe laufen. Eine
-- Spalte je Schritt waere nach der ersten Aenderung eine Migration pro
-- Formularfeld.
--
-- Rollback: 20261026000001_rollback_onboarding_progress.sql
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS public.onboarding_progress (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  organization_id       uuid NOT NULL REFERENCES public.organizations(id),

  -- Welcher Ablauf. Geschlossene Liste, damit kein Tippfehler einen
  -- vierten Ablauf erfindet, den keine Auswertung kennt.
  typ                   text NOT NULL
    CHECK (typ IN ('bewerber', 'kunde', 'angehoerige')),

  aktueller_schritt     integer NOT NULL DEFAULT 1 CHECK (aktueller_schritt >= 1),
  gesamt_schritte       integer NOT NULL CHECK (gesamt_schritte >= 1),
  -- Der aktuelle Schritt darf die Folge nicht verlassen. Ohne diesen
  -- CHECK sieht ein Fortschrittsbalken „7 von 5" und niemand merkt, dass
  -- die Schrittfolge unter dem laufenden Ablauf gekuerzt wurde.
  CONSTRAINT onboarding_progress_schritt_in_folge
    CHECK (aktueller_schritt <= gesamt_schritte),

  -- Je Schritt: { "1": { "status": "…", "daten": {…}, "zeitpunkt": "…" } }
  schritte_daten        jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT onboarding_progress_schritte_objekt
    CHECK (jsonb_typeof(schritte_daten) = 'object'),

  -- Was die Person noch nachreichen muss. Klartext-Schluessel, keine IDs:
  -- die Liste wird der Person angezeigt und von der Erinnerung zitiert.
  fehlende_angaben      text[] NOT NULL DEFAULT '{}'::text[],

  -- Je Unterlage: { "fuehrungszeugnis": { "status": "…", "zeitpunkt": "…" } }
  dokument_status       jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT onboarding_progress_dokumente_objekt
    CHECK (jsonb_typeof(dokument_status) = 'object'),

  -- Zeitpunkt der letzten AUTOMATISCHEN Nachricht. Der Erinnerungslauf
  -- (drip/workflow-engine) liest genau diese Spalte, um nicht taeglich
  -- dieselbe Person anzuschreiben. NULL = noch nie erinnert.
  letzte_auto_nachricht timestamptz,

  -- Wo jemand zuletzt aufgehoert hat, als Klartext-Marke (z. B.
  -- 'schritt_3_dokumente'). Bewusst NICHT nur aktueller_schritt: der
  -- sagt, wo die Person steht, nicht, wo sie ABGESPRUNGEN ist — und die
  -- Absprungstelle ist das, was man auswerten will.
  abbruchstelle         text,

  -- Gesetzt heisst: durch. Ein eigener Zeitpunkt statt eines Booleans,
  -- damit „wie lange dauert ein Onboarding" ueberhaupt beantwortbar ist.
  abgeschlossen_am      timestamptz,

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_onboarding_progress_user_typ UNIQUE (user_id, typ)
);

-- ── Indizes ─────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_onboarding_progress_org_typ
  ON public.onboarding_progress(organization_id, typ, aktueller_schritt);

-- Der Erinnerungslauf sucht genau eine Menge: offene Ablaeufe, sortiert
-- danach, wann zuletzt erinnert wurde. Teilindex, weil abgeschlossene
-- Ablaeufe ihn nur aufblaehen wuerden.
CREATE INDEX IF NOT EXISTS idx_onboarding_progress_offen
  ON public.onboarding_progress(organization_id, letzte_auto_nachricht NULLS FIRST)
  WHERE abgeschlossen_am IS NULL;

-- ── updated_at ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_onboarding_progress_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $fn$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_onboarding_progress_updated_at ON public.onboarding_progress;
CREATE TRIGGER trg_onboarding_progress_updated_at
  BEFORE UPDATE ON public.onboarding_progress
  FOR EACH ROW EXECUTE FUNCTION public.trg_onboarding_progress_updated_at();

-- ── RLS ─────────────────────────────────────────────────────────────
ALTER TABLE public.onboarding_progress ENABLE ROW LEVEL SECURITY;

-- Die eigene Zeile. auth.uid() steht hier bewusst in der POLICY und
-- nirgends als Spaltenwert: unter dem Dienstschluessel ist auth.uid()
-- NULL, ein Trigger mit NOT-NULL-Ziel wuerde den Schreibweg brechen
-- (bekannte Falle aus der Zeiterfassung). Als Policy-Bedingung ist NULL
-- unproblematisch — service_role umgeht RLS ohnehin.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'onboarding_progress' AND policyname = 'onboarding_progress_eigene'
  ) THEN
    CREATE POLICY onboarding_progress_eigene
      ON public.onboarding_progress
      FOR ALL
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END;
$$;

-- Administration sieht alles — innerhalb ihres Mandanten (org_fence unten).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'onboarding_progress' AND policyname = 'onboarding_progress_admin'
  ) THEN
    CREATE POLICY onboarding_progress_admin
      ON public.onboarding_progress
      FOR ALL USING (public.is_admin());
  END IF;
END;
$$;

-- Mandantengrenze ZUSAETZLICH als RESTRICTIVE Policy. Permissive Policies
-- sind ODER-verknuepft: waere der org_fence permissiv, machte ihn die
-- Admin-Policy wirkungslos.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'onboarding_progress' AND policyname = 'org_fence_onboarding_progress'
  ) THEN
    CREATE POLICY org_fence_onboarding_progress
      ON public.onboarding_progress
      AS RESTRICTIVE
      FOR ALL
      USING (organization_id = current_org_id());
  END IF;
END;
$$;

REVOKE ALL ON TABLE public.onboarding_progress FROM anon;

COMMENT ON TABLE public.onboarding_progress IS
  'Mehrstufiger Onboarding-Ablauf je Person (bewerber/kunde/angehoerige). '
  'NICHT zu verwechseln mit profiles.onboarding_completed (Begruessungs-Overlay) '
  'und app/onboarding (Mandanten-Einrichtung).';
COMMENT ON COLUMN public.onboarding_progress.abbruchstelle IS
  'Wo zuletzt abgesprungen wurde — nicht wo die Person steht. Fuer die Auswertung, '
  'welcher Schritt Menschen verliert.';
COMMENT ON COLUMN public.onboarding_progress.letzte_auto_nachricht IS
  'Letzte AUTOMATISCHE Erinnerung. Der Erinnerungslauf filtert darauf; NULL = nie erinnert.';

COMMIT;
