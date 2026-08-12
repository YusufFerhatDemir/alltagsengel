-- ════════════════════════════════════════════════════════════════════════════
-- Migration: search_path-Fix fuer generate_referral_code()
-- Datum:     2026-08-11
-- Branch:    staging/expansion-abnahme
--
-- BEFUND (Production-Incident)
--   public.generate_referral_code() (BEFORE INSERT auf public.profiles) hatte
--       SET search_path = public, pg_temp
--   pgcrypto (gen_random_bytes) liegt bei Supabase aber im Schema
--   `extensions`, nicht in `public`. Der unqualifizierte Aufruf
--       gen_random_bytes(6)
--   scheiterte deshalb mit:
--       function gen_random_bytes(integer) does not exist
--   Wirkung: JEDE Neuregistrierung schlug fehl, weil der Trigger vor dem
--   INSERT auf profiles feuert.
--
--   Bereits LIVE in Production per SQL-Editor gefixt (dieser Incident).
--   Diese Migration bildet den Live-Fix im Repo ab (idempotent, CREATE OR
--   REPLACE) — kein erneuter Apply-Schritt auf Production noetig.
--
-- Rollback: 20260811210001_rollback_fix_referral_code_search_path.sql
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.generate_referral_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  IF NEW.referral_code IS NULL THEN
    NEW.referral_code := upper(substr(encode(extensions.gen_random_bytes(6), 'hex'), 1, 8));
  END IF;
  RETURN NEW;
END;
$$;
