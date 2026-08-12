-- Rollback: D2 VP-Budget

BEGIN;

ALTER TABLE public.client_budgets
  DROP CONSTRAINT IF EXISTS client_budgets_client_year_type_unique;

ALTER TABLE public.client_budgets
  DROP CONSTRAINT IF EXISTS client_budgets_budget_type_check;

ALTER TABLE public.client_budgets
  DROP COLUMN IF EXISTS budget_type;

ALTER TABLE public.client_budgets
  ALTER COLUMN combined_annual_amount SET DEFAULT 3539.0;

COMMIT;
