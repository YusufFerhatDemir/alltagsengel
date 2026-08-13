-- ═══════════════════════════════════════════════════════════════
-- Übergabeprotokolle (Schichtübergabe)
--
-- Fachliche Lücke: Informationen zwischen Diensten wurden bisher nur
-- als freier pflege_verlauf-Eintrag vom Typ 'uebergabe' erfasst — pro
-- Klient, ohne Schichtbezug und ohne Nachweis, WER die Information
-- tatsächlich zur Kenntnis genommen hat. Der MD prüft genau das
-- (Informationsweitergabe / § 113 SGB XI).
--
-- Drei Tabellen:
--   uebergabe_protokolle    — Kopf je Datum + Schicht (+ optional Tour)
--   uebergabe_punkte        — einzelne Übergabepunkte, optional klientenbezogen
--   uebergabe_kenntnisnahmen— Quittung des übernehmenden Dienstes
--
-- Fail-closed: Ein abgeschlossenes Protokoll ist unveränderlich.
-- Spätere Informationen sind nur noch als Nachtrag möglich (nachtrag=true),
-- der Abschluss ist monoton vorwärts (kein Zurück auf 'offen').
-- ═══════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Protokoll-Kopf ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.uebergabe_protokolle (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  -- Default wie in der Pflegedoku: schreibt eine Betreuungskraft mit ihrem
  -- eigenen Client, setzt current_org_id() die Organisation — die
  -- RESTRICTIVE Org-Fence-Policy prüft denselben Wert.
  organization_id  uuid NOT NULL DEFAULT current_org_id() REFERENCES public.organizations(id),
  datum            date NOT NULL,
  schicht          text NOT NULL
                   CHECK (schicht IN ('frueh','spaet','nacht','wochenende','bereitschaft','sonstige')),
  -- Optionaler Tourbezug: ein Dienst kann je Tour übergeben statt global.
  tour_id          uuid REFERENCES public.tours(id) ON DELETE SET NULL,
  status           text NOT NULL DEFAULT 'offen'
                   CHECK (status IN ('offen','abgeschlossen')),
  uebergeber_id    uuid REFERENCES auth.users(id),
  uebergeber_name  text NOT NULL,
  -- Vorgesehene Empfänger (Betreuungskräfte des Folgedienstes). Der
  -- tatsächliche Nachweis steht in uebergabe_kenntnisnahmen.
  uebernehmer_caregiver_ids uuid[] NOT NULL DEFAULT '{}',
  zusammenfassung  text,
  abgeschlossen_am timestamptz,
  abgeschlossen_von uuid REFERENCES auth.users(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uebergabe_abschluss_konsistenz CHECK (
    (status = 'abgeschlossen' AND abgeschlossen_am IS NOT NULL)
    OR (status = 'offen' AND abgeschlossen_am IS NULL)
  )
);

-- Je Organisation, Datum und Schicht genau ein Protokoll — pro Tour
-- zusätzlich eines. COALESCE, weil NULL in UNIQUE nicht greift.
CREATE UNIQUE INDEX IF NOT EXISTS uq_uebergabe_protokoll_slot
  ON public.uebergabe_protokolle(
    organization_id, datum, schicht,
    COALESCE(tour_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

CREATE INDEX IF NOT EXISTS idx_uebergabe_protokolle_org_datum
  ON public.uebergabe_protokolle(organization_id, datum DESC);
CREATE INDEX IF NOT EXISTS idx_uebergabe_protokolle_offen
  ON public.uebergabe_protokolle(organization_id, datum DESC) WHERE status = 'offen';

-- ── 2. Übergabepunkte ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.uebergabe_punkte (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  protokoll_id     uuid NOT NULL REFERENCES public.uebergabe_protokolle(id) ON DELETE CASCADE,
  organization_id  uuid NOT NULL DEFAULT current_org_id() REFERENCES public.organizations(id),
  -- NULL = organisatorischer Punkt ohne Klientenbezug (Fahrzeug, Schlüssel, Dienstplan).
  client_id        uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  kategorie        text NOT NULL DEFAULT 'sonstiges'
                   CHECK (kategorie IN (
                     'zustandsaenderung','medikation','wunde','vitalwerte','sturz',
                     'arztkontakt','angehoerige','hilfsmittel','termin','organisation','sonstiges'
                   )),
  dringlichkeit    text NOT NULL DEFAULT 'normal'
                   CHECK (dringlichkeit IN ('normal','hoch','kritisch')),
  inhalt           text NOT NULL CHECK (length(btrim(inhalt)) > 0),
  handlungsbedarf  boolean NOT NULL DEFAULT false,
  erledigt         boolean NOT NULL DEFAULT false,
  erledigt_am      timestamptz,
  erledigt_von     uuid REFERENCES auth.users(id),
  -- Herkunft: Punkte können aus bestehender Doku übernommen werden.
  quelle_typ       text CHECK (quelle_typ IS NULL OR quelle_typ IN (
                     'manuell','pflege_verlauf','vital_signs','wound_assessments',
                     'medikament_eingaben','ops_aufgabe'
                   )),
  quelle_id        uuid,
  -- Wenn aus einem Punkt eine verfolgbare Aufgabe erzeugt wurde.
  aufgabe_id       uuid REFERENCES public.ops_aufgaben(id) ON DELETE SET NULL,
  -- Nachtrag zu einem bereits abgeschlossenen Protokoll.
  nachtrag         boolean NOT NULL DEFAULT false,
  erstellt_von     uuid REFERENCES auth.users(id),
  erstellt_von_name text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uebergabe_punkt_erledigt_konsistenz CHECK (
    (erledigt AND erledigt_am IS NOT NULL) OR (NOT erledigt AND erledigt_am IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_uebergabe_punkte_protokoll
  ON public.uebergabe_punkte(protokoll_id);
CREATE INDEX IF NOT EXISTS idx_uebergabe_punkte_client
  ON public.uebergabe_punkte(client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_uebergabe_punkte_org
  ON public.uebergabe_punkte(organization_id);
CREATE INDEX IF NOT EXISTS idx_uebergabe_punkte_offen
  ON public.uebergabe_punkte(organization_id, protokoll_id)
  WHERE handlungsbedarf AND NOT erledigt;

-- ── 3. Kenntnisnahme (Quittung des Folgedienstes) ───────────────

CREATE TABLE IF NOT EXISTS public.uebergabe_kenntnisnahmen (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  protokoll_id     uuid NOT NULL REFERENCES public.uebergabe_protokolle(id) ON DELETE CASCADE,
  organization_id  uuid NOT NULL DEFAULT current_org_id() REFERENCES public.organizations(id),
  user_id          uuid NOT NULL REFERENCES auth.users(id),
  caregiver_id     uuid REFERENCES public.caregivers(id) ON DELETE SET NULL,
  name             text NOT NULL,
  rolle            text NOT NULL,
  zeitpunkt        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_uebergabe_kenntnisnahme UNIQUE (protokoll_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_uebergabe_kenntnisnahmen_protokoll
  ON public.uebergabe_kenntnisnahmen(protokoll_id);
CREATE INDEX IF NOT EXISTS idx_uebergabe_kenntnisnahmen_org
  ON public.uebergabe_kenntnisnahmen(organization_id);

-- ── 4. updated_at ───────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_updated_at_uebergabe_protokolle ON public.uebergabe_protokolle;
CREATE TRIGGER trg_updated_at_uebergabe_protokolle
  BEFORE UPDATE ON public.uebergabe_protokolle
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_updated_at_uebergabe_punkte ON public.uebergabe_punkte;
CREATE TRIGGER trg_updated_at_uebergabe_punkte
  BEFORE UPDATE ON public.uebergabe_punkte
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── 5. Fail-closed: Abschluss ist monoton vorwärts ──────────────

CREATE OR REPLACE FUNCTION public.uebergabe_protokoll_abschluss_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.status = 'abgeschlossen' THEN
    IF NEW.status <> 'abgeschlossen' THEN
      RAISE EXCEPTION 'Ein abgeschlossenes Übergabeprotokoll kann nicht wieder geöffnet werden.';
    END IF;
    -- Inhalt eines abgeschlossenen Protokolls bleibt unveränderlich.
    IF NEW.datum IS DISTINCT FROM OLD.datum
       OR NEW.schicht IS DISTINCT FROM OLD.schicht
       OR NEW.tour_id IS DISTINCT FROM OLD.tour_id
       OR NEW.zusammenfassung IS DISTINCT FROM OLD.zusammenfassung
       OR NEW.uebergeber_id IS DISTINCT FROM OLD.uebergeber_id
       OR NEW.uebergeber_name IS DISTINCT FROM OLD.uebergeber_name
       OR NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
      RAISE EXCEPTION 'Ein abgeschlossenes Übergabeprotokoll ist unveränderlich. Neue Informationen als Nachtrag erfassen.';
    END IF;
  END IF;

  -- Ein Protokoll ohne jeden Inhalt darf nicht abgeschlossen werden —
  -- sonst entsteht ein Nachweis, der nichts belegt.
  IF NEW.status = 'abgeschlossen' AND OLD.status = 'offen' THEN
    IF coalesce(btrim(NEW.zusammenfassung), '') = ''
       AND NOT EXISTS (SELECT 1 FROM public.uebergabe_punkte p WHERE p.protokoll_id = NEW.id) THEN
      RAISE EXCEPTION 'Abschluss nicht möglich: Das Protokoll enthält weder Übergabepunkte noch eine Zusammenfassung.';
    END IF;
    NEW.abgeschlossen_am := coalesce(NEW.abgeschlossen_am, now());
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_uebergabe_protokoll_abschluss ON public.uebergabe_protokolle;
CREATE TRIGGER trg_uebergabe_protokoll_abschluss
  BEFORE UPDATE ON public.uebergabe_protokolle
  FOR EACH ROW EXECUTE FUNCTION public.uebergabe_protokoll_abschluss_guard();

-- ── 6. Fail-closed: Punkte eines abgeschlossenen Protokolls ─────

CREATE OR REPLACE FUNCTION public.uebergabe_punkt_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  protokoll_status text;
  protokoll_org    uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT status INTO protokoll_status FROM public.uebergabe_protokolle WHERE id = OLD.protokoll_id;
    IF protokoll_status = 'abgeschlossen' THEN
      RAISE EXCEPTION 'Punkte eines abgeschlossenen Übergabeprotokolls können nicht gelöscht werden.';
    END IF;
    RETURN OLD;
  END IF;

  SELECT status, organization_id INTO protokoll_status, protokoll_org
    FROM public.uebergabe_protokolle WHERE id = NEW.protokoll_id;

  IF protokoll_status IS NULL THEN
    RAISE EXCEPTION 'Übergabeprotokoll % existiert nicht.', NEW.protokoll_id;
  END IF;

  -- Der Punkt gehört immer der Organisation des Protokolls — nie einer anderen.
  IF NEW.organization_id IS DISTINCT FROM protokoll_org THEN
    RAISE EXCEPTION 'Übergabepunkt und Protokoll gehören zu unterschiedlichen Organisationen.';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF protokoll_status = 'abgeschlossen' AND NOT NEW.nachtrag THEN
      RAISE EXCEPTION 'Das Protokoll ist abgeschlossen — neue Punkte sind nur als Nachtrag möglich.';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE: Nach Abschluss darf ausschliesslich die Erledigung nachgezogen
  -- werden. Der dokumentierte Inhalt bleibt so, wie er übergeben wurde.
  IF protokoll_status = 'abgeschlossen' THEN
    IF NEW.inhalt IS DISTINCT FROM OLD.inhalt
       OR NEW.kategorie IS DISTINCT FROM OLD.kategorie
       OR NEW.dringlichkeit IS DISTINCT FROM OLD.dringlichkeit
       OR NEW.client_id IS DISTINCT FROM OLD.client_id
       OR NEW.handlungsbedarf IS DISTINCT FROM OLD.handlungsbedarf
       OR NEW.nachtrag IS DISTINCT FROM OLD.nachtrag
       OR NEW.protokoll_id IS DISTINCT FROM OLD.protokoll_id THEN
      RAISE EXCEPTION 'Der Inhalt eines abgeschlossenen Übergabepunktes ist unveränderlich.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_uebergabe_punkt_guard ON public.uebergabe_punkte;
CREATE TRIGGER trg_uebergabe_punkt_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.uebergabe_punkte
  FOR EACH ROW EXECUTE FUNCTION public.uebergabe_punkt_guard();

-- Trigger-Funktionen sind kein öffentlicher RPC-Einstieg. Der Trigger-
-- Mechanismus ruft sie unabhängig von den EXECUTE-Rechten des Aufrufers
-- (Konvention aus 20260823010000_secdef_trigger_revoke.sql).
REVOKE ALL ON FUNCTION public.uebergabe_protokoll_abschluss_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.uebergabe_punkt_guard() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.uebergabe_protokoll_abschluss_guard() TO service_role;
GRANT EXECUTE ON FUNCTION public.uebergabe_punkt_guard() TO service_role;

-- ── 7. RLS ──────────────────────────────────────────────────────

ALTER TABLE public.uebergabe_protokolle ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.uebergabe_punkte ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.uebergabe_kenntnisnahmen ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  -- Org-Fence (RESTRICTIVE) — gilt zusätzlich zu jeder Rollenpolicy.
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'uebergabe_protokolle' AND policyname = 'org_fence_uebergabe_protokolle') THEN
    CREATE POLICY org_fence_uebergabe_protokolle ON uebergabe_protokolle AS RESTRICTIVE FOR ALL
      USING (organization_id = current_org_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'uebergabe_punkte' AND policyname = 'org_fence_uebergabe_punkte') THEN
    CREATE POLICY org_fence_uebergabe_punkte ON uebergabe_punkte AS RESTRICTIVE FOR ALL
      USING (organization_id = current_org_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'uebergabe_kenntnisnahmen' AND policyname = 'org_fence_uebergabe_kenntnisnahmen') THEN
    CREATE POLICY org_fence_uebergabe_kenntnisnahmen ON uebergabe_kenntnisnahmen AS RESTRICTIVE FOR ALL
      USING (organization_id = current_org_id());
  END IF;

  -- Admin: Vollzugriff
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'uebergabe_protokolle' AND policyname = 'admin_uebergabe_protokolle_all') THEN
    CREATE POLICY admin_uebergabe_protokolle_all ON uebergabe_protokolle FOR ALL USING (is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'uebergabe_punkte' AND policyname = 'admin_uebergabe_punkte_all') THEN
    CREATE POLICY admin_uebergabe_punkte_all ON uebergabe_punkte FOR ALL USING (is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'uebergabe_kenntnisnahmen' AND policyname = 'admin_uebergabe_kenntnisnahmen_all') THEN
    CREATE POLICY admin_uebergabe_kenntnisnahmen_all ON uebergabe_kenntnisnahmen FOR ALL USING (is_admin());
  END IF;

  -- Engel: Protokollköpfe der eigenen Organisation lesen. Der Kopf enthält
  -- keine Klientendaten; ohne Lesbarkeit gäbe es keine Übergabe.
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'uebergabe_protokolle' AND policyname = 'engel_uebergabe_protokolle_select') THEN
    CREATE POLICY engel_uebergabe_protokolle_select ON uebergabe_protokolle FOR SELECT
      USING (auth.uid() IS NOT NULL);
  END IF;

  -- Engel: eigenes Protokoll anlegen und bis zum Abschluss pflegen.
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'uebergabe_protokolle' AND policyname = 'engel_uebergabe_protokolle_insert') THEN
    CREATE POLICY engel_uebergabe_protokolle_insert ON uebergabe_protokolle FOR INSERT
      WITH CHECK (uebergeber_id = auth.uid() AND status = 'offen');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'uebergabe_protokolle' AND policyname = 'engel_uebergabe_protokolle_update') THEN
    CREATE POLICY engel_uebergabe_protokolle_update ON uebergabe_protokolle FOR UPDATE
      USING (uebergeber_id = auth.uid() AND status = 'offen')
      WITH CHECK (uebergeber_id = auth.uid());
  END IF;

  -- Engel: Punkte zu zugewiesenen Klienten + organisatorische Punkte.
  -- eigene_caregiver_ids() statt Join auf caregivers — Engel haben auf
  -- caregivers keine Lesepolicy, ein Join blockte still alles weg.
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'uebergabe_punkte' AND policyname = 'engel_uebergabe_punkte_select') THEN
    CREATE POLICY engel_uebergabe_punkte_select ON uebergabe_punkte FOR SELECT
      USING (
        client_id IS NULL
        OR client_id IN (
          SELECT a.client_id FROM assignments a
          WHERE a.caregiver_id IN (SELECT eigene_caregiver_ids())
            AND a.status IN ('active','GEPLANT','BESTAETIGT','UNTERWEGS','GESTARTET')
        )
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'uebergabe_punkte' AND policyname = 'engel_uebergabe_punkte_insert') THEN
    CREATE POLICY engel_uebergabe_punkte_insert ON uebergabe_punkte FOR INSERT
      WITH CHECK (
        erstellt_von = auth.uid()
        AND (
          client_id IS NULL
          OR client_id IN (
            SELECT a.client_id FROM assignments a
            WHERE a.caregiver_id IN (SELECT eigene_caregiver_ids())
              AND a.status IN ('active','GEPLANT','BESTAETIGT','UNTERWEGS','GESTARTET')
          )
        )
      );
  END IF;
  -- Erledigung nachziehen darf jeder, der den Punkt sehen darf; der
  -- Inhaltsschutz nach Abschluss läuft über trg_uebergabe_punkt_guard.
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'uebergabe_punkte' AND policyname = 'engel_uebergabe_punkte_update') THEN
    CREATE POLICY engel_uebergabe_punkte_update ON uebergabe_punkte FOR UPDATE
      USING (
        client_id IS NULL
        OR client_id IN (
          SELECT a.client_id FROM assignments a
          WHERE a.caregiver_id IN (SELECT eigene_caregiver_ids())
            AND a.status IN ('active','GEPLANT','BESTAETIGT','UNTERWEGS','GESTARTET')
        )
      );
  END IF;

  -- Kenntnisnahme: jeder quittiert ausschliesslich für sich selbst.
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'uebergabe_kenntnisnahmen' AND policyname = 'engel_uebergabe_kenntnisnahmen_select') THEN
    CREATE POLICY engel_uebergabe_kenntnisnahmen_select ON uebergabe_kenntnisnahmen FOR SELECT
      USING (auth.uid() IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'uebergabe_kenntnisnahmen' AND policyname = 'engel_uebergabe_kenntnisnahmen_insert') THEN
    CREATE POLICY engel_uebergabe_kenntnisnahmen_insert ON uebergabe_kenntnisnahmen FOR INSERT
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

COMMIT;
