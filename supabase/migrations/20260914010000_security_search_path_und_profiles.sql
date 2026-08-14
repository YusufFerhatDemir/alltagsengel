-- ═══════════════════════════════════════════════════════════════════════════
-- Security-Haertung: search_path + profiles_select_engels
-- Datum:  2026-08-14
-- ═══════════════════════════════════════════════════════════════════════════
--
-- BEFUND 3a: profiles_select_engels (PII-Leck)
--   Die Policy erlaubt jedem authenticated User alle Spalten aller
--   Engel-Profile zu lesen (email, phone, last_name, postal_code).
--   get_engel_cards() (20260705) existiert bereits als sicherer Ersatz
--   und liefert nur first_name, last_name, latitude, longitude.
--   Admin-Seiten haben eigene breitere Policies.
--
-- BEFUND 3b: search_path bei SECURITY DEFINER Funktionen
--   Vier Trigger-Funktionen haben kein SET search_path = public:
--     - check_aufgabe_eskalation     (20260812010000)
--     - create_recurring_aufgabe     (20260812010000)
--     - compute_signature_hash       (20260814010000)
--     - prevent_locked_record_change (20260814010000)
--   audit_service_record_change hat bereits SET search_path TO 'public'.
--
-- Idempotent: DROP IF EXISTS + CREATE OR REPLACE.
-- ROLLBACK: 20260914010001_rollback_security_search_path_und_profiles.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══ TEIL 1: profiles_select_engels droppen ═══

DROP POLICY IF EXISTS "profiles_select_engels" ON public.profiles;

-- ═══ TEIL 2: search_path fuer SECURITY DEFINER Funktionen setzen ═══

-- 2a) check_aufgabe_eskalation
CREATE OR REPLACE FUNCTION public.check_aufgabe_eskalation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_regel RECORD;
  v_stunden_ueberfaellig numeric;
