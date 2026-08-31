-- Rollback zu 20261021000004_is_internal_staff_ohne_buero.sql
--
-- Stellt `buero` in der Vertrauensliste wieder her. Das ist die Fassung,
-- die vom CHECK auf profiles.role nie zugelassen war — es gibt praktisch
-- keinen Grund, sie zu wollen. Die Datei existiert, weil zu jeder
-- Migration eine Umkehrung gehoert (docs/MIGRATION_LEDGER.md).

CREATE OR REPLACE FUNCTION public.is_internal_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role = ANY (ARRAY['admin', 'superadmin', 'pdl', 'buero'])
  );
$function$;

REVOKE ALL ON FUNCTION public.is_internal_staff() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_internal_staff() TO authenticated, service_role;
