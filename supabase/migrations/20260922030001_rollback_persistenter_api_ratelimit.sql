-- Rollback zu 20260922030000_persistenter_api_ratelimit.sql
BEGIN;

DROP FUNCTION IF EXISTS public.cleanup_api_rate_limits();
DROP FUNCTION IF EXISTS public.api_rate_limit_hit(text, integer, integer);
DROP TABLE IF EXISTS public.api_rate_limits;

COMMIT;
