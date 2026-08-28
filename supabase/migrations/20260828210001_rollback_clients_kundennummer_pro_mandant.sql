-- Rollback zu 20260828210000_clients_kundennummer_pro_mandant.sql.
--
-- ACHTUNG: stellt den GLOBALEN Index wieder her. Danach kann ein Mandant
-- eine Kundennummer nicht mehr vergeben, wenn ein anderer sie fuehrt —
-- der Zustand, den der Befund beschreibt. Nur zuruecknehmen, wenn die
-- Umstellung selbst Probleme macht.

BEGIN;

ALTER TABLE public.clients
  DROP CONSTRAINT IF EXISTS clients_kundennummer_pro_mandant;

ALTER TABLE public.clients
  ADD CONSTRAINT clients_customer_number_key UNIQUE (customer_number);

COMMIT;
