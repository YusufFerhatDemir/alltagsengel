-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK zu 20261020000000_dienstplan_freigabe.sql
--
-- WARNUNG: Ohne den Trigger aendert sich ein freigegebener Dienstplan
-- wieder stillschweigend, und ohne die Tabelle laesst sich nicht mehr
-- sagen, welche Woche je verbindlich war. Vor dem Ausfuehren pruefen:
--
--   SELECT count(*) FROM public.dienstplan_freigaben;
--
-- Die Spalte `dienstplan_eintraege.aenderung_grund` bleibt bewusst STEHEN:
-- sie traegt Daten (die Gruende bereits vorgenommener Aenderungen), und
-- ein DROP COLUMN verlaere sie unwiederbringlich. Sie stoert nichts.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

DROP TRIGGER IF EXISTS trg_dienstplan_freigabe ON public.dienstplan_eintraege;
DROP TRIGGER IF EXISTS trg_updated_at_dienstplan_freigaben ON public.dienstplan_freigaben;
DROP FUNCTION IF EXISTS public.pruefe_dienstplan_freigabe();
DROP TABLE IF EXISTS public.dienstplan_freigaben;

COMMIT;
