-- ════════════════════════════════════════════════════════════════════
-- ROLLBACK zu 20261020000000_standortfreigabe.sql
-- ════════════════════════════════════════════════════════════════════
--
-- ACHTUNG — DIESER ROLLBACK LOESCHT DATEN.
-- `location_updates` traegt Standortpunkte lebender Personen. Ein
-- DROP TABLE ist hier die richtige Richtung (Datensparsamkeit: die
-- Punkte haben ohne das Modul keinen Zweck mehr), aber es ist eine
-- Entscheidung und keine Formalie. Wer nur das Modul stilllegen will,
-- ohne die Punkte wegzuwerfen, setzt stattdessen alle Freigaben auf
-- 'off' — dann entsteht kein neuer Punkt, und der Bestand bleibt:
--
--   UPDATE public.location_sharing_settings SET mode = 'off';
--
-- Der NACHWEIS ueber Ein- und Ausschalten liegt nicht hier, sondern in
-- security_audit_log und ueberlebt diesen Rollback.
-- ════════════════════════════════════════════════════════════════════

BEGIN;

DROP TRIGGER IF EXISTS trg_location_update_unveraenderlich ON public.location_updates;
DROP TRIGGER IF EXISTS trg_location_update_pruefe_freigabe ON public.location_updates;
DROP TRIGGER IF EXISTS trg_location_sharing_stempel ON public.location_sharing_settings;

DROP FUNCTION IF EXISTS public.standort_aufbewahrung_bereinigen(integer);
DROP FUNCTION IF EXISTS public.location_update_unveraenderlich();
DROP FUNCTION IF EXISTS public.location_update_pruefe_freigabe();
DROP FUNCTION IF EXISTS public.location_sharing_stempel();

DROP TABLE IF EXISTS public.location_updates;
DROP TABLE IF EXISTS public.location_sharing_settings;

COMMIT;
