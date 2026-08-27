-- ═══════════════════════════════════════════════════════════════════════════
-- Medikamentengabe: eindeutiger Index gegen die doppelt dokumentierte Gabe
--
-- BEFUND
-- `medikament_eingaben` (20260820010000) ist append-only und traegt KEINEN
-- eindeutigen Index. `erfasseEingabe()` legte deshalb bei jedem erneuten
-- Klick, bei jedem Wiederholungslauf der Offline-Synchronisation und nach
-- jedem Netzabbruch NACH dem Insert eine ZWEITE Zeile fuer dieselbe geplante
-- Gabe an. In der Pflegeakte steht danach, das Medikament sei zweimal
-- gegeben worden.
--
-- Derselbe Fall ist im Offline-Pfad bereits einmal aufgetreten
-- (`warBereitsErfolgreich` gab bei DB-Fehler false zurueck und liess die
-- Aktion erneut laufen — 20261009). Dort wurde die Ursache behoben, der
-- Endpunkt selbst blieb ungeschuetzt.
--
-- Die Anwendung prueft den Bestand seit dieser Runde selbst und faellt dabei
-- fail-closed aus. Das ist eine Prueflese VOR dem Schreiben und damit nicht
-- rennsicher: zwei gleichzeitige Anfragen lesen beide "nichts da" und
-- schreiben beide. Der Index unten ist der Riegel, der auch das abfaengt.
--
-- WARUM MIT VORPRUEFUNG
-- Ein CREATE UNIQUE INDEX auf einem Bestand mit Dubletten schlaegt fehl und
-- risse die gesamte Migration mit. Der DO-Block legt den Index deshalb nur
-- an, wenn er anlegbar IST, und meldet andernfalls die betroffenen Gaben —
-- die muessen fachlich entschieden werden (welche Dokumentation stimmt),
-- das darf keine Migration raten.
--
-- Der Index deckt nur ENTSCHIEDENE Gaben ab. 'geplant' ist eine blosse
-- Vormerkung; davon darf es mehrere geben, und sie werden ueberschrieben.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  dubletten bigint;
BEGIN
  IF to_regclass('public.medikament_eingaben') IS NULL THEN
    RAISE NOTICE 'medikament_eingaben existiert nicht — uebersprungen.';
    RETURN;
  END IF;

  SELECT count(*) INTO dubletten FROM (
    SELECT 1
    FROM public.medikament_eingaben
    WHERE status IN ('gegeben', 'verweigert', 'ausgelassen')
    GROUP BY medikament_id, geplant_um, einnahme_zeit
    HAVING count(*) > 1
  ) d;

  IF dubletten > 0 THEN
    RAISE WARNING
      'uq_medikament_eingaben_gabe NICHT angelegt: % Gabe(n) sind bereits mehrfach dokumentiert. '
      'Diese Faelle muessen fachlich entschieden werden (welche Dokumentation gilt), '
      'danach diese Migration erneut ausfuehren. Abfrage: '
      'SELECT medikament_id, geplant_um, einnahme_zeit, count(*) FROM public.medikament_eingaben '
      'WHERE status IN (''gegeben'',''verweigert'',''ausgelassen'') '
      'GROUP BY 1,2,3 HAVING count(*) > 1;',
      dubletten;
    RETURN;
  END IF;

  CREATE UNIQUE INDEX IF NOT EXISTS uq_medikament_eingaben_gabe
    ON public.medikament_eingaben (medikament_id, geplant_um, einnahme_zeit)
    WHERE status IN ('gegeben', 'verweigert', 'ausgelassen');
END $$;
