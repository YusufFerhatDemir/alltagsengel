-- ════════════════════════════════════════════════════════════════════
-- TOURENPLANUNG — tours / tour_stops / tour_templates
-- ════════════════════════════════════════════════════════════════════
-- Erweiterungsschicht über dem bestehenden Einsatzplanungs-Modul
-- (assignments + check_assignment_overlap + get_calendar_assignments).
-- Eine Tour bündelt die Einsätze eines Mitarbeiters an einem Tag zu
-- einer geordneten Route inkl. Fahrtzeit zwischen den Einsatzorten.
--
-- tour_stops.assignment_id verweist auf assignments — der bestehende
-- Doppelbelegungs-Trigger und die RLS auf assignments bleiben die
-- Wahrheit für Zeitkonflikte; die Tour ordnet nur an.
--
-- Alle Statements idempotent (IF NOT EXISTS / DO $$ … $$).
-- Policies nutzen public.is_admin() — KEINE profiles-Subqueries
-- (42P17-Rekursionsfalle, siehe 20260803-Härtung).
-- org_fence-Pattern identisch zu 20260801_phase3_multi_mandant_saas.
-- Kein BEGIN/COMMIT: der Apply-Weg (_run_sql via PostgREST) läuft
-- bereits atomar in einer Transaktion und lehnt Transaktions-
-- kommandos ab (0A000).
-- ════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════
-- 1) TOUR_TEMPLATES — wiederkehrende Wochen-Vorlagen
-- ═══════════════════════════════════════════════════════════════════
-- stops: jsonb-Array [{client_id, dauer_minuten, service_type, notes}]
-- in Reihenfolge. Beim Materialisieren einer Tour werden daraus
-- assignments + tour_stops erzeugt (API-Schicht).

CREATE TABLE IF NOT EXISTS public.tour_templates (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL DEFAULT public.current_org_id() REFERENCES public.organizations(id),
  name            text NOT NULL,
  caregiver_id    uuid REFERENCES public.caregivers(id) ON DELETE SET NULL,
  weekday         integer CHECK (weekday BETWEEN 1 AND 7),
  start_zeit      time,
  stops           jsonb NOT NULL DEFAULT '[]'::jsonb,
  aktiv           boolean NOT NULL DEFAULT true,
  notes           text,
  created_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tour_templates_caregiver
  ON public.tour_templates (caregiver_id) WHERE caregiver_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tour_templates_org
  ON public.tour_templates (organization_id);

-- ═══════════════════════════════════════════════════════════════════
-- 2) TOURS — eine Route eines Mitarbeiters an einem Tag
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.tours (
  id                    uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id       uuid NOT NULL DEFAULT public.current_org_id() REFERENCES public.organizations(id),
  caregiver_id          uuid NOT NULL REFERENCES public.caregivers(id),
  tour_date             date NOT NULL,
  name                  text,
  status                text NOT NULL DEFAULT 'GEPLANT'
    CHECK (status IN ('GEPLANT','FREIGEGEBEN','UNTERWEGS','ABGESCHLOSSEN','STORNIERT')),
  start_zeit            time,
  ende_zeit             time,
  gesamt_fahrzeit_minuten integer NOT NULL DEFAULT 0,
  gesamt_distanz_km     numeric NOT NULL DEFAULT 0,
  template_id           uuid REFERENCES public.tour_templates(id) ON DELETE SET NULL,
  -- Vertretung: Tour wurde von diesem Mitarbeiter übernommen
  vertretung_fuer_caregiver_id uuid REFERENCES public.caregivers(id),
  vertretung_grund      text,
  notes                 text,
  created_by            uuid,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tours_caregiver_date
  ON public.tours (caregiver_id, tour_date);
CREATE INDEX IF NOT EXISTS idx_tours_date
  ON public.tours (tour_date);
CREATE INDEX IF NOT EXISTS idx_tours_org
  ON public.tours (organization_id);
CREATE INDEX IF NOT EXISTS idx_tours_status
  ON public.tours (status) WHERE status NOT IN ('ABGESCHLOSSEN','STORNIERT');

-- ═══════════════════════════════════════════════════════════════════
-- 3) TOUR_STOPS — geordnete Halte einer Tour
-- ═══════════════════════════════════════════════════════════════════
-- Status-Kette pro Stop: GEPLANT → UNTERWEGS → BEIM_KLIENTEN →
-- ABGESCHLOSSEN (bzw. AUSGEFALLEN). Der Sync-Trigger unten spiegelt
-- das auf den verknüpften assignment-Status.

