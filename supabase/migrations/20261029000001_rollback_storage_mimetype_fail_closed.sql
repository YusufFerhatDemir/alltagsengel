-- Rollback: storage_mimetype_ok zurück auf fail-open (alte Version)
CREATE OR REPLACE FUNCTION public.storage_mimetype_ok(p_bucket text, p_metadata jsonb)
  RETURNS boolean
  LANGUAGE sql
  STABLE SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
  select case
    when p_metadata is null or nullif(p_metadata ->> 'mimetype', '') is null then true
    else coalesce(
      (select b.allowed_mime_types is null
           or lower(p_metadata ->> 'mimetype') = any (
                select lower(t) from unnest(b.allowed_mime_types) as t
              )
       from storage.buckets b
       where b.id = p_bucket),
      false)
  end;
$function$;
