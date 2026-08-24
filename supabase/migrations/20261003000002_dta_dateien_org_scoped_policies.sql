-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: dta-dateien Storage-Policies org-scoped
-- Datum: 2026-08-24 (Phase 5, P2-b)
--
-- BEFUND
--   Die drei bestehenden Policies auf dta-dateien prüfen nur die Rolle
--   (admin/superadmin) per EXISTS auf profiles, aber KEINE organization_id.
--   Ein Admin aus Organisation B kann damit DTA-Dateien von Organisation A
--   lesen, hochladen und löschen — horizontale Rechteeskalation.
--
--   Zusätzlich: die EXISTS-Bauform gegen profiles mit aktivem RLS hat
--   bereits zweimal 42P17-Rekursion ausgelöst. is_admin() + current_org_id()
--   vermeidet das.
--
-- FIX
--   Alle drei Policies werden durch org-scoped Varianten ersetzt.
--   Der Org-Abgleich nutzt den Storage-Pfad: alle Dateien liegen unter
--   {subfolder}/{organizationId}/..., also ist (storage.foldername(name))[2]
--   die Organisation. Geprüft wird gegen current_org_id()::text.
--
-- ROLLBACK: die alten Policies wiederherstellen (ohne Org-Check).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Alte org-blinde Policies entfernen
DROP POLICY IF EXISTS "Admins can read dta files"   ON storage.objects;
DROP POLICY IF EXISTS "Admins can upload dta files"  ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete dta files"  ON storage.objects;

-- 2. Neue org-scoped Policies

-- SELECT: Admin darf nur DTA-Dateien der eigenen Organisation lesen
CREATE POLICY "dta_dateien_admin_select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'dta-dateien'
    AND is_admin()
    AND (storage.foldername(name))[2] = current_org_id()::text
  );

-- INSERT: Admin darf nur in den eigenen Org-Ordner hochladen
CREATE POLICY "dta_dateien_admin_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'dta-dateien'
    AND is_admin()
    AND (storage.foldername(name))[2] = current_org_id()::text
  );

-- DELETE: Admin darf nur DTA-Dateien der eigenen Organisation löschen
CREATE POLICY "dta_dateien_admin_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'dta-dateien'
    AND is_admin()
    AND (storage.foldername(name))[2] = current_org_id()::text
  );

COMMIT;
