-- ============================================================================
-- Legacy Status Backfill: Englische → Deutsche Statuswerte
-- PR #35 Final Closeout — 2026-08-06
-- ============================================================================
--
-- ACHTUNG: Diese Migration darf NUR nach ausdruecklicher Freigabe
-- auf Production ausgefuehrt werden!
--
-- Mapping:
--   draft    → entwurf
--   sent     → uebermittelt
--   paid     → bezahlt
--   partial  → teilweise_bezahlt
--   rejected → abgelehnt
--   disputed → strittig
--
-- Aktuelle Bestandsaufnahme (READ-ONLY, 2026-08-06):
--   sent:     3 Rechnungen
--   paid:     1 Rechnung
--   disputed: 1 Rechnung
--   GESAMT:   5 Rechnungen
--
-- Betroffene Nebentabellen:
--   invoice_disputes: 1 Eintrag (eigenes Statusfeld 'open', nicht betroffen)
--   billing_audit_trail: 0 Eintraege
--   invoice_snapshots: 0 Eintraege
--   invoice_corrections: 0 Eintraege
--
-- IDEMPOTENZ:
--   WHERE-Klausel prueft auf englischen Quellwert — bereits migrierte
--   Zeilen werden nicht erneut aktualisiert.
--
-- ROLLBACK:
--   Siehe 20260806500001_rollback_legacy_status_backfill.sql
-- ============================================================================

-- Trigger temporaer deaktivieren (beide wuerden Status-Aenderungen blockieren)
ALTER TABLE public.invoices DISABLE TRIGGER trg_invoices_no_finalized_edit;
ALTER TABLE public.invoices DISABLE TRIGGER trg_validate_invoice_status;

-- Backfill: englische Status → deutsche Status
UPDATE public.invoices SET status = 'entwurf'           WHERE status = 'draft';
UPDATE public.invoices SET status = 'uebermittelt'      WHERE status = 'sent';
UPDATE public.invoices SET status = 'bezahlt'           WHERE status = 'paid';
UPDATE public.invoices SET status = 'teilweise_bezahlt' WHERE status = 'partial';
UPDATE public.invoices SET status = 'abgelehnt'         WHERE status = 'rejected';
UPDATE public.invoices SET status = 'strittig'          WHERE status = 'disputed';

-- Trigger wieder aktivieren
ALTER TABLE public.invoices ENABLE TRIGGER trg_invoices_no_finalized_edit;
ALTER TABLE public.invoices ENABLE TRIGGER trg_validate_invoice_status;
