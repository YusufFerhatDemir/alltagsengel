-- eigene_client_ids(): SECURITY DEFINER Helper analog zu eigene_caregiver_ids()
-- Bricht den Policy-Zyklus assignments → clients → profiles

CREATE OR REPLACE FUNCTION public.eigene_client_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT id FROM public.clients WHERE user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.eigene_client_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.eigene_client_ids() TO authenticated, service_role;
