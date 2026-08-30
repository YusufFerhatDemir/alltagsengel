-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK zu 20261019000000_marketing_crm.sql
--
-- ACHTUNG — WAS DIESER ROLLBACK MIT SICH NIMMT
-- `email_suppression_list` ist die Liste der Menschen, die der Werbung
-- WIDERSPROCHEN haben. Sie zu loeschen heisst: der Widerspruch ist weg, und
-- beim naechsten Aufbau ist jeder dieser Empfaenger wieder anschreibbar.
-- Das ist ein Verstoss gegen Art. 21 Abs. 3 DSGVO, nicht bloss ein
-- Datenverlust.
--
-- Deshalb bricht dieser Rollback AB, sobald die Sperrliste oder der
-- Einwilligungsbestand belegt ist. Wer trotzdem zurueckbauen will, sichert
-- beide Tabellen vorher und leert sie bewusst.
--
-- Der Rollback ist fuer den Fall gedacht, dass die Migration angewendet
-- wurde und die Tabellen noch LEER sind.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
DECLARE
  n_sperre integer := 0;
  n_consent integer := 0;
BEGIN
  IF to_regclass('public.email_suppression_list') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.email_suppression_list' INTO n_sperre;
  END IF;
  IF to_regclass('public.marketing_consents') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.marketing_consents' INTO n_consent;
  END IF;

  IF n_sperre > 0 OR n_consent > 0 THEN
    RAISE EXCEPTION
      'Rollback abgebrochen: % Sperrlisten- und % Einwilligungseintraege vorhanden. '
      'Diese Zeilen sind der Nachweis nach Art. 7 Abs. 1 DSGVO bzw. die Umsetzung '
      'des Widerspruchs nach Art. 21 Abs. 3 DSGVO. Vor dem Rollback sichern und '
      'bewusst leeren.', n_sperre, n_consent;
  END IF;
END;
$$;

DROP TABLE IF EXISTS public.email_campaign_logs;
DROP TABLE IF EXISTS public.email_campaigns;
DROP TABLE IF EXISTS public.marketing_automations;
DROP TABLE IF EXISTS public.email_templates;
DROP TABLE IF EXISTS public.email_suppression_list;
DROP TABLE IF EXISTS public.marketing_consents;

COMMIT;
