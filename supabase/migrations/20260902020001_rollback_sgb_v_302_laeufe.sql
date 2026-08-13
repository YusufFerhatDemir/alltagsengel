-- ═══════════════════════════════════════════════════════════════
-- ROLLBACK zu 20260902020000_sgb_v_302_laeufe.sql
--
-- Entfernt die § 302-Lauftabelle. Versionsregister (sgb_v_formatversionen)
-- und Routing (sgb_v_routing) aus Block 17 bleiben unberührt.
--
-- Reihenfolge beachten: dieser Rollback muss VOR dem Rollback von
-- 20260902010000 laufen — der Trigger nutzt dessen Funktion
-- set_updated_at_dta_versand().
-- ═══════════════════════════════════════════════════════════════

BEGIN;

DROP TRIGGER IF EXISTS trg_sgb_v_laeufe_updated ON public.sgb_v_laeufe;
DROP TABLE IF EXISTS public.sgb_v_laeufe;

COMMIT;
