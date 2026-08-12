-- Rollback: Medikamentenmanagement
BEGIN;

DROP TABLE IF EXISTS public.medikament_eingaben CASCADE;
DROP TABLE IF EXISTS public.medikamente CASCADE;

COMMIT;
