-- ============================================================
-- Migration: Workflow-Engine + Automatisierungen
-- Datum: 2026-08-08
-- Projekt: Alltagsengel UG
-- Beschreibung: Zentrale Event-/Workflow-Engine mit konfigurierbaren
--   WHEN→IF→THEN Regeln, Idempotenz, Retry/Dead-Letter, Immutable Audit.
--   Anbindung an alle bestehenden Module (DAKOTA, Abrechnung, Personal,
--   Pflege, Dokumente, Einsatz, Aufgaben).
-- ============================================================

-- ============================================================
-- TEIL 1: wf_events — Zentrales Event-Log
-- ============================================================

CREATE TABLE IF NOT EXISTS public.wf_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  event_typ text NOT NULL,
  modul text NOT NULL CHECK (modul IN (
    'dakota','abrechnung','personal','pflege','dokumente','einsatz','aufgaben','forderungen','system'
  )),
  quell_tabelle text NOT NULL,
  quell_id uuid,
  payload jsonb DEFAULT '{}',
  idempotency_key text NOT NULL,
  status text NOT NULL DEFAULT 'neu' CHECK (status IN ('neu','in_bearbeitung','verarbeitet','fehlgeschlagen','uebersprungen')),
  prioritaet text NOT NULL DEFAULT 'normal' CHECK (prioritaet IN ('niedrig','normal','hoch','kritisch')),
  ausgeloest_von uuid REFERENCES public.profiles(id),
  ausgeloest_am timestamptz DEFAULT now(),
  verarbeitet_am timestamptz,
  fehler_nachricht text,
  retry_count integer DEFAULT 0,
  max_retries integer DEFAULT 3,
  naechster_retry timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE(organization_id, idempotency_key)
);

ALTER TABLE public.wf_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wf_events_org_fence ON public.wf_events;
CREATE POLICY wf_events_org_fence ON public.wf_events AS RESTRICTIVE
  FOR ALL USING (organization_id = current_org_id());

DROP POLICY IF EXISTS wf_events_admin_all ON public.wf_events;
CREATE POLICY wf_events_admin_all ON public.wf_events
  FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE INDEX IF NOT EXISTS idx_wf_events_status ON public.wf_events(status) WHERE status IN ('neu','fehlgeschlagen');
CREATE INDEX IF NOT EXISTS idx_wf_events_typ ON public.wf_events(event_typ);
CREATE INDEX IF NOT EXISTS idx_wf_events_org_created ON public.wf_events(organization_id, created_at DESC);

