-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK zu 20261018000000_perimeter_lead_inquiries_offene_tuer.sql
--
-- Stellt den Live-Stand vom 28.08.2026 wieder her — INKLUSIVE seines
-- Befundes. Nach diesem Rollback kann jedes angemeldete Konto wieder
-- beliebige Zeilen in `lead_inquiries` schreiben, mit frei gewaehltem
-- `status`. Das ist kein Versehen dieser Datei, sondern ihr Zweck: ein
-- Rollback, der etwas anderes wiederherstellt als das, was vorher da war,
-- ist kein Rollback.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.lead_inquiries
  DROP CONSTRAINT IF EXISTS lead_inquiries_status_check;

-- Wortgleich mit 20260606_lead_inquiries.sql, Zeilen 26-29.
DROP POLICY IF EXISTS "Anyone can submit lead inquiry" ON public.lead_inquiries;
CREATE POLICY "Anyone can submit lead inquiry" ON public.lead_inquiries
  FOR INSERT WITH CHECK (true);

COMMIT;
