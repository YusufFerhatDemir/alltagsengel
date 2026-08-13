-- ═══════════════════════════════════════════════════════════════════
-- ROLLBACK zu 20260901010000_service_record_status_sync.sql
-- ═══════════════════════════════════════════════════════════════════
--
-- Entfernt Trigger und Funktion. Die Bestandskorrektur wird NICHT
-- zurückgerollt: die nachgezogenen status-Werte sind fachlich richtig
-- (unterschriebener Nachweis = 'signed'), ein Zurücksetzen auf 'draft'
-- würde die Rechnungsstellung erneut blockieren und Budgets verfälschen.
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

DROP TRIGGER IF EXISTS trg_sync_record_status ON public.service_records;
DROP FUNCTION IF EXISTS public.sync_service_record_status();

COMMIT;