CREATE TABLE IF NOT EXISTS public.tour_stops (
  id                    uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id       uuid NOT NULL DEFAULT public.current_org_id() REFERENCES public.organizations(id),
  tour_id               uuid NOT NULL REFERENCES public.tours(id) ON DELETE CASCADE,
  assignment_id         uuid REFERENCES public.assignments(id) ON DELETE SET NULL,
  client_id             uuid REFERENCES public.clients(id),
  position              integer NOT NULL,
  geplante_ankunft      time,
  geplantes_ende        time,
  -- Fahrt vom vorherigen Stop (bzw. vom Startpunkt bei position=1)
  fahrzeit_minuten      integer,
  distanz_km            numeric,
  adresse               text,
  plz                   text,
  status                text NOT NULL DEFAULT 'GEPLANT'
    CHECK (status IN ('GEPLANT','UNTERWEGS','BEIM_KLIENTEN','ABGESCHLOSSEN','AUSGEFALLEN')),
  tatsaechliche_ankunft timestamptz,
  tatsaechliches_ende   timestamptz,
  service_record_id     uuid REFERENCES public.service_records(id) ON DELETE SET NULL,
  notes                 text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tour_stops_position_unique UNIQUE (tour_id, position) DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX IF NOT EXISTS idx_tour_stops_tour
  ON public.tour_stops (tour_id, position);
CREATE INDEX IF NOT EXISTS idx_tour_stops_assignment
  ON public.tour_stops (assignment_id) WHERE assignment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tour_stops_client
  ON public.tour_stops (client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tour_stops_org
  ON public.tour_stops (organization_id);

-- ═══════════════════════════════════════════════════════════════════
-- 4) updated_at-Trigger (nutzt vorhandenes public.set_updated_at)
-- ═══════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_tours_updated_at ON public.tours;
CREATE TRIGGER trg_tours_updated_at
  BEFORE UPDATE ON public.tours
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_tour_stops_updated_at ON public.tour_stops;
CREATE TRIGGER trg_tour_stops_updated_at
  BEFORE UPDATE ON public.tour_stops
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_tour_templates_updated_at ON public.tour_templates;
CREATE TRIGGER trg_tour_templates_updated_at
  BEFORE UPDATE ON public.tour_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ═══════════════════════════════════════════════════════════════════
-- 5) TRIGGER: Stop-Status → Assignment-Status spiegeln
-- ═══════════════════════════════════════════════════════════════════
-- Läuft als INVOKER: Engel dürfen laut assignments_engel_update nur
-- eigene Einsätze ändern — die RLS bleibt damit wirksam.

CREATE OR REPLACE FUNCTION public.tour_stop_sync_assignment()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_assignment_status text;
BEGIN
  IF NEW.assignment_id IS NULL OR NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  v_assignment_status := CASE NEW.status
    WHEN 'UNTERWEGS'     THEN 'UNTERWEGS'
    WHEN 'BEIM_KLIENTEN' THEN 'GESTARTET'
    WHEN 'ABGESCHLOSSEN' THEN 'BEENDET'
    ELSE NULL
  END;

  IF v_assignment_status IS NOT NULL THEN
    UPDATE public.assignments
    SET status = v_assignment_status,
        actual_start_time = CASE
          WHEN v_assignment_status = 'GESTARTET' AND actual_start_time IS NULL
          THEN (now() AT TIME ZONE 'Europe/Berlin')::time
          ELSE actual_start_time END,
        actual_end_time = CASE
          WHEN v_assignment_status = 'BEENDET' AND actual_end_time IS NULL
          THEN (now() AT TIME ZONE 'Europe/Berlin')::time
          ELSE actual_end_time END,
        updated_at = now()
    WHERE id = NEW.assignment_id;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.tour_stop_sync_assignment() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_tour_stop_sync_assignment ON public.tour_stops;
