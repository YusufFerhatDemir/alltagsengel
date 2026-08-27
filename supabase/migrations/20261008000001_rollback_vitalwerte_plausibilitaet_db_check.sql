-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK zu 20261008000000_vitalwerte_plausibilitaet_db_check.sql
-- Nimmt nur die neuen CHECKs und Hilfsfunktionen zurück. vital_signs_
-- value_check (value >= 0) aus der Basis-Migration bleibt unberührt.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE IF EXISTS public.vital_signs
  DROP CONSTRAINT IF EXISTS vital_signs_wert_plausibel_check,
  DROP CONSTRAINT IF EXISTS vital_signs_sekundaer_plausibel_check,
  DROP CONSTRAINT IF EXISTS vital_signs_sekundaer_kleiner_check;

ALTER TABLE IF EXISTS public.vital_sign_thresholds
  DROP CONSTRAINT IF EXISTS vital_sign_thresholds_plausibel_check,
  DROP CONSTRAINT IF EXISTS vital_sign_thresholds_sekundaer_plausibel_check;

DROP FUNCTION IF EXISTS public.vitals_plausibel_min_sekundaer(text);
DROP FUNCTION IF EXISTS public.vitals_plausibel_max_sekundaer(text);
DROP FUNCTION IF EXISTS public.vitals_plausibel_min(text);
DROP FUNCTION IF EXISTS public.vitals_plausibel_max(text);

COMMIT;
