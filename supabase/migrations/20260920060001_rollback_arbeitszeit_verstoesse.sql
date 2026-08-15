-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK zu 20260920060000_arbeitszeit_verstoesse.sql
-- ═══════════════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_arbzg_pruefung ON dienstplan_eintraege;
DROP FUNCTION IF EXISTS public.arbzg_pruefung();
DROP TABLE IF EXISTS arbeitszeit_verstoesse;
