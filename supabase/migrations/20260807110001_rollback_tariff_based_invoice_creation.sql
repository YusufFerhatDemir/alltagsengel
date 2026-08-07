-- ════════════════════════════════════════════════════════════════════════════
-- Rollback: Tarif-basierte Rechnungserstellung zuruecksetzen
-- Datum: 2026-08-07
-- Branch: feature/unified-invoice-creation
--
-- Entfernt:
-- 1. Tarif-Tracking-Spalten aus invoice_items
-- 2. Die tarif-basierte create_invoice_draft_atomic Funktion
--
-- KEINE Datenveraenderung an bestehenden Rechnungen.
-- ════════════════════════════════════════════════════════════════════════════

-- Funktion entfernen
DROP FUNCTION IF EXISTS public.create_invoice_draft_atomic(UUID, UUID, TEXT, TEXT, UUID, TEXT, TEXT);

-- Tarif-Tracking-Spalten entfernen (nur die neuen, nicht die Basisspalten)
ALTER TABLE public.invoice_items DROP COLUMN IF EXISTS tariff_id;
ALTER TABLE public.invoice_items DROP COLUMN IF EXISTS price_source;
ALTER TABLE public.invoice_items DROP COLUMN IF EXISTS tariff_gueltig_ab;
ALTER TABLE public.invoice_items DROP COLUMN IF EXISTS tariff_gueltig_bis;
ALTER TABLE public.invoice_items DROP COLUMN IF EXISTS tariff_preis_cent;
ALTER TABLE public.invoice_items DROP COLUMN IF EXISTS tariff_einheit;
ALTER TABLE public.invoice_items DROP COLUMN IF EXISTS tariff_verguetungsart;
ALTER TABLE public.invoice_items DROP COLUMN IF EXISTS abweichung_cent;
ALTER TABLE public.invoice_items DROP COLUMN IF EXISTS abweichung_grund;

-- Overlap-Constraint und Hilfsfunktion entfernen
ALTER TABLE public.billing_tariffs DROP CONSTRAINT IF EXISTS no_overlapping_tariffs;
DROP FUNCTION IF EXISTS public.tariff_validity_range(DATE, DATE);

-- Typ bleibt erhalten (wurde in der Original-Migration 20260807100000 erstellt)
-- DROP TYPE IF EXISTS public.create_invoice_draft_result;
