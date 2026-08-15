-- Rollback: 20260921010000_sgb_v_302_pipeline_erweiterung.sql

BEGIN;

DROP TABLE IF EXISTS public.sgb_v_uebertragungsqueue;
DROP TABLE IF EXISTS public.sgb_v_korrekturlaeufe;

ALTER TABLE public.sgb_v_laeufe
  DROP COLUMN IF EXISTS korrektur_von,
  DROP COLUMN IF EXISTS storno_grund;

ALTER TABLE public.zahlungseingaenge
  DROP COLUMN IF EXISTS sgb_v_lauf_id;

ALTER TABLE public.dta_ruecklaeufer
  DROP COLUMN IF EXISTS sgb_v_lauf_id;

DELETE FROM storage.buckets WHERE id = 'sgb-v-pruefexporte';

COMMIT;
