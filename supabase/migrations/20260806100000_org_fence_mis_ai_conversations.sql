-- ═══════════════════════════════════════════════════════════════════
-- Migration: Org-Fence für mis_ai_conversations
-- Datum: 2026-08-06
-- Zweck: organization_id + RESTRICTIVE RLS-Fence nachrüsten
-- Rollback: 20260806100001_rollback_org_fence_mis_ai_conversations.sql
-- ═══════════════════════════════════════════════════════════════════

-- 1) organization_id-Spalte hinzufügen (mit Default current_org_id())
ALTER TABLE public.mis_ai_conversations
  ADD COLUMN IF NOT EXISTS organization_id UUID NOT NULL DEFAULT public.current_org_id()
  REFERENCES public.organizations(id);

-- 2) Index für performante RLS-Abfragen
CREATE INDEX IF NOT EXISTS idx_mis_ai_conversations_org
  ON public.mis_ai_conversations(organization_id);

-- 3) RLS ist bereits aktiviert (bestätigt via Analyse).
-- Sicherheitshalber erneut:
ALTER TABLE public.mis_ai_conversations ENABLE ROW LEVEL SECURITY;

-- 4) RESTRICTIVE Org-Fence — schneidet ALLE bestehenden permissiven
-- Policies auf die aktive Organisation zu (AND-Verknüpfung).
DROP POLICY IF EXISTS "mis_ai_conversations_org_fence" ON public.mis_ai_conversations;
CREATE POLICY "mis_ai_conversations_org_fence"
  ON public.mis_ai_conversations
  AS RESTRICTIVE
  FOR ALL
  USING (organization_id = public.current_org_id())
  WITH CHECK (organization_id = public.current_org_id());

-- 5) Fehlende INSERT-Policy: Nur authentifizierte Benutzer können
-- eigene Conversations anlegen.
DROP POLICY IF EXISTS "mis_ai_conversations_user_insert" ON public.mis_ai_conversations;
CREATE POLICY "mis_ai_conversations_user_insert"
  ON public.mis_ai_conversations
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- 6) Fehlende UPDATE-Policy: Benutzer kann nur eigene Conversations aktualisieren.
DROP POLICY IF EXISTS "mis_ai_conversations_user_update" ON public.mis_ai_conversations;
CREATE POLICY "mis_ai_conversations_user_update"
  ON public.mis_ai_conversations
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 7) Fehlende DELETE-Policy: Benutzer kann nur eigene Conversations löschen.
DROP POLICY IF EXISTS "mis_ai_conversations_user_delete" ON public.mis_ai_conversations;
CREATE POLICY "mis_ai_conversations_user_delete"
  ON public.mis_ai_conversations
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- 8) Bestehende SELECT-Policy erweitern: Auch Benutzer sollen eigene
-- Conversations sehen (aktuell nur Admin-SELECT).
DROP POLICY IF EXISTS "mis_ai_conversations_user_select" ON public.mis_ai_conversations;
CREATE POLICY "mis_ai_conversations_user_select"
  ON public.mis_ai_conversations
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- 9) Anonymen Zugriff explizit verweigern (defense-in-depth):
-- Alle Policies sind auf 'authenticated' oder prüfen auth.uid().
-- RLS ist ON, also ist anon implizit blockiert. Kein DENY nötig.

-- Verifikation (manuell nach Anwendung):
--   SELECT policyname, permissive, cmd FROM pg_policies
--   WHERE tablename = 'mis_ai_conversations' ORDER BY policyname;
--   Erwartung: 5 Policies (admin_select, org_fence, user_insert, user_update, user_delete, user_select)
