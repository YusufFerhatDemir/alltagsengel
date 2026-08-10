-- ════════════════════════════════════════════════════════════════════════════
-- Migration: mis_audit_log — organization_id Spalte + org_fence
-- Datum: 2026-08-10
-- Branch: staging/expansion-abnahme
-- P0: mis_audit_log hat keine organization_id → Cross-Tenant-Leserisiko
-- ════════════════════════════════════════════════════════════════════════════

-- 1. Spalte hinzufuegen (nullable fuer Altdaten)
ALTER TABLE public.mis_audit_log
  ADD COLUMN IF NOT EXISTS organization_id uuid;

-- 2. Altdaten-Backfill: leite org aus actor_id → organization_members ab
UPDATE public.mis_audit_log AS a
   SET organization_id = om.organization_id
  FROM public.organization_members AS om
 WHERE a.actor_id = om.user_id
   AND a.organization_id IS NULL;

-- 3. Default fuer neue Zeilen: current_org_id()
ALTER TABLE public.mis_audit_log
  ALTER COLUMN organization_id SET DEFAULT public.current_org_id();

-- 4. RESTRICTIVE org_fence Policy
DROP POLICY IF EXISTS "mis_audit_log_org_fence" ON public.mis_audit_log;
CREATE POLICY "mis_audit_log_org_fence" ON public.mis_audit_log
  AS RESTRICTIVE FOR ALL TO authenticated
  USING  (organization_id = public.current_org_id())
  WITH CHECK (organization_id = public.current_org_id());

-- 5. Anon-Deny (Defense-in-Depth)
DROP POLICY IF EXISTS "mis_audit_log_anon_deny" ON public.mis_audit_log;
CREATE POLICY "mis_audit_log_anon_deny" ON public.mis_audit_log
  AS RESTRICTIVE FOR ALL TO anon
  USING (false)
  WITH CHECK (false);

-- 6. Index fuer org_fence-Queries
CREATE INDEX IF NOT EXISTS idx_mis_audit_log_org
  ON public.mis_audit_log(organization_id);
