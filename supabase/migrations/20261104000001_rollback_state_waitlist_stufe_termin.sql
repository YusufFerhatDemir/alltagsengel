-- Rollback: Stufe „Termin" (20261104000000)
--
-- Eintraege auf 'termin' fallen auf 'kontaktiert' zurueck — die Stufe
-- davor. Ohne diesen Schritt scheitert das Wiederherstellen des alten
-- CHECK an genau diesen Zeilen (23514). Vorher sichern:
--   COPY (SELECT id, status FROM public.state_waitlist WHERE status = 'termin')
--     TO '/tmp/state_waitlist_termin.csv' CSV HEADER;

BEGIN;

UPDATE public.state_waitlist SET status = 'kontaktiert' WHERE status = 'termin';

ALTER TABLE public.state_waitlist
  DROP CONSTRAINT IF EXISTS state_waitlist_status_check;

ALTER TABLE public.state_waitlist
  ADD CONSTRAINT state_waitlist_status_check
  CHECK (status IN ('neu', 'kontaktiert', 'vorgemerkt', 'aktiviert', 'abgemeldet'));

COMMIT;