CREATE TRIGGER trg_tour_stop_sync_assignment
  AFTER UPDATE ON public.tour_stops
  FOR EACH ROW EXECUTE FUNCTION public.tour_stop_sync_assignment();

-- ═══════════════════════════════════════════════════════════════════
-- 6) TRIGGER: Tour-Summen (Fahrzeit/Distanz) aktuell halten
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.tour_recalc_totals()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_tour_id uuid;
BEGIN
  -- Bei DELETE ist NEW in plpgsql nicht zugewiesen — TG_OP unterscheiden
  IF TG_OP = 'DELETE' THEN
    v_tour_id := OLD.tour_id;
  ELSE
    v_tour_id := NEW.tour_id;
  END IF;

  UPDATE public.tours t
  SET gesamt_fahrzeit_minuten = COALESCE(s.fahrzeit, 0),
      gesamt_distanz_km       = COALESCE(s.distanz, 0),
      updated_at              = now()
  FROM (
    SELECT COALESCE(SUM(fahrzeit_minuten), 0) AS fahrzeit,
           COALESCE(SUM(distanz_km), 0)       AS distanz
    FROM public.tour_stops
    WHERE tour_id = v_tour_id AND status != 'AUSGEFALLEN'
  ) s
  WHERE t.id = v_tour_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.tour_recalc_totals() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_tour_recalc_totals ON public.tour_stops;
CREATE TRIGGER trg_tour_recalc_totals
  AFTER INSERT OR UPDATE OF fahrzeit_minuten, distanz_km, status OR DELETE
  ON public.tour_stops
  FOR EACH ROW EXECUTE FUNCTION public.tour_recalc_totals();

-- ═══════════════════════════════════════════════════════════════════
-- 7) RLS
-- ═══════════════════════════════════════════════════════════════════
-- Helper analog zu is_admin(): caregivers hat keine Self-Read-Policy
-- (nur Admin + org_fence) — eine Subquery `caregiver_id IN (SELECT id
-- FROM caregivers WHERE user_id = auth.uid())` läuft für Engel daher
-- LEER (in Shadow-DB nachgewiesen). SECURITY DEFINER umgeht die
-- caregivers-RLS, gibt aber nur die EIGENEN IDs des Aufrufers preis.

CREATE OR REPLACE FUNCTION public.eigene_caregiver_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT id FROM public.caregivers WHERE user_id = auth.uid();
$$;

-- Default-Privileges-Falle: neue Funktionen sind sonst anon-ausführbar
REVOKE ALL ON FUNCTION public.eigene_caregiver_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.eigene_caregiver_ids() TO authenticated, service_role;

-- Gleiches für die Kunden-Seite: bricht den Policy-Zyklus
-- assignments_engel_read → clients → clients_caregiver_read →
-- assignments (42P17, in Shadow-DB nachgewiesen — betrifft die
-- BESTEHENDE Einsatzplanung, sobald ein Engel assignments liest).
CREATE OR REPLACE FUNCTION public.eigene_client_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT id FROM public.clients WHERE user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.eigene_client_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.eigene_client_ids() TO authenticated, service_role;

ALTER TABLE public.tours          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tour_stops     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tour_templates ENABLE ROW LEVEL SECURITY;

