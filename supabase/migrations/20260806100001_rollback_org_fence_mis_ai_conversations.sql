-- ═══════════════════════════════════════════════════════════════════
-- ROLLBACK: Org-Fence für mis_ai_conversations entfernen
-- Datum: 2026-08-06
-- Hinweis: Diese Migration ist NUR als Rollback-Dokumentation gedacht.
--          Nicht automatisch anwenden — nur bei Bedarf manuell ausführen.
-- ═══════════════════════════════════════════════════════════════════

-- 1) Neue Policies entfernen
DROP POLICY IF EXISTS "mis_ai_conversations_org_fence" ON public.mis_ai_conversations;
DROP POLICY IF EXISTS "mis_ai_conversations_user_insert" ON public.mis_ai_conversations;
DROP POLICY IF EXISTS "mis_ai_conversations_user_update" ON public.mis_ai_conversations;
DROP POLICY IF EXISTS "mis_ai_conversations_user_delete" ON public.mis_ai_conversations;
DROP POLICY IF EXISTS "mis_ai_conversations_user_select" ON public.mis_ai_conversations;

-- 2) Index entfernen
DROP INDEX IF EXISTS idx_mis_ai_conversations_org;

-- 3) organization_id-Spalte entfernen
ALTER TABLE public.mis_ai_conversations DROP COLUMN IF EXISTS organization_id;

-- 4) Bestehende admin_select Policy bleibt bestehen (war vorher schon da).
-- Verifikation:
--   SELECT policyname FROM pg_policies WHERE tablename = 'mis_ai_conversations';
--   Erwartung: nur 'mis_ai_conversations_admin_select'
