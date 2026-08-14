-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK zu 20260911020000_vp_kzp_budget_nachberechnung.sql
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Setzt den §42a-Jahresbetrag wieder auf 0 — aber NUR dort, wo
--   • der Wert exakt dem gesetzlichen Betrag des jeweiligen Jahres entspricht
--     (stammt also mit hoher Wahrscheinlichkeit aus dem Backfill), UND
--   • noch NICHTS davon verbraucht wurde (combined_used_amount = 0).
--
-- GRENZE DES ROLLBACKS (bewusst so):
--   Klienten, die schon vor dem Backfill denselben korrekten Betrag stehen
--   hatten (z. B. AE-TEST-0002 mit PG 3), sind von den nachgetragenen nicht
--   mehr unterscheidbar — die Migration führt keine Änderungsliste mit. Sie
--   werden hier ebenfalls auf 0 gesetzt. Der Rollback stellt damit NICHT den
--   exakten Vorzustand her, sondern den Zustand „kein §42a-Anspruch gepflegt".
--   Danach schliesst `npx tsx scripts/budget-nachziehen.ts --anwenden` die
--   Lücken wieder.
--
-- WARNUNG: Nach dem Rollback lehnt die Budgetprüfung jede Verhinderungs- und
-- Kurzzeitpflege wieder als „kein Anspruch" ab. Das ist der Fehlerzustand H-2.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

UPDATE public.client_budgets cb
   SET combined_annual_amount = 0,
       updated_at = now()
  FROM public.clients c
 WHERE c.id = cb.client_id
   AND COALESCE(c.care_level, c.pflegegrad) >= 2
   AND COALESCE(cb.combined_used_amount, 0) = 0
   AND (
     (cb.year >= 2025 AND cb.combined_annual_amount = 3539.0)
     OR
     (cb.year  = 2024 AND cb.combined_annual_amount = 3386.0)
   );

COMMIT;