-- Admin: volle Verwaltung (is_admin() — keine profiles-Subquery!)
DROP POLICY IF EXISTS tours_admin_manage ON public.tours;
CREATE POLICY tours_admin_manage ON public.tours
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS tour_stops_admin_manage ON public.tour_stops;
CREATE POLICY tour_stops_admin_manage ON public.tour_stops
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS tour_templates_admin_manage ON public.tour_templates;
CREATE POLICY tour_templates_admin_manage ON public.tour_templates
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Engel: eigene Touren lesen
DROP POLICY IF EXISTS tours_engel_read ON public.tours;
CREATE POLICY tours_engel_read ON public.tours
  FOR SELECT TO authenticated
  USING (
    caregiver_id IN (SELECT public.eigene_caregiver_ids())
  );

-- Engel: Status der eigenen Tour fortschreiben
DROP POLICY IF EXISTS tours_engel_update ON public.tours;
CREATE POLICY tours_engel_update ON public.tours
  FOR UPDATE TO authenticated
  USING (
    caregiver_id IN (SELECT public.eigene_caregiver_ids())
  )
  WITH CHECK (
    caregiver_id IN (SELECT public.eigene_caregiver_ids())
  );

-- Engel: Stops der eigenen Touren lesen + Status fortschreiben
DROP POLICY IF EXISTS tour_stops_engel_read ON public.tour_stops;
CREATE POLICY tour_stops_engel_read ON public.tour_stops
  FOR SELECT TO authenticated
  USING (
    tour_id IN (
      SELECT t.id FROM public.tours t
      WHERE t.caregiver_id IN (SELECT public.eigene_caregiver_ids())
    )
  );

DROP POLICY IF EXISTS tour_stops_engel_update ON public.tour_stops;
CREATE POLICY tour_stops_engel_update ON public.tour_stops
  FOR UPDATE TO authenticated
  USING (
    tour_id IN (
      SELECT t.id FROM public.tours t
      WHERE t.caregiver_id IN (SELECT public.eigene_caregiver_ids())
    )
  )
  WITH CHECK (
    tour_id IN (
      SELECT t.id FROM public.tours t
      WHERE t.caregiver_id IN (SELECT public.eigene_caregiver_ids())
    )
  );

-- ── Härtung der Einsatzplanungs-Policies (Integrationspunkt) ──
-- Die bestehenden assignments_engel_*-Policies (20260808200000) nutzen
-- die caregivers-Subquery, die für Engel leer läuft (caregivers hat
-- keine Self-Read-Policy). Der Stop→Assignment-Sync-Trigger läuft als
-- INVOKER und braucht für Engel funktionierende assignments-Policies —
-- gleiche Semantik, jetzt über den SECURITY-DEFINER-Helper.

DROP POLICY IF EXISTS assignments_engel_read ON public.assignments;
CREATE POLICY assignments_engel_read ON public.assignments
  FOR SELECT TO authenticated
  USING (
    caregiver_id IN (SELECT public.eigene_caregiver_ids())
    OR client_id IN (SELECT public.eigene_client_ids())
    OR public.is_admin()
  );

DROP POLICY IF EXISTS assignments_engel_update ON public.assignments;
CREATE POLICY assignments_engel_update ON public.assignments
  FOR UPDATE TO authenticated
  USING (
    caregiver_id IN (SELECT public.eigene_caregiver_ids())
    OR public.is_admin()
  )
  WITH CHECK (
    caregiver_id IN (SELECT public.eigene_caregiver_ids())
    OR public.is_admin()
  );

-- org_fence RESTRICTIVE (Phase-3-Pattern)
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['tours','tour_stops','tour_templates'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%s_org_fence" ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY "%s_org_fence" ON public.%I AS RESTRICTIVE FOR ALL '
      || 'USING (organization_id = public.current_org_id()) '
      || 'WITH CHECK (organization_id = public.current_org_id())', t, t);
  END LOOP;
END $$;
