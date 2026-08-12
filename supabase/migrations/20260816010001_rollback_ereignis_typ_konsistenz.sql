-- ════════════════════════════════════════════════════════════════════════════
-- Rollback zu 20260816010000_ereignis_typ_konsistenz.sql
--
-- Stellt den Constraint-Stand aus 20260812010000 wieder her.
--
-- ACHTUNG: Der Rollback schlaegt fehl, wenn inzwischen Regeln mit einem der
-- neu ergaenzten Typen existieren — das ist beabsichtigt. Solche Zeilen
-- muessen vorher bewusst entfernt oder umgeschluesselt werden, statt sie
-- stillschweigend ungueltig zu machen.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
DECLARE
  betroffen integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ops_ereignis_regeln'
  ) THEN
    RAISE NOTICE 'ops_ereignis_regeln existiert nicht — uebersprungen';
    RETURN;
  END IF;

  SELECT count(*) INTO betroffen
  FROM public.ops_ereignis_regeln
  WHERE ereignis_typ IN (
    'aufgabe_erstellt', 'aufgabe_faellig', 'wiedervorlage_erstellt',
    'nachricht_dringend', 'einsatz_erstellt', 'dienstplan_geaendert',
    'dokument_hochgeladen', 'abrechnung_erstellt', 'pflege_aufnahme',
    'eskalation_ausgeloest', 'system_wartung'
  );

  IF betroffen > 0 THEN
    RAISE EXCEPTION 'Rollback abgebrochen: % Regel(n) nutzen einen der neu ergaenzten Ereignistypen', betroffen;
  END IF;

  ALTER TABLE public.ops_ereignis_regeln
    DROP CONSTRAINT IF EXISTS ops_ereignis_typ_check;

  ALTER TABLE public.ops_ereignis_regeln
    ADD CONSTRAINT ops_ereignis_typ_check CHECK (ereignis_typ IN (
      'qualifikation_abgelaufen', 'qualifikation_warnung',
      'dokument_abgelaufen', 'verordnung_abgelaufen',
      'dienstplan_aenderung', 'neuer_einsatz', 'einsatz_geaendert', 'einsatz_storniert',
      'urlaub_beantragt', 'urlaub_genehmigt', 'urlaub_abgelehnt',
      'aufgabe_zugewiesen', 'aufgabe_ueberfaellig', 'aufgabe_erledigt', 'aufgabe_eskaliert',
      'unterschrift_fehlend', 'pflege_doku_offen',
      'abrechnung_fehler', 'abrechnung_ruecklaefer',
      'wiedervorlage_faellig',
      'nachricht_empfangen',
      'system_kritisch'
    ));
END $$;

COMMIT;
