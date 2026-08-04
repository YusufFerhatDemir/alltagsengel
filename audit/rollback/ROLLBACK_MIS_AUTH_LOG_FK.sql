-- ============================================================================
-- Rollback: FK mis_auth_log_user_id_fkey zurück auf ON DELETE NO ACTION
-- Datum:     2026-08-04
-- ACHTUNG:   Nur anwenden wenn keine NULL-user_ids durch Löschungen existieren,
--            die eine Re-Referenzierung unmöglich machen.
-- ============================================================================

ALTER TABLE public.mis_auth_log
  DROP CONSTRAINT IF EXISTS mis_auth_log_user_id_fkey;

ALTER TABLE public.mis_auth_log
  ADD CONSTRAINT mis_auth_log_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE NO ACTION;

-- Falls die Spalte vorher NOT NULL war und zurückgesetzt werden soll:
-- ALTER TABLE public.mis_auth_log ALTER COLUMN user_id SET NOT NULL;
-- ACHTUNG: Nur möglich wenn keine NULL-Werte in user_id existieren!
--   Prüfen mit: SELECT count(*) FROM public.mis_auth_log WHERE user_id IS NULL;
