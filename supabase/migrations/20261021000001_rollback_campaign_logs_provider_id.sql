-- Rollback zu 20261021000000_campaign_logs_provider_id.sql
--
-- Nimmt nur den Index zurueck. Der Webhook laeuft danach weiter, aber
-- wieder mit Sequential Scan je Ereignis — und ohne die Zusicherung, dass
-- eine Provider-Kennung nur eine Zeile trifft.

DROP INDEX IF EXISTS public.email_campaign_logs_provider_id;
