-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK zu 20261024000000_watchlist_befristung.sql
--
-- Nimmt den CHECK und die vier Spalten wieder weg.
--
-- ACHTUNG: die Befristung selbst VERSCHWINDET DAMIT NICHT. Sie wird im
-- Anwendungscode aus `created_at` abgeleitet (lib/security/befristung.ts,
-- HOECHSTDAUER_TAGE) und wirkt unabhaengig von diesen Spalten weiter.
-- Nach dem Rollback laesst sich lediglich keine KUERZERE Frist mehr
-- ausdruecklich anordnen — es gilt wieder fuer alle Eintraege dieselbe
-- Hoechstdauer.
--
-- Was verloren geht, sind die dokumentierten Angaben: zweck,
-- rechtsgrundlage und person_informiert_am werden mit den Spalten
-- geloescht. Vor einem Rollback also sichern, wenn dort etwas steht —
-- es sind Nachweise, keine Konfiguration.
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE public.security_watchlist
  DROP CONSTRAINT IF EXISTS security_watchlist_aktiv_braucht_frist;

ALTER TABLE public.security_watchlist
  DROP COLUMN IF EXISTS befristet_bis,
  DROP COLUMN IF EXISTS zweck,
  DROP COLUMN IF EXISTS rechtsgrundlage,
  DROP COLUMN IF EXISTS person_informiert_am;
