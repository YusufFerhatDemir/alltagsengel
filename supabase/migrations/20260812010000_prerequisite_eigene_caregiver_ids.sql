-- Prerequisite: eigene_caregiver_ids() SECURITY DEFINER Helper
-- Benötigt von vitalwerte, wunddokumentation, medikamentenmanagement RLS
-- Funktion definiert in tourenplanung.sql, aber diese Migration ist nicht Teil der 20 Staging-Migrationen
-- Daher hier als eigenständige Migration erstellt.

CREATE OR REPLACE FUNCTION public.eigene_caregiver_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT id FROM public.caregivers WHERE user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.eigene_caregiver_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.eigene_caregiver_ids() TO authenticated, service_role;
