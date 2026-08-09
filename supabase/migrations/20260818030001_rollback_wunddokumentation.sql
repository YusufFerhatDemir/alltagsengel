-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK zu 20260818010000_wunddokumentation.sql
-- Entfernt die vier Wund-Tabellen (samt Policies/Triggern via CASCADE der
-- Tabelle selbst) und den Bucket — Bucket nur, wenn er leer ist, damit keine
-- Fotodaten verloren gehen.
-- ═══════════════════════════════════════════════════════════════════════════

DROP TABLE IF EXISTS wound_photos;
DROP TABLE IF EXISTS wound_treatments;
DROP TABLE IF EXISTS wound_assessments;
DROP TABLE IF EXISTS wounds;

-- Bucket nur löschen, wenn keine Objekte darin liegen (kein Datenverlust).
DELETE FROM storage.buckets b
WHERE b.id = 'wound-photos'
  AND NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'wound-photos');
