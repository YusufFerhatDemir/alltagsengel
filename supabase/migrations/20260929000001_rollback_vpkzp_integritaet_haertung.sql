-- Rollback zu 20260929000000_vpkzp_integritaet_haertung.sql
--
-- Setzt die drei Haertungen zurueck. vpkzp_fortschreiben() wird dabei
-- NICHT auf die Fassung ohne Sperre zurueckgedreht: der Wettlauf-Befund
-- ist ein Fehler, kein Merkmal, und eine Ruecknahme wuerde das
-- Tagekontingent wieder umgehbar machen. Wer die Funktion wirklich in
-- den alten Stand bringen will, spielt 20260926000000 erneut ein — sie
-- ist idempotent.

BEGIN;

DROP TRIGGER IF EXISTS trg_vpkzp_audit_nur_aus_trigger ON public.vpkzp_audit_log;
DROP FUNCTION IF EXISTS public.trg_vpkzp_audit_nur_aus_trigger();

ALTER TABLE public.vpkzp_buchungen
  DROP CONSTRAINT IF EXISTS vpkzp_buchungen_betrag_nicht_negativ,
  DROP CONSTRAINT IF EXISTS vpkzp_buchungen_budgetbetrag_nicht_negativ,
  DROP CONSTRAINT IF EXISTS vpkzp_buchungen_privatbetrag_nicht_negativ;

COMMIT;
