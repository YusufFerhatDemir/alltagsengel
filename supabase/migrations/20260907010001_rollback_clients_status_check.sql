-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK zu 20260907010000_clients_status_check.sql
-- ═══════════════════════════════════════════════════════════════════════════
-- Stellt den engeren Constraint wieder her.
--
-- ACHTUNG: Der Rollback scheitert, sobald bereits Zeilen mit 'new' oder
-- 'archived' existieren — genau so soll es sein, sonst würden gültige
-- Datensätze unbemerkt außerhalb des Constraints stehen. In dem Fall vorher
-- entscheiden, worauf diese Zeilen umgesetzt werden.
--
-- Prüfen mit:
--   SELECT status, count(*) FROM public.clients
--    WHERE status IN ('new','archived') GROUP BY status;
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.clients
  DROP CONSTRAINT IF EXISTS clients_status_check;

ALTER TABLE public.clients
  ADD CONSTRAINT clients_status_check
  CHECK (status IN ('active', 'paused', 'inactive'));

COMMIT;
