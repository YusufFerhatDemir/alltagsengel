-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK: 20260921030000_fix_eskalation_rolle_resolution.sql
-- Stellt den Funktionsstand aus 20260914010000_security_search_path_und_profiles.sql
-- wieder her (nur eskalation_an_user_id wird berücksichtigt, eskalation_an_rolle
-- bleibt wirkungslos).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

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

COMMIT;
