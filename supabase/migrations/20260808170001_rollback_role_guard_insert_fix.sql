-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK: INSERT-Wächter auf profiles (20260808170000)
--
-- Stellt den Zustand aus 20260804140000 wieder her — inklusive des Fehlers:
-- danach kann ein angemeldeter Kunde seine eigene Profilzeile nicht mehr
-- anlegen, und die bei der Registrierung erfassten Angaben (PLZ, Ort)
-- gehen verloren. Nur ausführen, wenn der neue Wächter selbst Probleme
-- macht — und dann sofort eine andere Absicherung setzen.
-- ════════════════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_prevent_privileged_role_insert ON public.profiles;
DROP FUNCTION IF EXISTS public.prevent_privileged_role_insert();

DROP TRIGGER IF EXISTS trg_prevent_role_escalation_insert ON public.profiles;
CREATE TRIGGER trg_prevent_role_escalation_insert
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_role_escalation();
