-- Rollback zu 20261125000000_engel_caregivers_select_own.sql
--
-- Danach kann eine Pflegekraft ihren eigenen Datensatz nicht mehr lesen,
-- und /engel/medikamente, /engel/pflegedoku/verlauf sowie /engel/einsaetze
-- melden wieder „Ihre Zuordnung konnte nicht geladen werden".

DROP POLICY IF EXISTS "engel_caregivers_select_own" ON public.caregivers;
