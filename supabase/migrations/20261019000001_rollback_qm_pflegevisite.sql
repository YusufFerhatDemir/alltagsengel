-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK zu 20261019000000_qm_pflegevisite.sql
--
-- WARNUNG: DROP TABLE loescht die Pruefergebnisse. Eine Pflegevisite ist
-- ein Qualitaetsnachweis gegenueber dem Medizinischen Dienst; einmal
-- geloescht, laesst sie sich nicht rekonstruieren. Dieses Rollback ist
-- ausschliesslich fuer den Fall gedacht, dass die Migration NIE benutzt
-- wurde (0 Zeilen) und wieder verschwinden soll.
--
-- Vor dem Ausfuehren pruefen:
--   SELECT count(*) FROM public.qm_pflegevisiten;
--   SELECT count(*) FROM public.qm_visite_befunde;
-- Sind dort Zeilen, ist ein Export die Voraussetzung.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

DROP TRIGGER IF EXISTS trg_qm_befund_insert_offen    ON public.qm_visite_befunde;
DROP TRIGGER IF EXISTS trg_qm_befund_abgeschlossen   ON public.qm_visite_befunde;
DROP TRIGGER IF EXISTS trg_updated_at_qm_visite_befunde ON public.qm_visite_befunde;
DROP TRIGGER IF EXISTS trg_qm_visite_abgeschlossen   ON public.qm_pflegevisiten;
DROP TRIGGER IF EXISTS trg_updated_at_qm_pflegevisiten ON public.qm_pflegevisiten;

DROP TABLE IF EXISTS public.qm_visite_befunde;
DROP TABLE IF EXISTS public.qm_pflegevisiten;

DROP FUNCTION IF EXISTS public.prevent_befund_an_abgeschlossener_visite();
DROP FUNCTION IF EXISTS public.prevent_abgeschlossener_befund_change();
DROP FUNCTION IF EXISTS public.prevent_abgeschlossene_visite_change();

COMMIT;
