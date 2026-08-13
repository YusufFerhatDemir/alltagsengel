-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Fix wf_trigger_zahlung — Zahlungseingang wieder möglich
-- Datum:     2026-08-14 (Befund Stream 1 / Pilot-E2E)
-- ═══════════════════════════════════════════════════════════════════════════
-- BEFUND (live reproduziert):
--   INSERT INTO public.payments (…) → ERROR 42703
--   „record "new" has no field "invoice_id"“
--
--   public.wf_trigger_zahlung() aus 20260813010000_workflow_engine.sql liest
--   NEW.invoice_id. Diese Spalte gibt es auf public.payments nicht und hat es
--   nie gegeben: eine Zahlung ist bewusst NICHT genau einer Rechnung
--   zugeordnet — die Verknüpfung liegt in public.payment_allocations
--   (n:m, inklusive Teil- und Sammelzahlungen).
--
-- AUSWIRKUNG:
--   Der AFTER-INSERT-Trigger scheitert und rollt den INSERT zurück. Damit ist
--   JEDER Zahlungseingang blockiert — und in der Folge OPOS-Ausgleich,
--   Mahnlauf und der DATEV-Weg. Live sichtbar an 0 Zeilen in payments und
--   payment_allocations bei gleichzeitig offenen Rechnungen.
--
-- LÖSUNG:
--   Funktionsrumpf ersetzen. Das Event trägt nur, was auf der Zahlung selbst
--   steht. Die Rechnungszuordnung ist ein eigener Vorgang und gehört nicht in
--   das Zahlungs-Event — sie entsteht erst mit der Allocation.
--
-- BEWUSST NICHT: eine Spalte payments.invoice_id nachrüsten. Das würde das
--   n:m-Modell brechen und Teilzahlungen auf mehrere Rechnungen unmöglich
--   machen.
--
-- IDEMPOTENT: CREATE OR REPLACE FUNCTION.
-- ROLLBACK:   20260905000001_rollback_fix_wf_trigger_zahlung.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION public.wf_trigger_zahlung()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.wf_emit_event(
    NEW.organization_id,
    'zahlung_eingegangen',
    'forderungen',
    'payments',
    NEW.id,
    -- Nur Felder, die es auf public.payments wirklich gibt. Die Zuordnung zu
    -- Rechnungen steht in payment_allocations und ist hier noch unbekannt.
    jsonb_build_object(
      'amount_cents', NEW.amount_cents,
      'payment_date', NEW.payment_date,
      'payment_method', NEW.payment_method,
      'payer_type', NEW.payer_type,
      'matching_status', NEW.matching_status
    )
  );
  RETURN NEW;
END;
$$;

COMMIT;
