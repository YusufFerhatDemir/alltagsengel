-- ════════════════════════════════════════════════════════════════════════════
-- Migration: profiles.agb_accepted_at / agb_version nachziehen
-- Datum:     2026-08-08
-- Branch:    staging/expansion-abnahme
--
-- BEFUND (Phase-5-Browserabnahme)
--   Die Registrierung schreibt seit jeher
--       agb_accepted_at, agb_version
--   ins Profil — in app/auth/register/page.tsx und ueber
--   lib/pending-profile.ts beim ersten Login. In KEINER Migration wird
--   diese Spalte angelegt. Auf einer aus dem Repo aufgebauten Datenbank
--   scheitert der Upsert deshalb mit
--       column "agb_accepted_at" of relation "profiles" does not exist
--   und zwar STILL: PostgREST wirft nicht, der Fehler steht in { error }.
--
--   Nachgewiesen auf Staging: eine vollstaendig ausgefuellte Registrierung
--   (PLZ 80331, Muenchen) landete mit leerem postal_code im Profil. Damit
--   faellt die Bundesland-Erkennung auf „unbekannt" zurueck — der Kunde
--   sieht dauerhaft den Verfahrenshinweis, auch in einem anerkannten Land,
--   und der Umkreis-Filter findet keine Engel.
--
--   Ob die Produktionsdatenbank die Spalten bereits von Hand bekommen hat,
--   ist von hier aus nicht pruefbar. Diese Migration ist deshalb
--   idempotent: existiert die Spalte schon, passiert nichts.
--
--   Der zweite Teil des Fehlers — das stille Verwerfen des geparkten
--   Datensatzes — ist in lib/pending-profile.ts behoben.
--
-- KEINE Datenaenderung an bestehenden Zeilen. KEINE Production-Migration.
-- Rollback: 20260808160001_rollback_profiles_agb_spalten.sql
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS agb_accepted_at TIMESTAMPTZ;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS agb_version TEXT;

COMMENT ON COLUMN public.profiles.agb_accepted_at IS
  'Zeitpunkt der AGB-Zustimmung bei der Registrierung. Wird von '
  'app/auth/register/page.tsx bzw. lib/pending-profile.ts gesetzt.';

COMMENT ON COLUMN public.profiles.agb_version IS
  'Version der zugestimmten AGB (derzeit "3.0").';
