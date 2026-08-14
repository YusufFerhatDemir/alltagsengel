-- ════════════════════════════════════════════════════════════════════
-- ROLLBACK zu 20260910020000_clients_pflegegrad_sync_trigger.sql
-- ════════════════════════════════════════════════════════════════════
-- ACHTUNG: Danach laufen care_level und pflegegrad wieder auseinander,
-- sobald ein Schreibweg nur eine der beiden Spalten setzt. Die einmalige
-- Angleichung des Bestands wird NICHT rueckgaengig gemacht — der
-- angeglichene Zustand ist der fachlich richtige, ein Zurueckschreiben
-- auf NULL waere Datenverlust.
--
-- Lesend bleibt lib/clients/pflegegrad.ts (pflegegradVon) korrekt;
-- die Datenbank-VIEW public.pflege_uebersicht liest jedoch weiterhin
-- direkt clients.pflegegrad und faellt bei Drift wieder auf „—" zurueck.
-- ════════════════════════════════════════════════════════════════════

BEGIN;

DROP TRIGGER IF EXISTS trg_sync_clients_pflegegrad ON public.clients;
DROP FUNCTION IF EXISTS public.sync_clients_pflegegrad();
DROP FUNCTION IF EXISTS public.pflegegrad_aus_care_level(integer);

COMMIT;
