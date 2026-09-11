-- Rollback: Bearbeitungsstand der Content-Stuecke (20261103000000)
--
-- ACHTUNG: Die Tabelle traegt Arbeitsstand der Verwaltung — was
-- veroeffentlicht ist, was geplant, was verworfen. Diese Information steht
-- NIRGENDS sonst; die Plaene im Repo kennen sie nicht. Vor dem Ausfuehren
-- sichern:
--   COPY (SELECT content_id, status, kanal, veroeffentlicht_am, notiz,
--                geaendert_von, updated_at
--           FROM public.marketing_content_status)
--     TO '/tmp/marketing_content_status.csv' CSV HEADER;

BEGIN;

DROP TRIGGER IF EXISTS trg_marketing_content_status_updated_at
  ON public.marketing_content_status;
DROP FUNCTION IF EXISTS public.tg_marketing_content_status_updated_at();

DROP POLICY IF EXISTS "Admin full access marketing_content_status"
  ON public.marketing_content_status;

DROP INDEX IF EXISTS public.uq_marketing_content_status;

DROP TABLE IF EXISTS public.marketing_content_status;

COMMIT;
