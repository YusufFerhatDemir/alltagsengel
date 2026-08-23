-- ═══════════════════════════════════════════════════════════════════════
-- Rollback zu 20260924000000_rollenkonzept_least_privilege.sql
--
-- ACHTUNG: Der letzte Schritt (CHECK-Constraint zurueckdrehen) schlaegt
-- fehl, sobald es bereits Konten mit role pdl/qm/buchhaltung/angehoerige
-- gibt. Das ist Absicht — ein Rollback darf nicht stillschweigend Konten
-- unbrauchbar machen. In dem Fall zuerst die Rollen umsetzen, dann
-- erneut ausfuehren.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- 1) Alle Policies des Rollenkonzepts entfernen
DO $$
DECLARE
  p record;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND policyname LIKE 'rk\_%'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', p.policyname, p.schemaname, p.tablename);
  END LOOP;
END;
$$;

-- 2) Trigger-Haertung zurueck auf den Stand von 20260808170000
CREATE OR REPLACE FUNCTION public.prevent_privileged_role_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.role IS NULL OR NEW.role <> ALL (ARRAY['admin', 'superadmin']) THEN
    RETURN NEW;
  END IF;
  IF coalesce(current_setting('request.jwt.claims', true), '') = '' THEN
    RETURN NEW;
  END IF;
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Anlegen eines Administrator-Profils nicht erlaubt';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.role IS NOT DISTINCT FROM OLD.role THEN
    RETURN NEW;
  END IF;
  IF coalesce(current_setting('request.jwt.claims', true), '') = '' THEN
    RETURN NEW;
  END IF;
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Rollenwechsel nicht erlaubt';
  END IF;
  RETURN NEW;
END;
$$;

-- 3) Funktionen entfernen
DROP FUNCTION IF EXISTS public.darf(text);
DROP FUNCTION IF EXISTS public.ist_verwaltung();
DROP FUNCTION IF EXISTS public.rollen_matrix(text);
DROP FUNCTION IF EXISTS public.aktuelle_rolle();

-- 4) Rollenkatalog zurueck auf den Baseline-Stand
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('kunde', 'engel', 'admin', 'superadmin', 'fahrer'));

COMMIT;
