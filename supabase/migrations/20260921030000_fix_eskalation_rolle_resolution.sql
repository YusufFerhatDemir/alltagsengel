-- ═══════════════════════════════════════════════════════════════════════════
-- FIX: Eskalationsregel "an Rolle" wird nie aufgelöst
-- Datum:  2026-09-21
-- ═══════════════════════════════════════════════════════════════════════════
--
-- BEFUND (Audit Modul 21 "Eskalationssystem"):
--   ops_eskalationsregeln.eskalation_an_rolle ist das einzige Feld, das die
--   Admin-UI (app/admin/eskalationen/page.tsx) zum Wählen des Eskalations-
--   ziels anbietet — eskalation_an_user_id ist in der UI nirgends setzbar.
--   check_aufgabe_eskalation() (20260812010000, zuletzt neu erstellt in
--   20260914010000) liest aber AUSSCHLIESSLICH v_regel.eskalation_an_user_id
--   für NEW.eskaliert_an, die Historie und die Benachrichtigung.
--   Ergebnis: JEDE über die UI angelegte Regel eskaliert NIEMALS an jemanden
--   — ops_eskalationshistorie bekommt zwar einen Eintrag mit eskaliert_an =
--   NULL, aber es wird nie eine Benachrichtigung erzeugt und niemand erfährt
--   von der Eskalation.
--
--   Zusatzbefund: eskalation_an_rolle erlaubt 'admin' | 'pdl' |
--   'geschaeftsfuehrung' (CHECK ops_eskalation_rolle_check), aber
--   public.profiles.role kennt nur 'kunde','engel','admin','superadmin',
--   'fahrer' (siehe 20250101000000_core_tables_baseline.sql) — es gibt keine
--   eigene PDL- oder Geschäftsführungs-Rolle im Auth-Modell. Der Rest der
--   Codebase behandelt das bereits so (lib/automation/org-empfaenger.ts ::
--   ersterPdlDerOrg() sucht 'admin'/'superadmin' als PDL-Stellvertretung).
--   Dieser Fix übernimmt dieselbe Konvention: 'pdl' und 'admin' lösen zu
--   admin/superadmin auf, 'geschaeftsfuehrung' bevorzugt superadmin (mit
--   admin-Fallback, falls kein superadmin in der Organisation existiert).
--   Eine trennscharfe PDL-/GF-Rolle ist NICHT Teil dieses Fixes — das wäre
--   eine Rollenmodell-Erweiterung, kein kleiner Bugfix.
--
-- FIX:
--   check_aufgabe_eskalation() löst eskalation_an_rolle jetzt über
--   organization_members + profiles auf, wenn kein expliziter
--   eskalation_an_user_id gesetzt ist. Benachrichtigt werden ALLE
--   passenden Rollenträger der Organisation (nicht nur der erste), damit
--   eine Eskalation "an Rolle" niemanden übersieht. eskaliert_an auf der
--   Aufgabe/Historie bleibt ein einzelner Datensatz (erster Treffer nach
--   Rollen-Präferenz) für die bisherige Anzeige.
--
-- Idempotent: CREATE OR REPLACE.
-- ROLLBACK: 20260921030001_rollback_fix_eskalation_rolle_resolution.sql
-- STATUS: wartet auf Live-Apply (kein DDL-Zugriff in dieser Session).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION public.check_aufgabe_eskalation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_regel RECORD;
  v_stunden_ueberfaellig numeric;
  v_rollen text[];
  v_empfaenger_id uuid;
  v_notify_user_id uuid;
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

    -- Empfänger bestimmen: expliziter User hat Vorrang vor Rolle.
    v_empfaenger_id := NULL;
    v_rollen := NULL;
    IF v_regel.eskalation_an_user_id IS NOT NULL THEN
      v_empfaenger_id := v_regel.eskalation_an_user_id;
    ELSIF v_regel.eskalation_an_rolle IS NOT NULL THEN
      v_rollen := CASE v_regel.eskalation_an_rolle
        WHEN 'geschaeftsfuehrung' THEN ARRAY['superadmin', 'admin']
        ELSE ARRAY['admin', 'superadmin']
      END;

      SELECT p.id INTO v_empfaenger_id
      FROM public.organization_members om
      JOIN public.profiles p ON p.id = om.user_id
      WHERE om.organization_id = NEW.organization_id
        AND p.role = ANY(v_rollen)
        AND p.deleted_at IS NULL
      ORDER BY array_position(v_rollen, p.role)
      LIMIT 1;
    END IF;

    NEW.eskaliert_an := v_empfaenger_id;

    INSERT INTO public.ops_eskalationshistorie (
      organization_id, aufgabe_id, regel_id, eskalationsstufe,
      eskaliert_an, grund
    ) VALUES (
      NEW.organization_id, NEW.id, v_regel.id, v_regel.eskalationsstufe,
      v_empfaenger_id,
      'Automatische Eskalation: ' || v_stunden_ueberfaellig::integer || ' Stunden ueberfaellig'
    );

    IF v_regel.benachrichtigung_senden THEN
      IF v_regel.eskalation_an_user_id IS NOT NULL THEN
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
      ELSIF v_rollen IS NOT NULL THEN
        -- Alle passenden Rollenträger benachrichtigen, nicht nur den ersten.
        FOR v_notify_user_id IN
          SELECT p.id
          FROM public.organization_members om
          JOIN public.profiles p ON p.id = om.user_id
          WHERE om.organization_id = NEW.organization_id
            AND p.role = ANY(v_rollen)
            AND p.deleted_at IS NULL
        LOOP
          INSERT INTO public.ops_benachrichtigungen (
            organization_id, empfaenger_id, titel, inhalt, typ, kategorie,
            bezug_typ, bezug_id, link
          ) VALUES (
            NEW.organization_id, v_notify_user_id,
            'Eskalation Stufe ' || v_regel.eskalationsstufe || ': ' || NEW.titel,
            'Aufgabe "' || NEW.titel || '" ist seit ' || v_stunden_ueberfaellig::integer || ' Stunden ueberfaellig.',
            'eskalation', 'eskalation',
            'aufgabe', NEW.id,
            '/admin/aufgaben/' || NEW.id
          );
        END LOOP;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;
