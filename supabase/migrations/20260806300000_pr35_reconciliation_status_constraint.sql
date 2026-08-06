-- ============================================================================
-- RECONCILIATION: invoices_status_check Constraint
-- PR #35 Drift-Fix — 2026-08-06
-- ============================================================================
--
-- KONTEXT:
-- Der PR #35 Rollout (Billing Core) hat eine Statusmaschine mit 13 deutschen
-- Statuswerten eingefuehrt. Die bestehende CHECK-Constraint
-- invoices_status_check erlaubte nur 6 englische Werte (draft, sent, paid,
-- partial, rejected, disputed). Waehrend des Rollouts wurde der Constraint
-- manuell erweitert — diese Migration macht die Aenderung reproduzierbar.
--
-- Der Constraint war nicht in den urspruenglichen Migrationen enthalten
-- (weder in der Baseline noch in PR #35).
--
-- IDEMPOTENZ:
-- DROP IF EXISTS + ADD ist sicher wiederholbar.
-- ============================================================================

-- 1. Bestehenden Constraint entfernen (falls vorhanden)
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_status_check;

-- 2. Neuen Constraint mit allen gueltigen Statuswerten erstellen
--    Enthaelt sowohl die Legacy-Werte (englisch) als auch die neuen (deutsch)
ALTER TABLE public.invoices ADD CONSTRAINT invoices_status_check CHECK (
  status IN (
    -- Legacy englische Statuswerte (Bestandsdaten)
    'draft',
    'sent',
    'paid',
    'partial',
    'rejected',
    'disputed',
    -- Neue deutsche Statuswerte (PR #35 Statusmaschine)
    'entwurf',
    'geprueft',
    'freigegeben',
    'uebermittelt',
    'quittiert',
    'abgelehnt',
    'bezahlt',
    'teilweise_bezahlt',
    'gekuerzt',
    'korrektur_erforderlich',
    'erneut_eingereicht',
    'akzeptiert',
    'storniert'
  )
);