-- ============================================================
-- TEIL 2: wf_regeln — Workflow-Regeln (WHEN → IF → THEN)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.wf_regeln (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  bezeichnung text NOT NULL,
  beschreibung text,
  event_typ text NOT NULL,
  modul text NOT NULL CHECK (modul IN (
    'dakota','abrechnung','personal','pflege','dokumente','einsatz','aufgaben','forderungen','system'
  )),
  bedingungen jsonb DEFAULT '[]'::jsonb,
  aktiv boolean DEFAULT true,
  prioritaet integer DEFAULT 100,
  max_ausfuehrungen_pro_entity integer,
  cooldown_minuten integer,
  erstellt_von uuid REFERENCES public.profiles(id),
  ist_system boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.wf_regeln ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wf_regeln_org_fence ON public.wf_regeln;
CREATE POLICY wf_regeln_org_fence ON public.wf_regeln AS RESTRICTIVE
  FOR ALL USING (organization_id = current_org_id());

DROP POLICY IF EXISTS wf_regeln_admin_all ON public.wf_regeln;
CREATE POLICY wf_regeln_admin_all ON public.wf_regeln
  FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE INDEX IF NOT EXISTS idx_wf_regeln_event_typ ON public.wf_regeln(event_typ) WHERE aktiv = true;

-- ============================================================
-- TEIL 3: wf_aktionen — Aktionen pro Regel
-- ============================================================

CREATE TABLE IF NOT EXISTS public.wf_aktionen (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  regel_id uuid NOT NULL REFERENCES public.wf_regeln(id) ON DELETE CASCADE,
  reihenfolge integer DEFAULT 1,
  typ text NOT NULL CHECK (typ IN (
    'aufgabe_erstellen','benachrichtigung_senden','wiedervorlage_erstellen',
    'eskalation_ausloesen','status_aendern','feld_aktualisieren','webhook'
  )),
  konfiguration jsonb NOT NULL DEFAULT '{}'::jsonb,
  aktiv boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.wf_aktionen ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wf_aktionen_org_fence ON public.wf_aktionen;
CREATE POLICY wf_aktionen_org_fence ON public.wf_aktionen AS RESTRICTIVE
  FOR ALL USING (organization_id = current_org_id());

DROP POLICY IF EXISTS wf_aktionen_admin_all ON public.wf_aktionen;
CREATE POLICY wf_aktionen_admin_all ON public.wf_aktionen
  FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- ============================================================
-- TEIL 4: wf_ausfuehrungen — Ausführungsprotokoll
-- ============================================================

CREATE TABLE IF NOT EXISTS public.wf_ausfuehrungen (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  event_id uuid NOT NULL REFERENCES public.wf_events(id),
  regel_id uuid NOT NULL REFERENCES public.wf_regeln(id),
  aktion_id uuid REFERENCES public.wf_aktionen(id),
  status text NOT NULL DEFAULT 'ausstehend' CHECK (status IN ('ausstehend','erfolgreich','fehlgeschlagen','uebersprungen')),
  ergebnis jsonb,
  fehler_nachricht text,
  erstellt_entity_typ text,
  erstellt_entity_id uuid,
  gestartet_am timestamptz DEFAULT now(),
  beendet_am timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.wf_ausfuehrungen ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wf_ausfuehrungen_org_fence ON public.wf_ausfuehrungen;
CREATE POLICY wf_ausfuehrungen_org_fence ON public.wf_ausfuehrungen AS RESTRICTIVE
  FOR ALL USING (organization_id = current_org_id());

DROP POLICY IF EXISTS wf_ausfuehrungen_admin_all ON public.wf_ausfuehrungen;
CREATE POLICY wf_ausfuehrungen_admin_all ON public.wf_ausfuehrungen
  FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE INDEX IF NOT EXISTS idx_wf_ausfuehrungen_event ON public.wf_ausfuehrungen(event_id);
CREATE INDEX IF NOT EXISTS idx_wf_ausfuehrungen_status ON public.wf_ausfuehrungen(status) WHERE status = 'ausstehend';

-- ============================================================
-- TEIL 5: wf_warteschlange — Retry-Queue
-- ============================================================

CREATE TABLE IF NOT EXISTS public.wf_warteschlange (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  event_id uuid NOT NULL REFERENCES public.wf_events(id),
  regel_id uuid NOT NULL REFERENCES public.wf_regeln(id),
  aktion_id uuid NOT NULL REFERENCES public.wf_aktionen(id),
  prioritaet integer DEFAULT 100,
  status text NOT NULL DEFAULT 'wartend' CHECK (status IN ('wartend','in_bearbeitung','erledigt','fehlgeschlagen','dead_letter')),
  versuch integer DEFAULT 1,
  max_versuche integer DEFAULT 3,
  naechster_versuch timestamptz DEFAULT now(),
  fehler_nachricht text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.wf_warteschlange ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wf_warteschlange_org_fence ON public.wf_warteschlange;
CREATE POLICY wf_warteschlange_org_fence ON public.wf_warteschlange AS RESTRICTIVE
  FOR ALL USING (organization_id = current_org_id());

DROP POLICY IF EXISTS wf_warteschlange_admin_all ON public.wf_warteschlange;
CREATE POLICY wf_warteschlange_admin_all ON public.wf_warteschlange
  FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE INDEX IF NOT EXISTS idx_wf_queue_pending ON public.wf_warteschlange(naechster_versuch)
  WHERE status = 'wartend';

-- ============================================================
-- TEIL 6: wf_dead_letter — Fehlgeschlagene Automationen
-- ============================================================

CREATE TABLE IF NOT EXISTS public.wf_dead_letter (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  warteschlange_id uuid REFERENCES public.wf_warteschlange(id),
  event_id uuid NOT NULL REFERENCES public.wf_events(id),
  regel_id uuid NOT NULL REFERENCES public.wf_regeln(id),
  aktion_id uuid NOT NULL REFERENCES public.wf_aktionen(id),
  fehler_nachricht text,
  payload jsonb,
  versuche integer,
  manuell_wiederholt boolean DEFAULT false,
  wiederholt_am timestamptz,
  wiederholt_von uuid REFERENCES public.profiles(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.wf_dead_letter ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wf_dead_letter_org_fence ON public.wf_dead_letter;
CREATE POLICY wf_dead_letter_org_fence ON public.wf_dead_letter AS RESTRICTIVE
  FOR ALL USING (organization_id = current_org_id());

DROP POLICY IF EXISTS wf_dead_letter_admin_all ON public.wf_dead_letter;
CREATE POLICY wf_dead_letter_admin_all ON public.wf_dead_letter
  FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- ============================================================
-- TEIL 7: wf_audit_log — IMMUTABLE Audit-Trail
-- ============================================================

CREATE TABLE IF NOT EXISTS public.wf_audit_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  typ text NOT NULL CHECK (typ IN (
    'event_emittiert','regel_ausgewertet','aktion_ausgefuehrt',
    'retry','dead_letter','manuell_wiederholt',
    'regel_erstellt','regel_geaendert','regel_deaktiviert',
    'fristen_check','system_fehler'
  )),
  entitaet_typ text NOT NULL,
  entitaet_id uuid,
  aktion text NOT NULL,
  details jsonb DEFAULT '{}'::jsonb,
  akteur_id uuid REFERENCES public.profiles(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.wf_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wf_audit_org_fence ON public.wf_audit_log;
CREATE POLICY wf_audit_org_fence ON public.wf_audit_log AS RESTRICTIVE
  FOR ALL USING (organization_id = current_org_id());

DROP POLICY IF EXISTS wf_audit_admin_all ON public.wf_audit_log;
CREATE POLICY wf_audit_admin_all ON public.wf_audit_log
  FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- IMMUTABLE: No UPDATE or DELETE
CREATE OR REPLACE FUNCTION public.prevent_wf_audit_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'wf_audit_log ist unveränderbar'; END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_wf_audit_delete()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'wf_audit_log kann nicht gelöscht werden'; END;
$$;

DROP TRIGGER IF EXISTS trg_wf_audit_immutable_update ON public.wf_audit_log;
CREATE TRIGGER trg_wf_audit_immutable_update
  BEFORE UPDATE ON public.wf_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.prevent_wf_audit_update();

DROP TRIGGER IF EXISTS trg_wf_audit_immutable_delete ON public.wf_audit_log;
CREATE TRIGGER trg_wf_audit_immutable_delete
  BEFORE DELETE ON public.wf_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.prevent_wf_audit_delete();

CREATE INDEX IF NOT EXISTS idx_wf_audit_org_created ON public.wf_audit_log(organization_id, created_at DESC);

-- ============================================================
-- TEIL 8: updated_at Trigger für wf_regeln, wf_warteschlange
-- ============================================================

DROP TRIGGER IF EXISTS trg_updated_at_wf_regeln ON public.wf_regeln;
CREATE TRIGGER trg_updated_at_wf_regeln
  BEFORE UPDATE ON public.wf_regeln
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS trg_updated_at_wf_warteschlange ON public.wf_warteschlange;
CREATE TRIGGER trg_updated_at_wf_warteschlange
  BEFORE UPDATE ON public.wf_warteschlange
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================================
-- TEIL 9: wf_emit_event() — Zentraler Event-Emitter (SECURITY DEFINER)
-- ============================================================

CREATE OR REPLACE FUNCTION public.wf_emit_event(
  p_organization_id uuid,
  p_event_typ text,
  p_modul text,
  p_quell_tabelle text,
  p_quell_id uuid,
  p_payload jsonb DEFAULT '{}',
  p_idempotency_key text DEFAULT NULL,
  p_prioritaet text DEFAULT 'normal',
  p_ausgeloest_von uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id uuid;
  v_idem_key text;
BEGIN
  -- Idempotency-Key generieren falls nicht angegeben
  v_idem_key := COALESCE(p_idempotency_key,
    p_event_typ || ':' || COALESCE(p_quell_id::text, 'null') || ':' || to_char(now(), 'YYYY-MM-DD'));

  -- Event einfügen mit Deduplication
  INSERT INTO public.wf_events (
    organization_id, event_typ, modul, quell_tabelle, quell_id,
    payload, idempotency_key, prioritaet, ausgeloest_von
  ) VALUES (
    p_organization_id, p_event_typ, p_modul, p_quell_tabelle, p_quell_id,
    p_payload, v_idem_key, p_prioritaet, p_ausgeloest_von
  )
  ON CONFLICT (organization_id, idempotency_key) DO NOTHING
  RETURNING id INTO v_event_id;

  -- Wenn Duplikat → NULL zurückgeben (bereits verarbeitet)
  IF v_event_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Audit-Eintrag
  INSERT INTO public.wf_audit_log (
    organization_id, typ, entitaet_typ, entitaet_id, aktion, details
  ) VALUES (
    p_organization_id, 'event_emittiert', p_quell_tabelle, p_quell_id,
    p_event_typ, jsonb_build_object('payload', p_payload, 'prioritaet', p_prioritaet)
  );

  RETURN v_event_id;
END;
$$;

-- ============================================================
-- TEIL 10: wf_process_event() — Event verarbeiten (SECURITY DEFINER)
-- ============================================================

CREATE OR REPLACE FUNCTION public.wf_process_event(p_event_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event RECORD;
  v_regel RECORD;
  v_aktion RECORD;
  v_matched boolean;
  v_count integer := 0;
  v_ausfuehrung_id uuid;
  v_cooldown_ok boolean;
  v_exec_count integer;
BEGIN
  -- Event laden
  SELECT * INTO v_event FROM public.wf_events WHERE id = p_event_id AND status = 'neu';
  IF NOT FOUND THEN RETURN 0; END IF;

  -- Status auf in_bearbeitung
  UPDATE public.wf_events SET status = 'in_bearbeitung' WHERE id = p_event_id;

  -- Passende Regeln suchen
  FOR v_regel IN
    SELECT * FROM public.wf_regeln
    WHERE event_typ = v_event.event_typ
      AND organization_id = v_event.organization_id
      AND aktiv = true
    ORDER BY prioritaet DESC
  LOOP
    -- Cooldown prüfen
    v_cooldown_ok := true;
    IF v_regel.cooldown_minuten IS NOT NULL THEN
      SELECT NOT EXISTS (
        SELECT 1 FROM public.wf_ausfuehrungen a
        JOIN public.wf_events e ON e.id = a.event_id
        WHERE a.regel_id = v_regel.id
          AND a.status = 'erfolgreich'
          AND e.quell_id = v_event.quell_id
          AND a.created_at > now() - (v_regel.cooldown_minuten || ' minutes')::interval
      ) INTO v_cooldown_ok;
    END IF;

    IF NOT v_cooldown_ok THEN CONTINUE; END IF;

    -- Max-Ausführungen prüfen
    IF v_regel.max_ausfuehrungen_pro_entity IS NOT NULL THEN
      SELECT COUNT(*) INTO v_exec_count
      FROM public.wf_ausfuehrungen a
      JOIN public.wf_events e ON e.id = a.event_id
      WHERE a.regel_id = v_regel.id
        AND a.status = 'erfolgreich'
        AND e.quell_id = v_event.quell_id;

      IF v_exec_count >= v_regel.max_ausfuehrungen_pro_entity THEN CONTINUE; END IF;
    END IF;

    -- Bedingungen auswerten (JSON-basiert)
    v_matched := public.wf_evaluate_conditions(v_regel.bedingungen, v_event.payload);
    IF NOT v_matched THEN
      -- Audit: Regel nicht gematcht
      INSERT INTO public.wf_audit_log (organization_id, typ, entitaet_typ, entitaet_id, aktion, details)
      VALUES (v_event.organization_id, 'regel_ausgewertet', 'wf_regeln', v_regel.id,
              'bedingung_nicht_erfuellt', jsonb_build_object('event_id', p_event_id));
      CONTINUE;
    END IF;

    -- Aktionen der Regel ausführen
    FOR v_aktion IN
      SELECT * FROM public.wf_aktionen
      WHERE regel_id = v_regel.id AND aktiv = true
      ORDER BY reihenfolge
    LOOP
      -- Warteschlange-Eintrag erstellen
      INSERT INTO public.wf_warteschlange (
        organization_id, event_id, regel_id, aktion_id, prioritaet
      ) VALUES (
        v_event.organization_id, p_event_id, v_regel.id, v_aktion.id, v_regel.prioritaet
      );

      v_count := v_count + 1;
    END LOOP;

    -- Audit: Regel gematcht
    INSERT INTO public.wf_audit_log (organization_id, typ, entitaet_typ, entitaet_id, aktion, details)
    VALUES (v_event.organization_id, 'regel_ausgewertet', 'wf_regeln', v_regel.id,
            'gematcht', jsonb_build_object('event_id', p_event_id, 'aktionen_count', v_count));
  END LOOP;

  -- Event als verarbeitet markieren
  UPDATE public.wf_events SET status = 'verarbeitet', verarbeitet_am = now() WHERE id = p_event_id;

  RETURN v_count;
END;
$$;

-- ============================================================
-- TEIL 11: wf_evaluate_conditions() — Bedingungen auswerten
-- ============================================================

CREATE OR REPLACE FUNCTION public.wf_evaluate_conditions(
  p_bedingungen jsonb,
  p_payload jsonb
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_cond jsonb;
  v_field text;
  v_op text;
  v_value text;
  v_actual text;
BEGIN
  -- Leere Bedingungen = immer wahr
  IF p_bedingungen IS NULL OR jsonb_array_length(p_bedingungen) = 0 THEN
    RETURN true;
  END IF;

  -- Alle Bedingungen müssen erfüllt sein (AND)
  FOR v_cond IN SELECT * FROM jsonb_array_elements(p_bedingungen)
  LOOP
    v_field := v_cond->>'feld';
    v_op := v_cond->>'operator';
    v_value := v_cond->>'wert';
    v_actual := p_payload->>v_field;

    CASE v_op
      WHEN '=' THEN
        IF v_actual IS DISTINCT FROM v_value THEN RETURN false; END IF;
      WHEN '!=' THEN
        IF v_actual IS NOT DISTINCT FROM v_value THEN RETURN false; END IF;
      WHEN '>' THEN
        IF (v_actual::numeric) <= (v_value::numeric) THEN RETURN false; END IF;
      WHEN '<' THEN
        IF (v_actual::numeric) >= (v_value::numeric) THEN RETURN false; END IF;
      WHEN '>=' THEN
        IF (v_actual::numeric) < (v_value::numeric) THEN RETURN false; END IF;
      WHEN '<=' THEN
        IF (v_actual::numeric) > (v_value::numeric) THEN RETURN false; END IF;
      WHEN 'enthält' THEN
        IF v_actual NOT ILIKE '%' || v_value || '%' THEN RETURN false; END IF;
      WHEN 'ist_leer' THEN
        IF v_actual IS NOT NULL AND v_actual != '' THEN RETURN false; END IF;
      WHEN 'ist_nicht_leer' THEN
        IF v_actual IS NULL OR v_actual = '' THEN RETURN false; END IF;
      ELSE
        -- Unbekannter Operator → Bedingung übersprungen
        NULL;
    END CASE;
  END LOOP;

  RETURN true;
END;
$$;

-- ============================================================
-- TEIL 12: wf_execute_queue_item() — Queue-Item ausführen (SECURITY DEFINER)
-- ============================================================

CREATE OR REPLACE FUNCTION public.wf_execute_queue_item(p_queue_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item RECORD;
  v_aktion RECORD;
  v_event RECORD;
  v_regel RECORD;
  v_result jsonb;
  v_created_id uuid;
  v_created_type text;
  v_success boolean := false;
BEGIN
  -- Queue-Item laden
  SELECT * INTO v_item FROM public.wf_warteschlange WHERE id = p_queue_id AND status = 'wartend';
  IF NOT FOUND THEN RETURN false; END IF;

  -- Lock
  UPDATE public.wf_warteschlange SET status = 'in_bearbeitung', updated_at = now() WHERE id = p_queue_id;

  -- Aktion, Event, Regel laden
  SELECT * INTO v_aktion FROM public.wf_aktionen WHERE id = v_item.aktion_id;
  SELECT * INTO v_event FROM public.wf_events WHERE id = v_item.event_id;
  SELECT * INTO v_regel FROM public.wf_regeln WHERE id = v_item.regel_id;

  BEGIN
    CASE v_aktion.typ
      -- ===== AUFGABE ERSTELLEN =====
      WHEN 'aufgabe_erstellen' THEN
        INSERT INTO public.ops_aufgaben (
          organization_id, titel, beschreibung, kategorie, prioritaet,
          status, faellig_am, verantwortlich_id, erstellt_von,
          client_id, caregiver_id, assignment_id
        ) VALUES (
          v_event.organization_id,
          COALESCE(v_aktion.konfiguration->>'titel', v_regel.bezeichnung),
          COALESCE(v_aktion.konfiguration->>'beschreibung', '') || E'\n\n[Auto-Workflow: ' || v_regel.bezeichnung || ']',
          COALESCE(v_aktion.konfiguration->>'kategorie', 'verwaltung'),
          COALESCE(v_aktion.konfiguration->>'prioritaet', 'normal'),
          'offen',
          CASE WHEN v_aktion.konfiguration->>'frist_tage' IS NOT NULL
            THEN now() + ((v_aktion.konfiguration->>'frist_tage')::integer || ' days')::interval
            ELSE now() + interval '7 days'
          END,
          CASE WHEN v_aktion.konfiguration->>'verantwortlich_rolle' = 'admin'
            THEN (SELECT om.user_id FROM public.organization_members om JOIN public.profiles p ON p.id = om.user_id WHERE om.organization_id = v_event.organization_id AND p.role = 'admin' LIMIT 1)
            ELSE (v_event.payload->>'verantwortlich_id')::uuid
          END,
          NULL, -- system-generiert
          (v_event.payload->>'client_id')::uuid,
          (v_event.payload->>'caregiver_id')::uuid,
          (v_event.payload->>'assignment_id')::uuid
        )
        RETURNING id INTO v_created_id;

        v_created_type := 'ops_aufgaben';
        v_result := jsonb_build_object('aufgabe_id', v_created_id);

      -- ===== BENACHRICHTIGUNG SENDEN =====
      WHEN 'benachrichtigung_senden' THEN
        INSERT INTO public.ops_benachrichtigungen (
          organization_id, empfaenger_id, titel, inhalt,
          kategorie, typ,
          bezug_typ, bezug_id
        ) VALUES (
          v_event.organization_id,
          COALESCE(
            (v_aktion.konfiguration->>'empfaenger_id')::uuid,
            CASE WHEN v_aktion.konfiguration->>'empfaenger_rolle' = 'admin'
              THEN (SELECT om.user_id FROM public.organization_members om JOIN public.profiles p ON p.id = om.user_id WHERE om.organization_id = v_event.organization_id AND p.role = 'admin' LIMIT 1)
              ELSE (v_event.payload->>'verantwortlich_id')::uuid
            END
          ),
          COALESCE(v_aktion.konfiguration->>'titel', v_regel.bezeichnung),
          COALESCE(v_aktion.konfiguration->>'nachricht', v_regel.beschreibung, ''),
          COALESCE(v_aktion.konfiguration->>'kategorie', 'system'),
          COALESCE(v_aktion.konfiguration->>'typ', 'info'),
          v_event.quell_tabelle,
          v_event.quell_id
        )
        RETURNING id INTO v_created_id;

        v_created_type := 'ops_benachrichtigungen';
        v_result := jsonb_build_object('benachrichtigung_id', v_created_id);

      -- ===== WIEDERVORLAGE ERSTELLEN =====
      WHEN 'wiedervorlage_erstellen' THEN
        INSERT INTO public.ops_wiedervorlagen (
          organization_id, titel, beschreibung,
          faellig_am, empfaenger_id, erstellt_von,
          entitaet_typ, entitaet_id, status
        ) VALUES (
          v_event.organization_id,
          COALESCE(v_aktion.konfiguration->>'titel', v_regel.bezeichnung),
          COALESCE(v_aktion.konfiguration->>'beschreibung', ''),
          CASE WHEN v_aktion.konfiguration->>'frist_tage' IS NOT NULL
            THEN now() + ((v_aktion.konfiguration->>'frist_tage')::integer || ' days')::interval
            ELSE now() + interval '14 days'
          END,
          COALESCE(
            (v_aktion.konfiguration->>'empfaenger_id')::uuid,
            (SELECT om.user_id FROM public.organization_members om JOIN public.profiles p ON p.id = om.user_id WHERE om.organization_id = v_event.organization_id AND p.role = 'admin' LIMIT 1)
          ),
          NULL,
          COALESCE(v_event.quell_tabelle, 'allgemein'),
          v_event.quell_id,
          'aktiv'
        )
        RETURNING id INTO v_created_id;

        v_created_type := 'ops_wiedervorlagen';
        v_result := jsonb_build_object('wiedervorlage_id', v_created_id);

      -- ===== ESKALATION AUSLÖSEN =====
      WHEN 'eskalation_ausloesen' THEN
        INSERT INTO public.ops_eskalationshistorie (
          organization_id, aufgabe_id, eskalationsstufe, eskaliert_an, grund
        ) VALUES (
          v_event.organization_id,
          (v_event.payload->>'aufgabe_id')::uuid,
          COALESCE((v_aktion.konfiguration->>'stufe')::integer, 1),
          COALESCE(
            (v_aktion.konfiguration->>'eskaliert_an')::uuid,
            (SELECT om.user_id FROM public.organization_members om JOIN public.profiles p ON p.id = om.user_id WHERE om.organization_id = v_event.organization_id AND p.role = 'admin' LIMIT 1)
          ),
          COALESCE(v_aktion.konfiguration->>'grund', 'Automatische Eskalation durch Workflow-Engine')
        )
        RETURNING id INTO v_created_id;

        v_created_type := 'ops_eskalationshistorie';
        v_result := jsonb_build_object('eskalation_id', v_created_id);

      -- ===== STATUS ÄNDERN =====
      WHEN 'status_aendern' THEN
        -- Generische Status-Änderung per dynamischem SQL
        -- Sicherheit: Nur erlaubte Tabellen
        IF v_event.quell_tabelle IN ('invoices','service_records','ops_aufgaben','ops_wiedervorlagen','dunning_entries') THEN
          EXECUTE format(
            'UPDATE public.%I SET %I = $1 WHERE id = $2 AND organization_id = $3',
            v_event.quell_tabelle,
            COALESCE(v_aktion.konfiguration->>'feld', 'status')
          ) USING v_aktion.konfiguration->>'neuer_wert', v_event.quell_id, v_event.organization_id;

          v_result := jsonb_build_object('tabelle', v_event.quell_tabelle, 'neuer_status', v_aktion.konfiguration->>'neuer_wert');
        ELSE
          RAISE EXCEPTION 'Status-Änderung auf Tabelle % nicht erlaubt', v_event.quell_tabelle;
        END IF;

        v_created_type := v_event.quell_tabelle;
        v_created_id := v_event.quell_id;

      -- ===== FELD AKTUALISIEREN =====
      WHEN 'feld_aktualisieren' THEN
        IF v_event.quell_tabelle IN ('invoices','service_records','caregiver_qualifications','dunning_entries','payments') THEN
          EXECUTE format(
            'UPDATE public.%I SET %I = $1 WHERE id = $2 AND organization_id = $3',
            v_event.quell_tabelle,
            v_aktion.konfiguration->>'feld'
          ) USING v_aktion.konfiguration->>'wert', v_event.quell_id, v_event.organization_id;

          v_result := jsonb_build_object('tabelle', v_event.quell_tabelle, 'feld', v_aktion.konfiguration->>'feld');
        ELSE
          RAISE EXCEPTION 'Feld-Update auf Tabelle % nicht erlaubt', v_event.quell_tabelle;
        END IF;

        v_created_type := v_event.quell_tabelle;
        v_created_id := v_event.quell_id;

      ELSE
        RAISE EXCEPTION 'Unbekannter Aktionstyp: %', v_aktion.typ;
    END CASE;

    -- Erfolg
    UPDATE public.wf_warteschlange SET status = 'erledigt', updated_at = now() WHERE id = p_queue_id;

    INSERT INTO public.wf_ausfuehrungen (
      organization_id, event_id, regel_id, aktion_id, status,
      ergebnis, erstellt_entity_typ, erstellt_entity_id, beendet_am
    ) VALUES (
      v_event.organization_id, v_item.event_id, v_item.regel_id, v_item.aktion_id,
      'erfolgreich', v_result, v_created_type, v_created_id, now()
    );

    INSERT INTO public.wf_audit_log (organization_id, typ, entitaet_typ, entitaet_id, aktion, details)
    VALUES (v_event.organization_id, 'aktion_ausgefuehrt', COALESCE(v_created_type, 'wf_aktionen'),
            COALESCE(v_created_id, v_item.aktion_id), v_aktion.typ,
            jsonb_build_object('ergebnis', v_result, 'queue_id', p_queue_id));

    v_success := true;

  EXCEPTION WHEN OTHERS THEN
    -- Fehler behandeln
    IF v_item.versuch >= v_item.max_versuche THEN
      -- Dead Letter
      UPDATE public.wf_warteschlange SET status = 'dead_letter', fehler_nachricht = SQLERRM, updated_at = now()
      WHERE id = p_queue_id;

      INSERT INTO public.wf_dead_letter (
        organization_id, warteschlange_id, event_id, regel_id, aktion_id,
        fehler_nachricht, payload, versuche
      ) VALUES (
        v_event.organization_id, p_queue_id, v_item.event_id, v_item.regel_id,
        v_item.aktion_id, SQLERRM, v_event.payload, v_item.versuch
      );

      INSERT INTO public.wf_audit_log (organization_id, typ, entitaet_typ, entitaet_id, aktion, details)
      VALUES (v_event.organization_id, 'dead_letter', 'wf_warteschlange', p_queue_id,
              'max_versuche_erreicht', jsonb_build_object('fehler', SQLERRM, 'versuche', v_item.versuch));
    ELSE
      -- Retry
      UPDATE public.wf_warteschlange
      SET status = 'wartend',
          versuch = versuch + 1,
          naechster_versuch = now() + (power(2, v_item.versuch) || ' minutes')::interval,
          fehler_nachricht = SQLERRM,
          updated_at = now()
      WHERE id = p_queue_id;

      INSERT INTO public.wf_audit_log (organization_id, typ, entitaet_typ, entitaet_id, aktion, details)
      VALUES (v_event.organization_id, 'retry', 'wf_warteschlange', p_queue_id,
              'retry_geplant', jsonb_build_object('fehler', SQLERRM, 'versuch', v_item.versuch + 1,
              'naechster', now() + (power(2, v_item.versuch) || ' minutes')::interval));
    END IF;

    INSERT INTO public.wf_ausfuehrungen (
      organization_id, event_id, regel_id, aktion_id, status, fehler_nachricht, beendet_am
    ) VALUES (
      v_event.organization_id, v_item.event_id, v_item.regel_id, v_item.aktion_id,
      'fehlgeschlagen', SQLERRM, now()
    );

    v_success := false;
  END;

  RETURN v_success;
END;
$$;

-- ============================================================
-- TEIL 13: wf_process_pending() — Batch-Verarbeitung (SECURITY DEFINER)
-- ============================================================

CREATE OR REPLACE FUNCTION public.wf_process_pending(p_limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event RECORD;
  v_queue RECORD;
  v_processed integer := 0;
  v_success integer := 0;
  v_failed integer := 0;
  v_events_processed integer := 0;
BEGIN
  -- 1. Neue Events verarbeiten (Regeln matchen → Queue befüllen)
  FOR v_event IN
    SELECT id FROM public.wf_events
    WHERE status = 'neu'
    ORDER BY
      CASE prioritaet WHEN 'kritisch' THEN 1 WHEN 'hoch' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END,
      created_at
    LIMIT p_limit
  LOOP
    PERFORM public.wf_process_event(v_event.id);
    v_events_processed := v_events_processed + 1;
  END LOOP;

  -- 2. Warteschlange abarbeiten
  FOR v_queue IN
    SELECT id FROM public.wf_warteschlange
    WHERE status = 'wartend' AND naechster_versuch <= now()
    ORDER BY prioritaet DESC, created_at
    LIMIT p_limit
  LOOP
    v_processed := v_processed + 1;
    IF public.wf_execute_queue_item(v_queue.id) THEN
      v_success := v_success + 1;
    ELSE
      v_failed := v_failed + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'events_verarbeitet', v_events_processed,
    'queue_verarbeitet', v_processed,
    'erfolgreich', v_success,
    'fehlgeschlagen', v_failed,
    'zeitpunkt', now()
  );
END;
$$;

-- ============================================================
-- TEIL 14: wf_check_fristen() — Fristenprüfung (SECURITY DEFINER)
-- Generiert Events für ablaufende Fristen, fehlende Dokumente, etc.
-- ============================================================

CREATE OR REPLACE FUNCTION public.wf_check_fristen()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  v_rec RECORD;
  v_event_id uuid;
BEGIN
  -- 1. Qualifikationen: 30 Tage vor Ablauf
  FOR v_rec IN
    SELECT cq.id, cq.organization_id, cq.caregiver_id, cq.title, cq.valid_until,
           (cq.valid_until - current_date) AS tage_verbleibend,
           cq.pflicht, cq.einsatzrelevant
    FROM public.caregiver_qualifications cq
    WHERE cq.valid_until IS NOT NULL
      AND cq.valid_until BETWEEN current_date AND current_date + 30
      AND cq.status = 'active'
  LOOP
    v_event_id := public.wf_emit_event(
      v_rec.organization_id,
      'qualifikation_laeuft_ab',
      'personal',
      'caregiver_qualifications',
      v_rec.id,
      jsonb_build_object(
        'caregiver_id', v_rec.caregiver_id,
        'titel', v_rec.title,
        'ablauf_datum', v_rec.valid_until,
        'tage_verbleibend', v_rec.tage_verbleibend,
        'pflicht', v_rec.pflicht,
        'einsatzrelevant', v_rec.einsatzrelevant
      ),
      'qualifikation_ablauf:' || v_rec.id::text || ':' || to_char(v_rec.valid_until, 'YYYY-MM-DD')
    );
    IF v_event_id IS NOT NULL THEN v_count := v_count + 1; END IF;
  END LOOP;

  -- 2. Dokumente: 30 Tage vor Ablauf (FIX: titel statt bezeichnung, client_id/caregiver_id statt akte_typ/akte_id)
  FOR v_rec IN
    SELECT d.id, d.organization_id, d.titel, d.ablaufdatum,
           (d.ablaufdatum - current_date) AS tage_verbleibend,
           d.client_id, d.caregiver_id, d.dokument_typ
    FROM public.akten_dokumente d
    WHERE d.ablaufdatum IS NOT NULL
      AND d.ablaufdatum BETWEEN current_date AND current_date + 30
      AND d.status = 'aktiv'
  LOOP
    v_event_id := public.wf_emit_event(
      v_rec.organization_id,
      'dokument_laeuft_ab',
      'dokumente',
      'akten_dokumente',
      v_rec.id,
      jsonb_build_object(
        'titel', v_rec.titel,
        'ablauf_datum', v_rec.ablaufdatum,
        'tage_verbleibend', v_rec.tage_verbleibend,
        'client_id', v_rec.client_id,
        'caregiver_id', v_rec.caregiver_id,
        'dokument_typ', v_rec.dokument_typ
      ),
      'dokument_ablauf:' || v_rec.id::text || ':' || to_char(v_rec.ablaufdatum, 'YYYY-MM-DD')
    );
    IF v_event_id IS NOT NULL THEN v_count := v_count + 1; END IF;
  END LOOP;

  -- 3. Verträge: 30 Tage vor Ablauf (FIX: titel statt bezeichnung)
  FOR v_rec IN
    SELECT v.id, v.organization_id, v.titel, v.vertragsende,
           (v.vertragsende - current_date) AS tage_verbleibend
    FROM public.akten_vertraege v
    WHERE v.vertragsende IS NOT NULL
      AND v.vertragsende BETWEEN current_date AND current_date + 30
      AND v.status = 'aktiv'
  LOOP
    v_event_id := public.wf_emit_event(
      v_rec.organization_id,
      'vertrag_laeuft_ab',
      'dokumente',
      'akten_vertraege',
      v_rec.id,
      jsonb_build_object(
        'titel', v_rec.titel,
        'vertragsende', v_rec.vertragsende,
        'tage_verbleibend', v_rec.tage_verbleibend
      ),
      'vertrag_ablauf:' || v_rec.id::text || ':' || to_char(v_rec.vertragsende, 'YYYY-MM-DD')
    );
    IF v_event_id IS NOT NULL THEN v_count := v_count + 1; END IF;
  END LOOP;

  -- 4. Überfällige Rechnungen
  FOR v_rec IN
    SELECT i.id, i.organization_id, i.invoice_number, i.due_date, i.client_id,
           (current_date - i.due_date) AS tage_ueberfaellig
    FROM public.invoices i
    WHERE i.due_date < current_date
      AND i.status IN ('sent','open','partially_paid')
  LOOP
    v_event_id := public.wf_emit_event(
      v_rec.organization_id,
      'rechnung_ueberfaellig',
      'abrechnung',
      'invoices',
      v_rec.id,
      jsonb_build_object(
        'rechnung_nr', v_rec.invoice_number,
        'faellig_am', v_rec.due_date,
        'tage_ueberfaellig', v_rec.tage_ueberfaellig,
        'client_id', v_rec.client_id
      ),
      'rechnung_ueberfaellig:' || v_rec.id::text || ':' || to_char(current_date, 'YYYY-MM-DD')
    );
    IF v_event_id IS NOT NULL THEN v_count := v_count + 1; END IF;
  END LOOP;

  -- 5. Maßnahmenplan Review fällig (gueltig_bis in 14 Tagen)
  FOR v_rec IN
    SELECT mp.id, mp.organization_id, mp.client_id, mp.gueltig_bis,
           (mp.gueltig_bis - current_date) AS tage_verbleibend
    FROM public.pflege_massnahmenplaene mp
    WHERE mp.gueltig_bis IS NOT NULL
      AND mp.gueltig_bis BETWEEN current_date AND current_date + 14
      AND mp.status = 'aktiv'
  LOOP
    v_event_id := public.wf_emit_event(
      v_rec.organization_id,
      'massnahmenplan_review_faellig',
      'pflege',
      'pflege_massnahmenplaene',
      v_rec.id,
      jsonb_build_object(
        'client_id', v_rec.client_id,
        'gueltig_bis', v_rec.gueltig_bis,
        'tage_verbleibend', v_rec.tage_verbleibend
      ),
      'massnahmenplan_review:' || v_rec.id::text || ':' || to_char(v_rec.gueltig_bis, 'YYYY-MM-DD')
    );
    IF v_event_id IS NOT NULL THEN v_count := v_count + 1; END IF;
  END LOOP;

  -- 6. Leistungsnachweise ohne Kundenunterschrift >3 Tage (FIX: date statt service_date, status draft/signed statt completed/submitted)
  FOR v_rec IN
    SELECT sr.id, sr.organization_id, sr.caregiver_id, sr.assignment_id,
           sr.date AS service_date, (current_date - sr.date) AS tage_alt
    FROM public.service_records sr
    WHERE sr.client_signature IS NULL
      AND sr.date < current_date - 3
      AND sr.status IN ('draft','signed')
  LOOP
    v_event_id := public.wf_emit_event(
      v_rec.organization_id,
      'leistungsnachweis_nicht_unterschrieben',
      'einsatz',
      'service_records',
      v_rec.id,
      jsonb_build_object(
        'caregiver_id', v_rec.caregiver_id,
        'assignment_id', v_rec.assignment_id,
        'service_date', v_rec.service_date,
        'tage_alt', v_rec.tage_alt
      ),
      'ln_unsigned:' || v_rec.id::text || ':' || to_char(current_date, 'YYYY-MM-DD')
    );
    IF v_event_id IS NOT NULL THEN v_count := v_count + 1; END IF;
  END LOOP;

  -- Audit
  INSERT INTO public.wf_audit_log (
    organization_id, typ, entitaet_typ, entitaet_id, aktion, details
  ) SELECT
    (SELECT id FROM public.organizations LIMIT 1),
    'fristen_check', 'system', gen_random_uuid(), 'fristen_geprueft',
    jsonb_build_object('neue_events', v_count, 'zeitpunkt', now());

  RETURN jsonb_build_object('neue_events', v_count, 'zeitpunkt', now());
END;
$$;

-- ============================================================
-- TEIL 15: Source-Table Triggers (Event-Emitter auf bestehende Tabellen)
-- ============================================================

-- DTA-Rückläufer eingetragen → Event
CREATE OR REPLACE FUNCTION public.wf_trigger_dta_ruecklaeufer()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.wf_emit_event(
    NEW.organization_id,
    'dta_ruecklaeufer_eingegangen',
    'dakota',
    'dta_ruecklaeufer',
    NEW.id,
    jsonb_build_object(
      'status', NEW.status,
      'lauf_id', NEW.lauf_id,
      'invoice_id', NEW.invoice_id,
      'fehler_code', NEW.fehler_code,
      'fehler_text', NEW.fehler_text
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wf_dta_ruecklaeufer ON public.dta_ruecklaeufer;
CREATE TRIGGER trg_wf_dta_ruecklaeufer
  AFTER INSERT ON public.dta_ruecklaeufer
  FOR EACH ROW EXECUTE FUNCTION public.wf_trigger_dta_ruecklaeufer();

-- DTA-Fehlerprotokoll → Event
CREATE OR REPLACE FUNCTION public.wf_trigger_dta_fehler()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.wf_emit_event(
    NEW.organization_id,
    'dta_fehler_aufgetreten',
    'dakota',
    'dta_fehlerprotokoll',
    NEW.id,
    jsonb_build_object('fehler_code', NEW.fehler_code, 'fehler_text', NEW.fehler_text, 'schwere', NEW.schwere)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wf_dta_fehler ON public.dta_fehlerprotokoll;
CREATE TRIGGER trg_wf_dta_fehler
  AFTER INSERT ON public.dta_fehlerprotokoll
  FOR EACH ROW EXECUTE FUNCTION public.wf_trigger_dta_fehler();

-- Zahlungseingang → Event
CREATE OR REPLACE FUNCTION public.wf_trigger_zahlung()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.wf_emit_event(
    NEW.organization_id,
    'zahlung_eingegangen',
    'forderungen',
    'payments',
    NEW.id,
    jsonb_build_object('amount_cents', NEW.amount_cents, 'invoice_id', NEW.invoice_id)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wf_zahlung ON public.payments;
CREATE TRIGGER trg_wf_zahlung
  AFTER INSERT ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.wf_trigger_zahlung();

-- Dienstplan-Eintrag erstellt → Event
CREATE OR REPLACE FUNCTION public.wf_trigger_dienstplan()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.wf_emit_event(
    NEW.organization_id,
    'einsatz_geplant',
    'einsatz',
    'dienstplan_eintraege',
    NEW.id,
    jsonb_build_object(
      'datum', NEW.datum,
      'start_zeit', NEW.start_zeit,
      'caregiver_id', NEW.caregiver_id
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wf_dienstplan ON public.dienstplan_eintraege;
CREATE TRIGGER trg_wf_dienstplan
  AFTER INSERT ON public.dienstplan_eintraege
  FOR EACH ROW EXECUTE FUNCTION public.wf_trigger_dienstplan();

-- Aufgabe wird überfällig (Status-Änderung) → Event
CREATE OR REPLACE FUNCTION public.wf_trigger_aufgabe_ueberfaellig()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'ueberfaellig' AND (OLD.status IS NULL OR OLD.status != 'ueberfaellig') THEN
    PERFORM public.wf_emit_event(
      NEW.organization_id,
      'aufgabe_ueberfaellig',
      'aufgaben',
      'ops_aufgaben',
      NEW.id,
      jsonb_build_object(
        'titel', NEW.titel,
        'verantwortlich_id', NEW.verantwortlich_id,
        'faellig_am', NEW.faellig_am,
        'aufgabe_id', NEW.id
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wf_aufgabe_ueberfaellig ON public.ops_aufgaben;
CREATE TRIGGER trg_wf_aufgabe_ueberfaellig
  AFTER UPDATE ON public.ops_aufgaben
  FOR EACH ROW EXECUTE FUNCTION public.wf_trigger_aufgabe_ueberfaellig();

-- ============================================================
-- TEIL 16: Views
-- ============================================================

-- Dashboard: Events + Verarbeitung
CREATE OR REPLACE VIEW public.wf_events_dashboard AS
SELECT
  e.id,
  e.event_typ,
  e.modul,
  e.quell_tabelle,
  e.quell_id,
  e.status,
  e.prioritaet,
  e.retry_count,
  e.ausgeloest_am,
  e.verarbeitet_am,
  e.fehler_nachricht,
  e.organization_id,
  (SELECT COUNT(*) FROM public.wf_ausfuehrungen a WHERE a.event_id = e.id AND a.status = 'erfolgreich') AS erfolgreiche_aktionen,
  (SELECT COUNT(*) FROM public.wf_ausfuehrungen a WHERE a.event_id = e.id AND a.status = 'fehlgeschlagen') AS fehlgeschlagene_aktionen
FROM public.wf_events e
ORDER BY e.created_at DESC;

-- Queue-Status
CREATE OR REPLACE VIEW public.wf_queue_status AS
SELECT
  w.id,
  w.status,
  w.versuch,
  w.max_versuche,
  w.naechster_versuch,
  w.fehler_nachricht,
  w.prioritaet,
  w.organization_id,
  e.event_typ,
  e.modul,
  r.bezeichnung AS regel_name,
  a.typ AS aktion_typ,
  w.created_at
FROM public.wf_warteschlange w
JOIN public.wf_events e ON e.id = w.event_id
JOIN public.wf_regeln r ON r.id = w.regel_id
JOIN public.wf_aktionen a ON a.id = w.aktion_id
ORDER BY w.created_at DESC;

-- Dead-Letter-Übersicht
CREATE OR REPLACE VIEW public.wf_dead_letter_uebersicht AS
SELECT
  dl.id,
  dl.fehler_nachricht,
  dl.versuche,
  dl.manuell_wiederholt,
  dl.wiederholt_am,
  dl.organization_id,
  e.event_typ,
  e.modul,
  r.bezeichnung AS regel_name,
  a.typ AS aktion_typ,
  dl.created_at
FROM public.wf_dead_letter dl
JOIN public.wf_events e ON e.id = dl.event_id
JOIN public.wf_regeln r ON r.id = dl.regel_id
JOIN public.wf_aktionen a ON a.id = dl.aktion_id
ORDER BY dl.created_at DESC;

-- Workflow-Statistik
CREATE OR REPLACE VIEW public.wf_statistik AS
SELECT
  o.id AS organization_id,
  (SELECT COUNT(*) FROM public.wf_events WHERE organization_id = o.id) AS total_events,
  (SELECT COUNT(*) FROM public.wf_events WHERE organization_id = o.id AND status = 'neu') AS offene_events,
  (SELECT COUNT(*) FROM public.wf_events WHERE organization_id = o.id AND status = 'verarbeitet') AS verarbeitete_events,
  (SELECT COUNT(*) FROM public.wf_events WHERE organization_id = o.id AND status = 'fehlgeschlagen') AS fehlerhafte_events,
  (SELECT COUNT(*) FROM public.wf_warteschlange WHERE organization_id = o.id AND status = 'wartend') AS queue_wartend,
  (SELECT COUNT(*) FROM public.wf_dead_letter WHERE organization_id = o.id AND manuell_wiederholt = false) AS dead_letter_offen,
  (SELECT COUNT(*) FROM public.wf_regeln WHERE organization_id = o.id AND aktiv = true) AS aktive_regeln,
  (SELECT COUNT(*) FROM public.wf_ausfuehrungen WHERE organization_id = o.id AND status = 'erfolgreich') AS erfolgreiche_ausfuehrungen
FROM public.organizations o;

-- ============================================================
-- TEIL 17: SECURITY DEFINER — REVOKE/GRANT (Defense in Depth)
-- ============================================================
-- Alle SECURITY DEFINER-Funktionen dürfen NUR von service_role
-- aufgerufen werden. Ohne diese Grants sind sie per Default
-- für anon/authenticated aufrufbar (PostgreSQL DEFAULT PRIVILEGES).
-- ============================================================

DO $revoke_grant$
DECLARE
  fn text;
BEGIN
  FOR fn IN SELECT unnest(ARRAY[
    'wf_emit_event(text, text, text, text, uuid, jsonb)',
    'wf_process_event(uuid)',
    'wf_execute_queue_item(uuid)',
    'wf_process_pending(integer)',
    'wf_check_fristen()',
    'next_billing_number(uuid, text)'
  ])
  LOOP
    BEGIN
      EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', fn);
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', fn);
    EXCEPTION WHEN undefined_function THEN
      NULL;
    END;
  END LOOP;
END
$revoke_grant$;

-- ============================================================
-- MIGRATION COMPLETE
-- ============================================================
