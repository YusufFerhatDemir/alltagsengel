-- ════════════════════════════════════════════════════════════════════
-- Migration: CREATE TABLE public.documents
-- ════════════════════════════════════════════════════════════════════
--
-- Zweck: Die documents-Tabelle war bisher nur in initial-setup.sql
-- definiert, wurde aber nie als Migration ausgeführt. Der App-Code
-- (lib/upload-document.ts, engel/dokumente, kunde/dokumente) ist
-- vollständig implementiert und wartet auf diese Tabelle.
--
-- Idempotent: IF NOT EXISTS / CREATE OR REPLACE / DO $$ Guards überall.
-- Kann mehrfach angewendet werden ohne Fehler.
--
-- Abhängigkeiten (müssen VOR dieser Migration existieren):
--   - public.profiles (FK user_id)
--   - public.organizations (FK organization_id)
--   - public.is_admin() — SECURITY DEFINER Funktion
--   - public.is_profile_soft_deleted(uuid) — SECURITY DEFINER Funktion
--   - public.current_org_id() — SECURITY DEFINER Funktion
-- ════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- 1) Tabelle anlegen
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.documents (
  id              uuid        DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  user_id         uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  organization_id uuid        NOT NULL DEFAULT public.current_org_id()
                              REFERENCES public.organizations(id) ON DELETE CASCADE,
  type            text        NOT NULL CHECK (type IN (
                                'ausweis','fuehrungszeugnis','zertifikat',
                                'versicherung','sonstiges'
                              )),
  file_name       text        NOT NULL,
  file_path       text,       -- Storage-Pfad im privaten Bucket (für Re-Signierung)
  file_url        text,       -- Signierte URL (ablaufend, wird on-demand neu signiert)
  status          text        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending','verified','rejected')),
  note            text,
  uploaded_at     timestamptz NOT NULL DEFAULT now(),
  verified_at     timestamptz
);

-- ─────────────────────────────────────────────────────────────────────
-- 1b) Nachruesten, falls die Tabelle bereits existiert
--
-- supabase/initial-setup.sql legt public.documents in einer aelteren,
-- schmaleren Fassung an (ohne organization_id und file_path). Das
-- CREATE TABLE IF NOT EXISTS oben ist dann ein No-op — und der Index auf
-- organization_id weiter unten scheiterte mit
--   ERROR: column "organization_id" does not exist.
-- Die Migration war dadurch auf jeder DB unanwendbar, auf der
-- initial-setup.sql zuerst lief. Die folgenden Spalten machen sie in
-- beide Richtungen idempotent.
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS organization_id uuid;

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS file_path text;

-- Bestandszeilen der Stamm-Organisation zuordnen, bevor NOT NULL greift.
UPDATE public.documents
   SET organization_id = '00000000-0000-4000-8000-000460629986'::uuid
 WHERE organization_id IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'documents_organization_id_fkey'
  ) THEN
    ALTER TABLE public.documents
      ADD CONSTRAINT documents_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
  END IF;
END $$;

ALTER TABLE public.documents
  ALTER COLUMN organization_id SET DEFAULT public.current_org_id();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.documents WHERE organization_id IS NULL) THEN
    RAISE NOTICE 'documents: NOT NULL auf organization_id uebersprungen — es gibt noch Zeilen ohne Organisation.';
  ELSE
    ALTER TABLE public.documents ALTER COLUMN organization_id SET NOT NULL;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- 2) Indizes
-- ─────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_documents_user_id
  ON public.documents (user_id);

CREATE INDEX IF NOT EXISTS idx_documents_org
  ON public.documents (organization_id);

CREATE INDEX IF NOT EXISTS idx_documents_status
  ON public.documents (status);

CREATE INDEX IF NOT EXISTS idx_documents_type
  ON public.documents (type);

-- ─────────────────────────────────────────────────────────────────────
-- 3) Row Level Security aktivieren
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────────────
-- 4) RESTRICTIVE Org-Fence (Multi-Mandant)
--    Identisches Pattern wie bookings_org_fence in
--    20260803100000_consolidate_bookings_policies.sql
-- ─────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  -- Drop + Create statt CREATE IF NOT EXISTS (Policies unterstützen kein IF NOT EXISTS)
  EXECUTE 'DROP POLICY IF EXISTS "documents_org_fence" ON public.documents';
  EXECUTE $pol$
    CREATE POLICY "documents_org_fence" ON public.documents
      AS RESTRICTIVE FOR ALL
      USING  (organization_id = public.current_org_id())
      WITH CHECK (organization_id = public.current_org_id())
  $pol$;
END
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 5) Admin-Zugriff (ALL)
--    is_admin() ist SECURITY DEFINER, prüft role + deleted_at
-- ─────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "documents_admin" ON public.documents;
CREATE POLICY "documents_admin" ON public.documents
  FOR ALL
  USING (public.is_admin());

