-- Rollback zu 20261010000004_pflege_verlauf_backdating_sperre_db.sql
--
-- ACHTUNG: nach dem Rollback kann ein service_role-INSERT wieder rückwirkend
-- einen neuen Verlaufseintrag in eine bereits abgeschlossene Dokumentations-
-- periode einfügen — nur lib/pflege/verlauf.ts:createVerlauf() verweigert
-- das noch app-seitig.
DROP TRIGGER IF EXISTS trg_verlauf_periode_offen ON public.pflege_verlauf;
DROP FUNCTION IF EXISTS prevent_backdated_verlauf_insert();
