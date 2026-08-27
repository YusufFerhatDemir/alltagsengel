-- Rollback zu 20261009000000_pflege_massnahmenplaene_ein_aktiver_plan.sql
--
-- ACHTUNG: nach dem Entfernen kann die Race Condition in freigebenPlan()
-- wieder zwei gleichzeitig aktive Massnahmenplaene fuer denselben Klienten
-- erzeugen.
DROP INDEX IF EXISTS public.uq_pflege_massnahmenplaene_ein_aktiver_plan;