-- ─────────────────────────────────────────────────────────────────────
-- 6) SELECT: User sieht eigene Dokumente (mit Soft-Delete-Check)
-- ─────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "documents_select_own" ON public.documents;
CREATE POLICY "documents_select_own" ON public.documents
  FOR SELECT
  USING (
    auth.uid() = user_id
    AND NOT public.is_profile_soft_deleted(auth.uid())
  );

-- ─────────────────────────────────────────────────────────────────────
-- 7) INSERT: User kann eigene Dokumente hochladen (mit Soft-Delete-Check)
-- ─────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "documents_insert_own" ON public.documents;
CREATE POLICY "documents_insert_own" ON public.documents
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND NOT public.is_profile_soft_deleted(auth.uid())
  );

-- ─────────────────────────────────────────────────────────────────────
-- 8) UPDATE: User kann eigene Dokumente aktualisieren (z.B. Re-Upload)
-- ─────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "documents_update_own" ON public.documents;
CREATE POLICY "documents_update_own" ON public.documents
  FOR UPDATE
  USING (
    auth.uid() = user_id
    AND NOT public.is_profile_soft_deleted(auth.uid())
  )
  WITH CHECK (
    auth.uid() = user_id
    AND NOT public.is_profile_soft_deleted(auth.uid())
  );

-- ─────────────────────────────────────────────────────────────────────
-- 9) DELETE: User kann eigene Dokumente löschen
-- ─────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "documents_delete_own" ON public.documents;
CREATE POLICY "documents_delete_own" ON public.documents
  FOR DELETE
  USING (
    auth.uid() = user_id
    AND NOT public.is_profile_soft_deleted(auth.uid())
  );

-- ─────────────────────────────────────────────────────────────────────
-- 10) Storage-Bucket (privat — kein Public Access!)
--     DSGVO: Personalausweis, Führungszeugnis, Versicherung
--     Zugriff nur über signierte URLs (createSignedUrl)
-- ─────────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;

-- Storage-Policies für den documents-Bucket
-- User kann eigene Dateien hochladen
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'documents_upload_own'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY "documents_upload_own" ON storage.objects
        FOR INSERT WITH CHECK (
          bucket_id = 'documents'
          AND (storage.foldername(name))[1] = auth.uid()::text
        )
    $pol$;
  END IF;
END
$$;

-- User kann eigene Dateien lesen (signierte URLs)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'documents_read_own'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY "documents_read_own" ON storage.objects
        FOR SELECT USING (
          bucket_id = 'documents'
          AND (storage.foldername(name))[1] = auth.uid()::text
        )
    $pol$;
  END IF;
END
$$;

-- User kann eigene Dateien löschen
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'documents_delete_own_storage'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY "documents_delete_own_storage" ON storage.objects
        FOR DELETE USING (
          bucket_id = 'documents'
          AND (storage.foldername(name))[1] = auth.uid()::text
        )
    $pol$;
  END IF;
END
$$;

-- Admin kann alle Dateien im documents-Bucket verwalten
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'documents_admin_storage'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY "documents_admin_storage" ON storage.objects
        FOR ALL USING (
          bucket_id = 'documents'
          AND public.is_admin()
        )
        WITH CHECK (
          bucket_id = 'documents'
          AND public.is_admin()
        )
    $pol$;
  END IF;
END
$$;

COMMIT;

-- ════════════════════════════════════════════════════════════════════
-- ROLLBACK (manuell, bei Bedarf):
-- ════════════════════════════════════════════════════════════════════
--
-- BEGIN;
--
-- -- Storage-Policies
-- DROP POLICY IF EXISTS "documents_upload_own"         ON storage.objects;
-- DROP POLICY IF EXISTS "documents_read_own"           ON storage.objects;
-- DROP POLICY IF EXISTS "documents_delete_own_storage" ON storage.objects;
-- DROP POLICY IF EXISTS "documents_admin_storage"      ON storage.objects;
--
-- -- Storage-Bucket (nur löschen wenn leer!)
-- -- DELETE FROM storage.buckets WHERE id = 'documents';
--
-- -- Tabellen-Policies
-- DROP POLICY IF EXISTS "documents_org_fence"    ON public.documents;
-- DROP POLICY IF EXISTS "documents_admin"        ON public.documents;
-- DROP POLICY IF EXISTS "documents_select_own"   ON public.documents;
-- DROP POLICY IF EXISTS "documents_insert_own"   ON public.documents;
-- DROP POLICY IF EXISTS "documents_update_own"   ON public.documents;
-- DROP POLICY IF EXISTS "documents_delete_own"   ON public.documents;
--
-- -- Tabelle
-- DROP TABLE IF EXISTS public.documents CASCADE;
--
-- COMMIT;
