-- ============================================================================
-- ROLLBACK: Billing Core – Rechnungsfestschreibung & Korrekturprozess
-- PR #35 – 2026-08-06
-- ============================================================================

-- Trigger entfernen
DROP TRIGGER IF EXISTS trg_validate_invoice_status ON public.invoices;

-- Funktionen entfernen
DROP FUNCTION IF EXISTS public.validate_invoice_status_transition();
DROP FUNCTION IF EXISTS public.next_billing_number(UUID, TEXT, INTEGER);

-- RLS-Policies entfernen (in umgekehrter Reihenfolge)
DROP POLICY IF EXISTS "billing_audit_trail_insert"    ON public.billing_audit_trail;
DROP POLICY IF EXISTS "billing_audit_trail_select"    ON public.billing_audit_trail;
DROP POLICY IF EXISTS "billing_audit_trail_org_fence" ON public.billing_audit_trail;

DROP POLICY IF EXISTS "billing_number_sequences_update"    ON public.billing_number_sequences;
DROP POLICY IF EXISTS "billing_number_sequences_insert"    ON public.billing_number_sequences;
DROP POLICY IF EXISTS "billing_number_sequences_select"    ON public.billing_number_sequences;
DROP POLICY IF EXISTS "billing_number_sequences_org_fence" ON public.billing_number_sequences;

DROP POLICY IF EXISTS "invoice_line_snapshots_insert"    ON public.invoice_line_snapshots;
DROP POLICY IF EXISTS "invoice_line_snapshots_select"    ON public.invoice_line_snapshots;
DROP POLICY IF EXISTS "invoice_line_snapshots_org_fence" ON public.invoice_line_snapshots;

DROP POLICY IF EXISTS "invoice_corrections_update"    ON public.invoice_corrections;
DROP POLICY IF EXISTS "invoice_corrections_insert"    ON public.invoice_corrections;
DROP POLICY IF EXISTS "invoice_corrections_select"    ON public.invoice_corrections;
DROP POLICY IF EXISTS "invoice_corrections_org_fence" ON public.invoice_corrections;

DROP POLICY IF EXISTS "invoice_snapshots_insert"    ON public.invoice_snapshots;
DROP POLICY IF EXISTS "invoice_snapshots_select"    ON public.invoice_snapshots;
DROP POLICY IF EXISTS "invoice_snapshots_org_fence" ON public.invoice_snapshots;

DROP POLICY IF EXISTS "billing_tariffs_update"    ON public.billing_tariffs;
DROP POLICY IF EXISTS "billing_tariffs_insert"    ON public.billing_tariffs;
DROP POLICY IF EXISTS "billing_tariffs_select"    ON public.billing_tariffs;
DROP POLICY IF EXISTS "billing_tariffs_org_fence" ON public.billing_tariffs;

-- Indizes auf invoices entfernen
DROP INDEX IF EXISTS idx_invoices_idempotency;

-- Neue Spalten von invoices entfernen
ALTER TABLE public.invoices DROP COLUMN IF EXISTS deleted_at;
ALTER TABLE public.invoices DROP COLUMN IF EXISTS transmission_status;
ALTER TABLE public.invoices DROP COLUMN IF EXISTS idempotency_key;
ALTER TABLE public.invoices DROP COLUMN IF EXISTS correction_type;
ALTER TABLE public.invoices DROP COLUMN IF EXISTS correction_of;
ALTER TABLE public.invoices DROP COLUMN IF EXISTS frozen_at;
ALTER TABLE public.invoices DROP COLUMN IF EXISTS version;
ALTER TABLE public.invoices DROP COLUMN IF EXISTS invoice_number_formatted;

-- Tabellen entfernen (in Abhaengigkeitsreihenfolge)
DROP TABLE IF EXISTS public.billing_audit_trail;
DROP TABLE IF EXISTS public.billing_number_sequences;
DROP TABLE IF EXISTS public.invoice_line_snapshots;
DROP TABLE IF EXISTS public.invoice_corrections;
DROP TABLE IF EXISTS public.invoice_snapshots;
DROP TABLE IF EXISTS public.billing_tariffs;
