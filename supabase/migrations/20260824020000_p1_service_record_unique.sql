-- P1-18: Tour-Stop-Completion — Doppelte service_records verhindern
-- Verhindert, dass derselbe Caregiver für denselben Client am selben Tag
-- und zur selben Startzeit mehrere aktive Einträge anlegt.
-- Nur aktive (nicht stornierte, nicht gelöschte) Records werden geprüft.

CREATE UNIQUE INDEX IF NOT EXISTS idx_service_records_unique_entry
  ON public.service_records (caregiver_id, client_id, date, start_time)
  WHERE deleted_at IS NULL AND status != 'cancelled';
