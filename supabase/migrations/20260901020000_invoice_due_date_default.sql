-- ═══════════════════════════════════════════════════════════════════
-- OPOS: invoices.due_date automatisch setzen (Zahlungsziel 14 Tage)
-- ═══════════════════════════════════════════════════════════════════
--
-- BEFUND (Stand 2026-08-13, live über PostgREST geprüft):
-- ALLE Rechnungen haben due_date = NULL. Die Spalte kam mit Migration
-- 20260808210000, wurde aber von keinem Schreibpfad befüllt —
-- create_invoice_draft_atomic() kennt sie nicht, und die Storno-/Korrektur-/
-- Gutschrift-Inserts der invoice-engine setzten sie ebenfalls nicht.
--
-- Folge: jede zahlungszielbasierte Auswertung läuft leer bzw. falsch —
--   • lib/billing/opos/opos-manager.ts    → Fälligkeitsdatum null,
--                                            OPOS-Altersklassen fallen aus
--   • lib/billing/core/dunning.ts         → Fallback auf "heute",
--                                            jede Rechnung sofort überfällig
--   • workflow_engine (20260813010000)    → WHERE due_date < current_date
--                                            findet nie etwas
--   • idx_invoices_due_date               → Index ohne Nutzen
--
-- FIX (drei Teile)
--   1) Standard-Zahlungsziel auf 14 Tage. invoices.payment_terms_days stand
--      auf DEFAULT 30 — dieser Default war nie fachlich gesetzt, sondern kam
--      als Spalten-Default mit der Erweiterungsmigration mit. Bestandszeilen
--      behalten ihren gespeicherten Wert (SET DEFAULT wirkt nur für neue
--      Zeilen); ein je Rechnung abweichend gesetztes Ziel bleibt gültig.
--   2) BEFORE-INSERT-Trigger: due_date = Rechnungsdatum + payment_terms_days,
--      sofern due_date nicht ausdrücklich mitgegeben wurde. Damit ist auch
--      der RPC-Pfad abgedeckt, ohne create_invoice_draft_atomic() anfassen
--      und dabei die Fail-Closed-Tarifprüfung neu schreiben zu müssen.
--      Nur INSERT: ein später bewusst geleertes due_date wird nicht
--      automatisch wieder gefüllt.
--   3) Backfill für Bestandsrechnungen ohne due_date, aus deren eigenem
--      gespeicherten payment_terms_days — nicht aus dem neuen Standard.
--
-- Die Anwendung setzt Zahlungsziel und Fälligkeit zusätzlich selbst
-- (lib/billing/core/zahlungsziel.ts), damit der Fix auch ohne diese Migration
-- greift. Beide Seiten rechnen identisch, der Trigger überschreibt nichts.
--
-- Rollback: 20260901020001_rollback_invoice_due_date_default.sql
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1) Standard-Zahlungsziel: 14 Tage ───────────────────────────────
ALTER TABLE public.invoices
  ALTER COLUMN payment_terms_days SET DEFAULT 14;

COMMENT ON COLUMN public.invoices.payment_terms_days IS
  'Zahlungsziel in Tagen ab Rechnungsdatum. Standard 14. '
  'Grundlage für due_date (Trigger trg_set_invoice_due_date).';

-- ── 2) Trigger: due_date aus Rechnungsdatum + Zahlungsziel ──────────
CREATE OR REPLACE FUNCTION public.set_invoice_due_date()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Ausdrücklich mitgegebene Fälligkeit hat Vorrang.
  IF NEW.due_date IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- date + integer = date (kein Interval-Cast nötig)
  NEW.due_date :=
    COALESCE(NEW.created_at::date, current_date)
    + COALESCE(NEW.payment_terms_days, 14);

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.set_invoice_due_date() IS
  'Setzt invoices.due_date = Rechnungsdatum + payment_terms_days, '
  'sofern beim INSERT keine Fälligkeit mitgegeben wurde.';

DROP TRIGGER IF EXISTS trg_set_invoice_due_date ON public.invoices;
CREATE TRIGGER trg_set_invoice_due_date
  BEFORE INSERT ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.set_invoice_due_date();

-- ── 3) Backfill: Bestandsrechnungen ohne Fälligkeit ─────────────────
-- Aus dem je Rechnung GESPEICHERTEN Zahlungsziel, nicht aus dem neuen
-- Standard — Altrechnungen wurden mit ihrem damaligen Ziel gestellt.
UPDATE public.invoices
   SET due_date = COALESCE(created_at::date, current_date)
                  + COALESCE(payment_terms_days, 14)
 WHERE due_date IS NULL;

COMMIT;
