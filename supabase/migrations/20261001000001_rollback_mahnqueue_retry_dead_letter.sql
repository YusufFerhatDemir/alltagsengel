-- Rollback zu 20261001000000_mahnqueue_retry_dead_letter.sql
--
-- Nimmt Spalten, Indizes und den erweiterten Status-CHECK zurueck.
-- Zeilen im Dead Letter werden dabei auf 'fehlgeschlagen' zurueckgesetzt
-- — sonst verletzt der wieder enge CHECK den Bestand und der Rollback
-- bricht ab. Der Grund bleibt in fehler_details erhalten.

BEGIN;

UPDATE public.dunning_email_queue
   SET status = 'fehlgeschlagen'
 WHERE status = 'aufgegeben';

DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.dunning_email_queue'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%wartend%'
  LOOP
    EXECUTE format('ALTER TABLE public.dunning_email_queue DROP CONSTRAINT %I', c.conname);
  END LOOP;

  ALTER TABLE public.dunning_email_queue
    ADD CONSTRAINT dunning_email_queue_status_check
    CHECK (status IN ('wartend', 'versendet', 'fehlgeschlagen', 'storniert'));
END;
$$;

DROP INDEX IF EXISTS public.idx_dunning_email_queue_wiederholbar;
DROP INDEX IF EXISTS public.idx_dunning_email_queue_aufgegeben;

ALTER TABLE public.dunning_email_queue
  DROP CONSTRAINT IF EXISTS dunning_email_queue_versuche_nicht_negativ;

ALTER TABLE public.dunning_email_queue
  DROP COLUMN IF EXISTS versuche,
  DROP COLUMN IF EXISTS letzter_versuch_am,
  DROP COLUMN IF EXISTS naechster_versuch_ab;

COMMIT;
