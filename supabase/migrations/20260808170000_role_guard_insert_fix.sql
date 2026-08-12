-- ════════════════════════════════════════════════════════════════════════════
-- Migration: Eigener Wächter für INSERT auf profiles
-- Datum:     2026-08-08
-- Branch:    staging/expansion-abnahme
-- Voraussetzung: 20260804140000_missing_production_triggers.sql
--
-- BEFUND (Phase-5-Browserabnahme)
--   20260804140000 hängt public.prevent_role_escalation() zusätzlich als
--   BEFORE INSERT an public.profiles. Die Funktion ist aber für UPDATE
--   geschrieben; ihre erste Zeile lautet
--       IF NEW.role IS NOT DISTINCT FROM OLD.role THEN RETURN NEW; END IF;
--   Bei einem INSERT ist OLD immer NULL. Der Vergleich ist damit IMMER
--   falsch, die Funktion fällt durch bis
--       IF NOT public.is_admin() THEN RAISE EXCEPTION 'Rollenwechsel nicht erlaubt';
--   und wirft für JEDE Rolle — auch für 'kunde'.
--
--   Wirkung: ein angemeldeter Kunde kann seine eigene Profilzeile nicht
--   anlegen. Betroffen ist der PostgREST-Upsert (INSERT … ON CONFLICT
--   feuert den BEFORE-INSERT-Trigger) aus
--       app/auth/register/page.tsx  und  lib/pending-profile.ts.
--   Nachgewiesen auf Staging: Registrierung mit PLZ 80331/München →
--   „Rollenwechsel nicht erlaubt", PLZ und Ort landen nie im Profil.
--   Ohne PLZ fällt die Bundesland-Erkennung auf „unbekannt" zurück; der
--   Kunde sieht dauerhaft den Verfahrenshinweis und der Umkreis-Filter
--   findet keine Engel.
--
--   Die ABSICHT des Triggers laut 20260804140000 war enger:
--   „Verhindert, dass ein Nicht-Superadmin direkt ein Profil mit
--    role='admin' oder role='superadmin' anlegt."
--   Genau das — und nur das — setzt der neue Wächter um.
--
-- Der UPDATE-Trigger bleibt unverändert.
--
-- KEINE Datenaenderung. KEINE Production-Migration.
-- Rollback: 20260808170001_rollback_role_guard_insert_fix.sql
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.prevent_privileged_role_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Nicht-privilegierte Rollen darf jeder für sich selbst anlegen.
  -- Welche Zeile das sein darf, regelt die RLS-Policy auf profiles —
  -- dieser Trigger entscheidet ausschliesslich über die Rolle.
  IF NEW.role IS NULL OR NEW.role <> ALL (ARRAY['admin', 'superadmin']) THEN
    RETURN NEW;
  END IF;

  -- Kein JWT → service_role, Migration oder Seed. Diese Wege müssen
  -- Admin-Profile anlegen können; ihr Schutz ist der Service-Role-Key.
  IF coalesce(current_setting('request.jwt.claims', true), '') = '' THEN
    RETURN NEW;
  END IF;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Anlegen eines Administrator-Profils nicht erlaubt';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.prevent_privileged_role_insert() IS
  'BEFORE INSERT auf profiles: blockiert nur role=admin/superadmin durch '
  'Nicht-Admins. Ersetzt die Fehlnutzung von prevent_role_escalation(), '
  'die auf INSERT jede Rolle abwies (OLD ist dort NULL).';

DROP TRIGGER IF EXISTS trg_prevent_role_escalation_insert ON public.profiles;
DROP TRIGGER IF EXISTS trg_prevent_privileged_role_insert ON public.profiles;
CREATE TRIGGER trg_prevent_privileged_role_insert
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_privileged_role_insert();
