-- ════════════════════════════════════════════════════════════════════
-- RLS-Matrix RPCs (P1.3)
-- ════════════════════════════════════════════════════════════════════
--
-- Erweitert die Idee von 20260417 (audit_rls_status / audit_rls_policies)
-- um zwei "all"-Varianten, die ALLE public-Tabellen zurueckgeben.
--
-- Wozu? Damit das scripts/rls-matrix.ts ein vollstaendiges Inventar
-- erzeugen kann (Markdown + CSV). Wir wollen nicht jede neue Tabelle
-- in einem Hardcoded-Array nachpflegen muessen — Drift waere garantiert.
--
-- Sicherheit:
--   - SECURITY DEFINER (laeuft mit Owner-Rechten, nicht mit Caller-Rechten)
--   - Nur EXECUTE-Grant fuer service_role (kein anon, kein authenticated)
--   - Read-only: gibt nur Metadaten aus pg_catalog zurueck, nichts mutiert
--
-- Analogie:
--   Wie ein Inventar-Tool im Supermarkt. Es laeuft nachts mit Master-Key
--   (SECURITY DEFINER) und listet alle Regale + Produkte auf — aber
--   keine Kasse kann ohne Master-Key zugreifen.
-- ════════════════════════════════════════════════════════════════════

BEGIN;

-- 1) RLS-Status fuer ALLE public-Tabellen
CREATE OR REPLACE FUNCTION public.audit_rls_all_status()
RETURNS TABLE (
  schemaname   text,
  tablename    text,
  rowsecurity  boolean,
  forcerowsecurity boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    n.nspname::text                AS schemaname,
    c.relname::text                AS tablename,
    c.relrowsecurity               AS rowsecurity,
    c.relforcerowsecurity          AS forcerowsecurity
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r', 'p')   -- ordinary + partitioned tables
    AND c.relname NOT LIKE 'pg\_%'
  ORDER BY c.relname;
$$;

COMMENT ON FUNCTION public.audit_rls_all_status() IS
  'P1.3 RLS-Matrix: Liefert RLS-Status fuer ALLE public-Tabellen. '
  'Service-Role-only.';

REVOKE ALL ON FUNCTION public.audit_rls_all_status() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.audit_rls_all_status() FROM anon;
REVOKE ALL ON FUNCTION public.audit_rls_all_status() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.audit_rls_all_status() TO service_role;

-- 2) Alle Policies fuer ALLE public-Tabellen
CREATE OR REPLACE FUNCTION public.audit_rls_all_policies()
RETURNS TABLE (
  schemaname  text,
  tablename   text,
  policyname  text,
  permissive  text,
  roles       text[],
  cmd         text,
  qual        text,
  with_check  text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    schemaname::text,
    tablename::text,
    policyname::text,
    permissive::text,
    roles::text[],
    cmd::text,
    qual::text,
    with_check::text
  FROM pg_policies
  WHERE schemaname = 'public'
  ORDER BY tablename, policyname;
$$;

COMMENT ON FUNCTION public.audit_rls_all_policies() IS
  'P1.3 RLS-Matrix: Liefert ALLE RLS-Policies aus dem public-Schema '
  'inkl. Roles/USING/WITH CHECK. Service-Role-only.';

REVOKE ALL ON FUNCTION public.audit_rls_all_policies() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.audit_rls_all_policies() FROM anon;
REVOKE ALL ON FUNCTION public.audit_rls_all_policies() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.audit_rls_all_policies() TO service_role;

COMMIT;
