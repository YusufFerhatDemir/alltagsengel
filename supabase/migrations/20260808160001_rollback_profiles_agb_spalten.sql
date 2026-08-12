-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK: profiles.agb_accepted_at / agb_version (20260808160000)
--
-- ACHTUNG: Loescht den Nachweis der AGB-Zustimmung. Das ist eine
-- dokumentationspflichtige Angabe — vor dem Ausfuehren sichern:
--   CREATE TABLE profiles_agb_sicherung AS
--     SELECT id, agb_accepted_at, agb_version FROM public.profiles
--      WHERE agb_accepted_at IS NOT NULL;
--
-- Ausserdem schreibt die Registrierung danach wieder ins Leere (still),
-- solange lib/pending-profile.ts und app/auth/register/page.tsx die
-- Felder senden.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.profiles DROP COLUMN IF EXISTS agb_accepted_at;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS agb_version;
