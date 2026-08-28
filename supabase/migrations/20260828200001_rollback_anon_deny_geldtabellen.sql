-- Rollback zu 20260828200000_anon_deny_geldtabellen.sql.
--
-- ACHTUNG: nach diesem Rollback haengt der anon-Riegel auf diesen fuenf
-- Tabellen wieder ALLEIN daran, dass anon kein EXECUTE auf
-- public.current_org_id() hat. Das ist der Zustand, den der Befund R2
-- beschreibt — kein sicherer Ausgangszustand, sondern der alte.

BEGIN;

DROP POLICY IF EXISTS "client_budgets_anon_deny"   ON public.client_budgets;
DROP POLICY IF EXISTS "service_records_anon_deny"  ON public.service_records;
DROP POLICY IF EXISTS "payments_anon_deny"         ON public.payments;
DROP POLICY IF EXISTS "billing_tariffs_anon_deny"  ON public.billing_tariffs;
DROP POLICY IF EXISTS "leistungspreise_anon_deny"  ON public.leistungspreise;

COMMIT;
