-- Rollback zu 20261130000000_service_records_dauer_pflicht.sql
--
-- ACHTUNG: danach ist ein Leistungsnachweis ohne Zeiten wieder abrechenbar
-- und wird von create_invoice_draft_atomic mit COALESCE(duration_minutes, 60)
-- als eine volle Stunde in Rechnung gestellt.

ALTER TABLE public.service_records
  DROP CONSTRAINT IF EXISTS service_records_dauer_vor_abrechnung;
