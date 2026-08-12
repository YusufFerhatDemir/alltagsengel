-- ════════════════════════════════════════════════════════════════════
-- Block 20 — Offline-First & Native App: Server-Persistenz für Sync
-- ════════════════════════════════════════════════════════════════════
--
-- lib/offline/ (IndexedDB-Queue, verschlüsselt) läuft bisher rein
-- client-seitig. app/api/sync/route.ts (Block 20) nimmt Batches von
-- OfflineQueueItems entgegen, delegiert an die bestehenden Modul-
-- Endpunkte (app/api/pflege/**, app/api/vitals/**, ...) und protokolliert
-- serverseitig — dafür zwei neue Tabellen:
--
--   1) sync_audit_log  — jede Sync-Aktion (Start/Erfolg/Fehler/Konflikt),
--                         dient auch der Idempotency-Prüfung
--                         (kein erneutes Ausführen bei bereits
--                         erfolgreich synchronisiertem idempotency_key).
--   2) sync_konflikte  — erkannte Konflikte (Server-updated_at weicht
--                         vom Client-Snapshot ab) inkl. Auflösungsstatus
--                         für das Admin-UI (app/admin/sync-konflikte/).
--
-- Idempotent (CREATE TABLE IF NOT EXISTS, DO-Block-Guards für Policies).
-- org_fence-Muster analog 20260826010000_dipa_freischaltung_nachweise_eul.sql.
-- Engel-Owner-Policy (eigene Zeilen lesen) analog 20260809120000_tourenplanung.sql,
-- OHNE caregivers direkt zu joinen (Regel aus dem Memory-Eintrag
-- engel-rls-caregivers-join-falle) — hier reicht user_id = auth.uid(),
-- da beide Tabellen direkt am auth.uid() des Erfassers hängen, kein
-- Umweg über caregivers nötig.
-- ════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- 1) sync_audit_log
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sync_audit_log (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL DEFAULT current_org_id() REFERENCES public.organizations(id),
  user_id          uuid NOT NULL REFERENCES auth.users(id),

  queue_item_id    text NOT NULL,
  idempotency_key  text NOT NULL,
  entity_typ       text NOT NULL,
  aktion           text NOT NULL CHECK (aktion IN (
                     'sync_start', 'sync_success', 'sync_error',
                     'conflict_detected', 'conflict_resolved', 'retry'
                   )),
  details          jsonb,

  erstellt_am      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sync_audit_log_org ON public.sync_audit_log(organization_id);
CREATE INDEX IF NOT EXISTS idx_sync_audit_log_user ON public.sync_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_sync_audit_log_idempotency ON public.sync_audit_log(organization_id, idempotency_key);
CREATE INDEX IF NOT EXISTS idx_sync_audit_log_aktion ON public.sync_audit_log(organization_id, aktion, erstellt_am DESC);

ALTER TABLE public.sync_audit_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sync_audit_log' AND policyname = 'admin_sync_audit_log') THEN
    CREATE POLICY admin_sync_audit_log ON public.sync_audit_log FOR ALL TO authenticated
      USING (is_admin()) WITH CHECK (is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sync_audit_log' AND policyname = 'org_fence_sync_audit_log') THEN
    CREATE POLICY org_fence_sync_audit_log ON public.sync_audit_log AS RESTRICTIVE FOR ALL TO authenticated
      USING (organization_id = current_org_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sync_audit_log' AND policyname = 'engel_own_sync_audit_log') THEN
    CREATE POLICY engel_own_sync_audit_log ON public.sync_audit_log FOR SELECT TO authenticated
      USING (user_id = auth.uid());
  END IF;
END $$;

REVOKE ALL ON public.sync_audit_log FROM anon;

-- ─────────────────────────────────────────────────────────────────────
-- 2) sync_konflikte
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sync_konflikte (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL DEFAULT current_org_id() REFERENCES public.organizations(id),
  user_id          uuid NOT NULL REFERENCES auth.users(id),

  queue_item_id    text NOT NULL,
  idempotency_key  text NOT NULL,
  entity_typ       text NOT NULL,
  entity_id        uuid,

  lokale_daten     jsonb NOT NULL,
  server_daten     jsonb,

  strategie        text NOT NULL CHECK (strategie IN ('last_write_wins', 'server_wins', 'manuell')),
  status           text NOT NULL DEFAULT 'offen' CHECK (status IN ('offen', 'aufgeloest', 'verworfen')),
  aufgeloest_mit   text CHECK (aufgeloest_mit IN ('lokal', 'server')),
  aufgeloest_von   uuid REFERENCES auth.users(id),
  aufgeloest_am    timestamptz,

  erstellt_am      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sync_konflikte_org ON public.sync_konflikte(organization_id);
CREATE INDEX IF NOT EXISTS idx_sync_konflikte_user ON public.sync_konflikte(user_id);
CREATE INDEX IF NOT EXISTS idx_sync_konflikte_status ON public.sync_konflikte(organization_id, status);

ALTER TABLE public.sync_konflikte ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sync_konflikte' AND policyname = 'admin_sync_konflikte') THEN
    CREATE POLICY admin_sync_konflikte ON public.sync_konflikte FOR ALL TO authenticated
      USING (is_admin()) WITH CHECK (is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sync_konflikte' AND policyname = 'org_fence_sync_konflikte') THEN
    CREATE POLICY org_fence_sync_konflikte ON public.sync_konflikte AS RESTRICTIVE FOR ALL TO authenticated
      USING (organization_id = current_org_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sync_konflikte' AND policyname = 'engel_own_sync_konflikte') THEN
    CREATE POLICY engel_own_sync_konflikte ON public.sync_konflikte FOR SELECT TO authenticated
      USING (user_id = auth.uid());
  END IF;
END $$;

REVOKE ALL ON public.sync_konflikte FROM anon;

COMMIT;
