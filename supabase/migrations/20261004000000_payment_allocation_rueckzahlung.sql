-- ═══════════════════════════════════════════════════════════════════════
-- payment_allocations: Ruecknahme einer Zuordnung darf benannt werden
-- ═══════════════════════════════════════════════════════════════════════
--
-- BEFUND
-- ------
-- `verarbeiteRuecklastschrift()` (lib/billing/sepa/ruecklastschrift.ts)
-- markiert die zurueckgenommene Zuordnung mit
-- `allocation_type = 'rueckzahlung'`. Dieser Wert steht NICHT im
-- CHECK-Constraint aus 20260808210000 — Postgres wies das UPDATE mit
-- 23514 ab.
--
-- Der Rueckgabewert wurde nicht gelesen. Folge: die Zuordnung blieb als
-- 'vollzahlung' stehen und behauptete weiter, die Rechnung sei bezahlt,
-- WAEHREND `payments.allocated_cents` im selben Vorgang bereits reduziert
-- wurde. Die beiden Tabellen widersprachen sich nach jeder
-- Ruecklastschrift, und `UNIQUE(payment_id, invoice_id)` blockierte
-- zusaetzlich jede spaetere erneute Zuordnung derselben Zahlung.
--
-- Solange diese Migration nicht angewendet ist, faellt der Code auf das
-- Entfernen der Zuordnungszeile zurueck (dokumentiert dort) — die Buecher
-- bleiben dann konsistent, nur die Historie fehlt.

ALTER TABLE public.payment_allocations
  DROP CONSTRAINT IF EXISTS payment_allocations_allocation_type_check;

ALTER TABLE public.payment_allocations
  ADD CONSTRAINT payment_allocations_allocation_type_check
  CHECK (allocation_type IN (
    'vollzahlung', 'teilzahlung', 'ueberzahlung',
    'sammelzahlung_anteil', 'gutschrift_verrechnung',
    -- NEU: die Zuordnung wurde zurueckgenommen (Ruecklastschrift,
    -- Stornierung einer Zahlung). Der Betrag zaehlt nicht mehr auf die
    -- Rechnung.
    'rueckzahlung'
  ));
