-- Rollback zu 20261010000000_medikamente_abgesetzt_sperre_db.sql
--
-- ACHTUNG: nach dem Rollback ist ein abgesetztes Medikament auf DB-Ebene
-- wieder frei beschreibbar — nur lib/medikamente/medikamente.ts:
-- aktualisiereMedikament() verweigert das noch app-seitig.
DROP TRIGGER IF EXISTS trg_locked_medikament ON public.medikamente;
DROP FUNCTION IF EXISTS prevent_locked_medikament_edit();
