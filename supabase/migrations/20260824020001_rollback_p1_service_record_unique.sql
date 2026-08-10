-- Rollback P1-18: Unique-Index auf service_records entfernen
DROP INDEX IF EXISTS public.idx_service_records_unique_entry;
