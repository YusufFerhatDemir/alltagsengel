-- ════════════════════════════════════════════════════════════════════
-- ROLLBACK zu 20260910040000_zahlungsziel_bestandsrechnungen.sql
-- ════════════════════════════════════════════════════════════════════
-- Setzt die bereinigten Bestandsrechnungen auf 30 Tage zurueck.
--
-- ACHTUNG — dieser Rollback ist unschaerfer als die Vorwaertsmigration:
-- er erkennt die betroffenen Zeilen nur daran, dass sie ein Zahlungsziel
-- von 14 Tagen haben UND vor dem 14.08.2026 angelegt wurden. Alles, was
-- danach entstanden ist, hat 14 Tage voellig regulaer und wird nicht
-- angefasst.
--
-- Nur ausfuehren, wenn sich herausstellt, dass die 30 Tage bei diesen
-- Rechnungen fachlich gewollt waren (z. B. schriftlich vereinbart).
-- ════════════════════════════════════════════════════════════════════

BEGIN;

UPDATE public.invoices
   SET payment_terms_days = 30,
       due_date           = COALESCE(created_at::date, current_date) + 30
 WHERE payment_terms_days = 14
   AND created_at < TIMESTAMPTZ '2026-08-14 00:00:00+02'
   AND COALESCE(paid_amount, 0) = 0;

COMMIT;
