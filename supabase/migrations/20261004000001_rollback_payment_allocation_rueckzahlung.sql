-- Rollback zu 20261004000000_payment_allocation_rueckzahlung.sql
--
-- ACHTUNG: schlaegt fehl, wenn bereits Zeilen mit
-- allocation_type = 'rueckzahlung' existieren. Das ist Absicht — ein
-- Rollback darf keine bestehende Buchungshistorie unlesbar machen.

BEGIN;

ALTER TABLE public.payment_allocations
  DROP CONSTRAINT IF EXISTS payment_allocations_allocation_type_check;

ALTER TABLE public.payment_allocations
  ADD CONSTRAINT payment_allocations_allocation_type_check
  CHECK (allocation_type IN (
    'vollzahlung', 'teilzahlung', 'ueberzahlung',
    'sammelzahlung_anteil', 'gutschrift_verrechnung'
  ));

COMMIT;
