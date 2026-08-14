-- Rollback: profiles_select_engels wiederherstellen und search_path entfernen
-- ACHTUNG: Stellt das PII-Leck und die search_path-Luecke wieder her!

BEGIN;

-- profiles_select_engels wiederherstellen (PII-Leck!)
CREATE POLICY "profiles_select_engels" ON public.profiles
  FOR SELECT
  USING (
    auth.role() = 'authenticated' AND role = 'engel' AND deleted_at IS NULL
  );

-- search_path entfernen (Funktionen ohne SET search_path wiederherstellen)
-- Muss aus den Original-Migrationen 20260812010000 und 20260814010000
-- erneut angewendet werden.

COMMIT;
