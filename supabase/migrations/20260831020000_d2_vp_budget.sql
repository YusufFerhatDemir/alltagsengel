-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: D2 — VP-Budget (Verhinderungspflege § 39 SGB XI)
-- Datum:     2026-08-12 (Betriebsabnahme-Befund D2)
-- ═══════════════════════════════════════════════════════════════════════════
-- GRUND: Kein dediziertes Budget-Tracking für Verhinderungspflege.
--        client_budgets hatte combined_*-Spalten, aber keinen expliziten
--        budget_type zur Unterscheidung der Budgets.
--
-- LÖSUNG:
--   1) budget_type-Spalte auf client_budgets (DEFAULT 'entlastung')
--   2) Bestehende Zeilen → 'entlastung'
--   3) UNIQUE(client_id, year, budget_type) für Doppelbuchungsschutz
--   4) combined_annual_amount-Default auf 3539 korrigiert (§ 39+42, PUEG +4,5% ab 01.01.2025)
--
-- IDEMPOTENT: IF NOT EXISTS / IF EXISTS Guards.
-- ROLLBACK:   20260831020001_rollback_d2_vp_budget.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. budget_type-Spalte hinzufügen ───────────────────────────────────

ALTER TABLE public.client_budgets
  ADD COLUMN IF NOT EXISTS budget_type text NOT NULL DEFAULT 'entlastung';

-- ── 2. CHECK-Constraint für erlaubte Budget-Typen ──────────────────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'client_budgets_budget_type_check') THEN
    ALTER TABLE public.client_budgets
      ADD CONSTRAINT client_budgets_budget_type_check
      CHECK (budget_type IN ('entlastung', 'verhinderungspflege'));
  END IF;
END $$;

-- ── 3. UNIQUE-Constraint: ein Budget pro Klient/Jahr/Typ ──────────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'client_budgets_client_year_type_unique') THEN
    ALTER TABLE public.client_budgets
      ADD CONSTRAINT client_budgets_client_year_type_unique
      UNIQUE (client_id, year, budget_type);
  END IF;
END $$;

-- ── 4. combined_annual_amount-Default auf korrekten Wert (3539, PUEG +4,5%) ──

ALTER TABLE public.client_budgets
  ALTER COLUMN combined_annual_amount SET DEFAULT 3539.0;

COMMIT;
