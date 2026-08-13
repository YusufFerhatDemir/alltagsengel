-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK zu 20260907000000_pflegegrad_backfill.sql
-- ═══════════════════════════════════════════════════════════════════════════
-- Setzt die nachgeordnete Spalte wieder auf NULL — aber NUR dort, wo sie
-- exakt dem care_level entspricht, also mit hoher Wahrscheinlichkeit aus dem
-- Backfill stammt. Abweichende Werte bleiben unangetastet: sie wurden
-- irgendwann bewusst gesetzt und dürfen nicht verloren gehen.
--
-- HINWEIS: Der Rollback stellt den Zustand „Auswertungen sehen keinen
-- Pflegegrad" wieder her. Er ist nur sinnvoll, wenn sich die Doppelspalte
-- als Fehlerquelle herausstellt — nicht als Routineschritt.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

UPDATE public.clients
   SET pflegegrad = NULL
 WHERE care_level IS NOT NULL
   AND pflegegrad = care_level;

COMMIT;
