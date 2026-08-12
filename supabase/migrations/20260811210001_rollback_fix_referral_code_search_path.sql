-- Rollback: search_path-Fix fuer generate_referral_code()
-- Stellt den vorherigen (fehlerhaften) Zustand aus
-- 20260101000100_baseline_live_only_functions.sql wieder her.
-- ACHTUNG: reproduziert den Production-Incident (Registrierung bricht).

CREATE OR REPLACE FUNCTION public.generate_referral_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.referral_code IS NULL THEN
    NEW.referral_code := upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8));
  END IF;
  RETURN NEW;
END;
$$;
