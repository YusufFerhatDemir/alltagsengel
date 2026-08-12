-- Fix: handle_new_user() akzeptierte beliebige Rollen aus user_metadata,
-- inkl. 'admin'/'superadmin'. Da GoTrue ohne JWT-Claims insertet,
-- griff der prevent_privileged_role_insert-Trigger nicht.
-- Jetzt: Whitelist auf erlaubte Signup-Rollen.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_role text;
BEGIN
  v_role := coalesce(new.raw_user_meta_data->>'role', 'kunde');
  IF v_role <> ALL (ARRAY['kunde', 'engel', 'fahrer']) THEN
    v_role := 'kunde';
  END IF;

  INSERT INTO public.profiles (id, role, first_name, last_name, email)
  VALUES (
    new.id,
    v_role,
    coalesce(new.raw_user_meta_data->>'first_name', ''),
    coalesce(new.raw_user_meta_data->>'last_name', ''),
    new.email
  );
  RETURN new;
END;
$$;
