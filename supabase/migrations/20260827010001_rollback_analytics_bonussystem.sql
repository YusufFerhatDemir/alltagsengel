-- ════════════════════════════════════════════════════════════════════
-- Rollback: Block 19 — Bonussystem (bonus_regeln, bonus_berechnungen,
-- bonus_freigaben). Reihenfolge umgekehrt zur Anlage wegen FKs.
-- ════════════════════════════════════════════════════════════════════

BEGIN;

DROP TABLE IF EXISTS public.bonus_freigaben;
DROP TABLE IF EXISTS public.bonus_berechnungen;
DROP TABLE IF EXISTS public.bonus_regeln;

COMMIT;
