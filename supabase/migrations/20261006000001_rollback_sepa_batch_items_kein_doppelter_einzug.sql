-- Rollback zu 20261006000000_sepa_batch_items_kein_doppelter_einzug.sql
--
-- ACHTUNG: nach dem Entfernen ist der doppelte Lastschrifteinzug wieder
-- allein durch den Anwendungscode gesperrt (CAS-Guard in createSepaBatch).
DROP INDEX IF EXISTS public.uq_sepa_batch_items_invoice_offen;
