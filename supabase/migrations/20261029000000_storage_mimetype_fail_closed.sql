-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: storage_mimetype_ok — Fail-Closed bei leerem MIME-Type
-- Datum: 2026-09-05, P9.4 Security Audit P3-33
-- Projekt: efy (nsfbwhpjesmathsrqkfi)
--
-- BEFUND (P3-33)
--   storage_mimetype_ok() gibt bei fehlendem oder leerem MIME-Type `true`
--   zurück. Das ist fail-open: eine Datei ohne MIME-Type-Angabe umgeht die
--   Allowlist-Prüfung in den RLS-Policies (leistungsnachweise_insert,
--   rechnungspakete_write, qualitaetsmanagement_write und deren _update).
--
--   Supabase Storage setzt zwar IMMER einen Content-Type (Fallback:
--   application/octet-stream), und die Bucket-eigene allowed_mime_types-
--   Prüfung greift VOR der RLS-Policy. Dennoch ist die Funktion als
--   Defense-in-Depth-Schicht gedacht und muss deshalb fail-closed sein.
--
-- FIX
--   Leerer/fehlender MIME-Type → false statt true.
--   Kein Risiko für bestehende Uploads: Supabase setzt metadata.mimetype
--   bei jedem Upload automatisch.
--
-- ROLLBACK
--   Die alte Version steht in 20261029000001_rollback_storage_mimetype_fail_closed.sql
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.storage_mimetype_ok(p_bucket text, p_metadata jsonb)
  RETURNS boolean
  LANGUAGE sql
  STABLE SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
  select case
    -- FAIL-CLOSED: kein Metadata oder kein/leerer MIME-Type → ablehnen
    when p_metadata is null or nullif(p_metadata ->> 'mimetype', '') is null then false
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
