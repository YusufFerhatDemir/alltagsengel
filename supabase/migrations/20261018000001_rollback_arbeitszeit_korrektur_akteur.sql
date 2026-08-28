-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK zu 20261018000000_arbeitszeit_korrektur_akteur.sql
--
-- WARNUNG — was dieses Rollback wiederherstellt, ist ein bekannter Defekt:
--   • jede Zeitkorrektur ueber den Dienstschluessel scheitert danach
--     wieder mit 23502 auf personal_zeitkorrekturen.korrigiert_von
--   • die Sperre einer gesperrten Arbeitszeit laesst sich danach wieder
--     durch ein mitgeschicktes `gesperrt = false` umgehen
-- Es ist deshalb nur fuer den Fall gedacht, dass die Migration selbst
-- Schaden anrichtet — nicht als Aufraeumschritt.
--
-- Die Spalte `geaendert_von` bleibt bewusst STEHEN: sie traegt Daten
-- (den letzten Schreiber je Zeile), und ein DROP COLUMN wuerde sie
-- unwiederbringlich verlieren. Sie stoert die Vorfassung des Triggers
-- nicht, weil die sie gar nicht liest.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- Wortgleiche Vorfassung, wie sie am 29.08.2026 aus pg_proc gelesen wurde.
CREATE OR REPLACE FUNCTION public.log_arbeitszeit_korrektur()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF OLD.gesperrt = true AND NEW.gesperrt = true THEN
    RAISE EXCEPTION 'Gesperrte Arbeitszeit kann nicht bearbeitet werden.';
  END IF;

  IF OLD.start_zeit IS DISTINCT FROM NEW.start_zeit THEN
    INSERT INTO personal_zeitkorrekturen (organization_id, arbeitszeit_id, caregiver_id, feld, alter_wert, neuer_wert, grund, korrigiert_von)
    VALUES (NEW.organization_id, NEW.id, NEW.caregiver_id, 'start_zeit', OLD.start_zeit::text, NEW.start_zeit::text, COALESCE(NEW.bemerkung, 'Korrektur'), auth.uid());
  END IF;

  IF OLD.end_zeit IS DISTINCT FROM NEW.end_zeit THEN
    INSERT INTO personal_zeitkorrekturen (organization_id, arbeitszeit_id, caregiver_id, feld, alter_wert, neuer_wert, grund, korrigiert_von)
    VALUES (NEW.organization_id, NEW.id, NEW.caregiver_id, 'end_zeit', OLD.end_zeit::text, NEW.end_zeit::text, COALESCE(NEW.bemerkung, 'Korrektur'), auth.uid());
  END IF;

  IF OLD.pause_minuten IS DISTINCT FROM NEW.pause_minuten THEN
    INSERT INTO personal_zeitkorrekturen (organization_id, arbeitszeit_id, caregiver_id, feld, alter_wert, neuer_wert, grund, korrigiert_von)
    VALUES (NEW.organization_id, NEW.id, NEW.caregiver_id, 'pause_minuten', OLD.pause_minuten::text, NEW.pause_minuten::text, COALESCE(NEW.bemerkung, 'Korrektur'), auth.uid());
  END IF;

  IF OLD.ist_minuten IS DISTINCT FROM NEW.ist_minuten THEN
    INSERT INTO personal_zeitkorrekturen (organization_id, arbeitszeit_id, caregiver_id, feld, alter_wert, neuer_wert, grund, korrigiert_von)
    VALUES (NEW.organization_id, NEW.id, NEW.caregiver_id, 'ist_minuten', OLD.ist_minuten::text, NEW.ist_minuten::text, COALESCE(NEW.bemerkung, 'Korrektur'), auth.uid());
  END IF;

  IF OLD.status NOT IN ('erfasst') AND (
    OLD.start_zeit IS DISTINCT FROM NEW.start_zeit OR
    OLD.end_zeit IS DISTINCT FROM NEW.end_zeit OR
    OLD.pause_minuten IS DISTINCT FROM NEW.pause_minuten OR
    OLD.ist_minuten IS DISTINCT FROM NEW.ist_minuten
  ) THEN
    NEW.status := 'korrigiert';
  END IF;

  RETURN NEW;
END;
$function$;

COMMIT;
