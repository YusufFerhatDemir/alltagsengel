-- ============================================================
-- Migration: P0 Race Condition Fixes
-- Datum: 2026-08-10
-- Beschreibung:
--   1. abrechnungslaeufe.idempotency_key + UNIQUE (Duplikat-Schutz)
--   2. wf_process_event() CAS-Bedingung (Concurrent State Transition)
--   3. wf_execute_queue_item() CAS-Bedingung (Concurrent State Transition)
-- ============================================================

-- ============================================================
-- FIX 1: Abrechnungslauf-Duplikate (P0-16)
-- idempotency_key verhindert doppelte Erstellung durch parallele Requests
-- ============================================================

ALTER TABLE public.abrechnungslaeufe
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_abrechnungslaeufe_idempotency
  ON public.abrechnungslaeufe (idempotency_key)
  WHERE idempotency_key IS NOT NULL AND status NOT IN ('storniert', 'abgelehnt');

-- ============================================================
-- FIX 2: wf_process_event() — CAS statt TOCTOU (P0-17a)
-- SELECT ... AND status='neu' + UPDATE ohne Bedingung =
--   zwei concurrent Calls verarbeiten dasselbe Event doppelt.
-- Fix: UPDATE ... WHERE status='neu' RETURNING, Skip wenn 0 Zeilen.
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
  v_claimed_id uuid;
BEGIN
  -- CAS: atomically claim the event
  UPDATE public.wf_events
    SET status = 'in_bearbeitung'
    WHERE id = p_event_id AND status = 'neu'
    RETURNING id INTO v_claimed_id;

  IF v_claimed_id IS NULL THEN RETURN 0; END IF;

  -- Event laden (status ist jetzt 'in_bearbeitung')
  SELECT * INTO v_event FROM public.wf_events WHERE id = p_event_id;

  -- Passende Regeln suchen
  FOR v_regel IN
    SELECT * FROM public.wf_regeln
    WHERE event_typ = v_event.event_typ
      AND organization_id = v_event.organization_id
      AND aktiv = true
    ORDER BY prioritaet DESC
  LOOP
    -- Cooldown pruefen
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

    -- Max-Ausfuehrungen pruefen
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
      INSERT INTO public.wf_audit_log (organization_id, typ, entitaet_typ, entitaet_id, aktion, details)
      VALUES (v_event.organization_id, 'regel_ausgewertet', 'wf_regeln', v_regel.id,
              'bedingung_nicht_erfuellt', jsonb_build_object('event_id', p_event_id));
      CONTINUE;
    END IF;

    -- Aktionen der Regel ausfuehren
    FOR v_aktion IN
      SELECT * FROM public.wf_aktionen
      WHERE regel_id = v_regel.id AND aktiv = true
      ORDER BY reihenfolge
    LOOP
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
-- FIX 3: wf_execute_queue_item() — CAS statt TOCTOU (P0-17b)
-- Selbes Pattern: SELECT WHERE status='wartend' dann UPDATE ohne Bedingung.
-- Fix: UPDATE ... WHERE status='wartend' RETURNING als atomarer Claim.
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
  v_claimed_id uuid;
BEGIN
  -- CAS: atomically claim the queue item
  UPDATE public.wf_warteschlange
    SET status = 'in_bearbeitung', updated_at = now()
    WHERE id = p_queue_id AND status = 'wartend'
    RETURNING id INTO v_claimed_id;

  IF v_claimed_id IS NULL THEN RETURN false; END IF;

  -- Queue-Item laden (status ist jetzt 'in_bearbeitung')
  SELECT * INTO v_item FROM public.wf_warteschlange WHERE id = p_queue_id;

  -- Aktion, Event, Regel laden
  SELECT * INTO v_aktion FROM public.wf_aktionen WHERE id = v_item.aktion_id;
  SELECT * INTO v_event FROM public.wf_events WHERE id = v_item.event_id;
  SELECT * INTO v_regel FROM public.wf_regeln WHERE id = v_item.regel_id;

  BEGIN
    CASE v_aktion.typ
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
          NULL,
          (v_event.payload->>'client_id')::uuid,
          (v_event.payload->>'caregiver_id')::uuid,
          (v_event.payload->>'assignment_id')::uuid
        )
        RETURNING id INTO v_created_id;

        v_created_type := 'ops_aufgaben';
        v_result := jsonb_build_object('aufgabe_id', v_created_id);

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

      WHEN 'status_aendern' THEN
        IF v_event.quell_tabelle IN ('invoices','service_records','ops_aufgaben','ops_wiedervorlagen','dunning_entries') THEN
          EXECUTE format(
            'UPDATE public.%I SET %I = $1 WHERE id = $2 AND organization_id = $3',
            v_event.quell_tabelle,
            COALESCE(v_aktion.konfiguration->>'feld', 'status')
          ) USING v_aktion.konfiguration->>'neuer_wert', v_event.quell_id, v_event.organization_id;

          v_result := jsonb_build_object('tabelle', v_event.quell_tabelle, 'neuer_status', v_aktion.konfiguration->>'neuer_wert');
        ELSE
          RAISE EXCEPTION 'Status-Aenderung auf Tabelle % nicht erlaubt', v_event.quell_tabelle;
        END IF;

        v_created_type := v_event.quell_tabelle;
        v_created_id := v_event.quell_id;

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
    IF v_item.versuch >= v_item.max_versuche THEN
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

-- Re-apply REVOKE/GRANT for the replaced functions
-- REVOKEs grouped before GRANTs to avoid false positives in the SECDEF regression test
REVOKE ALL ON FUNCTION public.wf_process_event(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.wf_execute_queue_item(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wf_process_event(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.wf_execute_queue_item(uuid) TO service_role;
