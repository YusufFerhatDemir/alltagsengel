-- ═══════════════════════════════════════════════════════════════════
-- ROLLBACK zu 20261025000000_assignments_booking_id
-- ═══════════════════════════════════════════════════════════════════
--
-- Nimmt Index, Fremdschluessel und Spalte zurueck.
--
-- WICHTIG: Der Anwendungscode ueberlebt das (lib/bookings/assignment-bezug.ts
-- faellt auf den Notiz-Weg zurueck, sobald die Spalte fehlt). Der Backfill
-- ist danach aber verloren — die Notizen bleiben, die Spaltenwerte nicht.
-- Ein erneutes Anwenden der Migration baut sie aus den Notizen wieder auf,
-- soweit die Notizen unveraendert sind.
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

DROP INDEX IF EXISTS public.idx_assignments_booking_id;

ALTER TABLE public.assignments
  DROP CONSTRAINT IF EXISTS assignments_booking_id_fkey;

ALTER TABLE public.assignments
  DROP COLUMN IF EXISTS booking_id;

COMMIT;