BEGIN
  IF NEW.status NOT IN ('offen', 'in_bearbeitung', 'warten') THEN
    RETURN NEW;
  END IF;

  IF NEW.faellig_am IS NULL OR NEW.faellig_am >= CURRENT_DATE THEN
    RETURN NEW;
  END IF;

  v_stunden_ueberfaellig := EXTRACT(EPOCH FROM (now() - (NEW.faellig_am::timestamp + interval '23:59:59'))) / 3600;

  SELECT * INTO v_regel
  FROM public.ops_eskalationsregeln
  WHERE organization_id = NEW.organization_id
    AND aktiv = true
    AND v_stunden_ueberfaellig >= ueberfaellig_stunden
    AND eskalationsstufe > NEW.eskalationsstufe
    AND (aufgaben_kategorie IS NULL OR aufgaben_kategorie = NEW.kategorie)
    AND (aufgaben_prioritaet IS NULL OR aufgaben_prioritaet = NEW.prioritaet)
  ORDER BY eskalationsstufe DESC
  LIMIT 1;

  IF v_regel IS NOT NULL THEN
    NEW.eskalationsstufe := v_regel.eskalationsstufe;
    NEW.eskaliert_am := now();
    NEW.eskaliert_an := v_regel.eskalation_an_user_id;

    INSERT INTO public.ops_eskalationshistorie (
      organization_id, aufgabe_id, regel_id, eskalationsstufe,
      eskaliert_an, grund
    ) VALUES (
      NEW.organization_id, NEW.id, v_regel.id, v_regel.eskalationsstufe,
      v_regel.eskalation_an_user_id,
      'Automatische Eskalation: ' || v_stunden_ueberfaellig::integer || ' Stunden ueberfaellig'
    );

    IF v_regel.benachrichtigung_senden AND v_regel.eskalation_an_user_id IS NOT NULL THEN
      INSERT INTO public.ops_benachrichtigungen (
        organization_id, empfaenger_id, titel, inhalt, typ, kategorie,
        bezug_typ, bezug_id, link
      ) VALUES (
        NEW.organization_id, v_regel.eskalation_an_user_id,
        'Eskalation Stufe ' || v_regel.eskalationsstufe || ': ' || NEW.titel,
        'Aufgabe "' || NEW.titel || '" ist seit ' || v_stunden_ueberfaellig::integer || ' Stunden ueberfaellig.',
        'eskalation', 'eskalation',
        'aufgabe', NEW.id,
        '/admin/aufgaben/' || NEW.id
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 2b) create_recurring_aufgabe
CREATE OR REPLACE FUNCTION public.create_recurring_aufgabe()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_naechstes date;
BEGIN
  IF NEW.status <> 'erledigt' OR OLD.status = 'erledigt' THEN
    RETURN NEW;
  END IF;

  IF NOT NEW.ist_wiederkehrend OR NEW.wiederholung_intervall IS NULL THEN
    RETURN NEW;
  END IF;

  v_naechstes := COALESCE(NEW.wiederholung_naechstes, NEW.faellig_am, CURRENT_DATE);

  CASE NEW.wiederholung_intervall
    WHEN 'taeglich' THEN v_naechstes := v_naechstes + interval '1 day';
    WHEN 'woechentlich' THEN v_naechstes := v_naechstes + interval '1 week';
    WHEN 'monatlich' THEN v_naechstes := v_naechstes + interval '1 month';
    WHEN 'quartalsweise' THEN v_naechstes := v_naechstes + interval '3 months';
    WHEN 'jaehrlich' THEN v_naechstes := v_naechstes + interval '1 year';
    ELSE RETURN NEW;
  END CASE;

  IF NEW.wiederholung_ende IS NOT NULL AND v_naechstes > NEW.wiederholung_ende THEN
    NEW.ist_wiederkehrend := false;
    RETURN NEW;
  END IF;

  INSERT INTO public.ops_aufgaben (
    organization_id, titel, beschreibung, kategorie, prioritaet,
    verantwortlich_id, stellvertreter_id, erstellt_von,
    faellig_am, client_id, caregiver_id, assignment_id,
    ist_wiederkehrend, wiederholung_intervall, wiederholung_naechstes,
    wiederholung_ende, wiederholung_vorlage_id,
    tags, metadata
  ) VALUES (
    NEW.organization_id, NEW.titel, NEW.beschreibung, NEW.kategorie, NEW.prioritaet,
    NEW.verantwortlich_id, NEW.stellvertreter_id, NEW.erstellt_von,
    v_naechstes, NEW.client_id, NEW.caregiver_id, NEW.assignment_id,
    true, NEW.wiederholung_intervall, v_naechstes + (v_naechstes - COALESCE(NEW.faellig_am, CURRENT_DATE)),
    NEW.wiederholung_ende, COALESCE(NEW.wiederholung_vorlage_id, NEW.id),
    NEW.tags, NEW.metadata
  );

  RETURN NEW;
END;
$$;

-- 2c) compute_signature_hash
CREATE OR REPLACE FUNCTION public.compute_signature_hash()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.proof_status = 'UNTERSCHRIEBEN' AND NEW.client_signed_at IS NOT NULL THEN
    NEW.signature_hash := encode(
      extensions.digest(
        COALESCE(NEW.id::text, '') || '|' ||
        COALESCE(NEW.client_id::text, '') || '|' ||
        COALESCE(NEW.date::text, '') || '|' ||
        COALESCE(NEW.start_time::text, '') || '|' ||
        COALESCE(NEW.end_time::text, '') || '|' ||
        COALESCE(NEW.amount::text, '') || '|' ||
        COALESCE(NEW.client_signed_at::text, ''),
        'sha256'
      ),
      'hex'
    );
    NEW.is_locked := true;
  END IF;
  RETURN NEW;
END;
$$;

-- 2d) prevent_locked_record_change
CREATE OR REPLACE FUNCTION public.prevent_locked_record_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.is_locked = true THEN
    IF NEW.proof_status = 'STORNIERT' THEN
      RETURN NEW;
    END IF;
    IF NEW.is_locked IS DISTINCT FROM OLD.is_locked AND NEW.is_locked = false THEN
      IF EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','superadmin')) THEN
        RETURN NEW;
      END IF;
    END IF;
    RAISE EXCEPTION 'Leistungsnachweis ist gesperrt -- Aenderungen sind nicht mehr moeglich.'
      USING HINT = 'Manipulationsschutz aktiv';
  END IF;
  RETURN NEW;
END;
$$;

COMMIT;
