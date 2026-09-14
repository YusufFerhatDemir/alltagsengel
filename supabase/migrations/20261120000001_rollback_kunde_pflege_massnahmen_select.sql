-- Rollback zu 20261120000000_kunde_pflege_massnahmen_select.sql
--
-- Danach sieht die Kundin in /kunde/pflegedoku wieder einen Maßnahmenplan
-- ohne Maßnahmen — stumm, weil PostgREST die RLS-Verweigerung als
-- `200 []` beantwortet.

DROP POLICY IF EXISTS "kunde_pflege_massnahmen_select" ON public.pflege_massnahmen;
