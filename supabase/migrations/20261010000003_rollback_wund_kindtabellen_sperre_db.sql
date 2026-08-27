-- Rollback zu 20261010000002_wund_kindtabellen_sperre_db.sql
--
-- ACHTUNG: nach dem Rollback lassen sich fuer eine abgeheilte Wunde auf
-- DB-Ebene wieder neue Assessments/Verbandwechsel/Fotos anlegen — nur
-- lib/wunden/{assessments,behandlungen,fotos}.ts verweigern das noch
-- app-seitig.
DROP TRIGGER IF EXISTS trg_locked_wound_assessment ON public.wound_assessments;
DROP TRIGGER IF EXISTS trg_locked_wound_treatment ON public.wound_treatments;
DROP TRIGGER IF EXISTS trg_locked_wound_photo ON public.wound_photos;
DROP FUNCTION IF EXISTS prevent_wound_child_edit_when_healed();
