-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK zu 20260919000000_kim_ti_messaging.sql
-- Entfernt die vier KIM-Tabellen (Policies/Trigger via CASCADE der Tabelle
-- selbst) und den Bucket — Bucket nur, wenn er leer ist (kein Datenverlust).
-- ═══════════════════════════════════════════════════════════════════════════

DROP TABLE IF EXISTS public.kim_attachments;
DROP TABLE IF EXISTS public.kim_audit_log;
DROP TABLE IF EXISTS public.kim_messages;
DROP TABLE IF EXISTS public.kim_provider_config;
DROP TABLE IF EXISTS public.kim_addresses;
DROP FUNCTION IF EXISTS public.kim_messages_set_updated_at();

DELETE FROM storage.buckets b
WHERE b.id = 'kim-attachments'
  AND NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'kim-attachments');
