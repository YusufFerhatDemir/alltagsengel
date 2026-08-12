-- ════════════════════════════════════════════════════════════════════════════
-- Migration: ops_ereignis_regeln.ereignis_typ — Constraint an den Code angleichen
-- Datum:     2026-08-16
-- Branch:    staging/expansion-abnahme
--
-- BEFUND
--   Der CHECK-Constraint `ops_ereignis_typ_check` (aus 20260812010000) und die
--   TypeScript-Union `EreignisTyp` (lib/ops/types.ts) waren nie deckungsgleich:
--
--     nur in TypeScript (Postgres lehnt ab, 23514 beim INSERT einer Regel):
--       aufgabe_erstellt, aufgabe_faellig, wiedervorlage_erstellt,
--       nachricht_dringend, einsatz_erstellt, dienstplan_geaendert,
--       dokument_hochgeladen, abrechnung_erstellt, pflege_aufnahme,
--       eskalation_ausgeloest, system_wartung
--
--     nur in der DB (aus dem Code nicht erreichbar):
--       qualifikation_warnung, dokument_abgelaufen, verordnung_abgelaufen,
--       dienstplan_aenderung, neuer_einsatz, einsatz_geaendert,
--       urlaub_abgelehnt, unterschrift_fehlend, pflege_doku_offen,
--       abrechnung_ruecklaefer, system_kritisch
--
--   Wirkung: fuer 11 der 22 im Code bekannten Ereignisse liess sich ueberhaupt
--   keine Benachrichtigungsregel speichern. `emitEreignis()` findet fuer diese
--   Typen folglich nie eine Regel und erzeugt still null Benachrichtigungen —
--   ohne Fehlermeldung, weil das Laden der Regeln selbst fehlerfrei bleibt.
--
-- AENDERUNG
--   Der Constraint wird auf die VEREINIGUNG beider Listen erweitert. Es wird
--   nichts entfernt: jeder bereits zulaessige Wert bleibt zulaessig, damit
--   bestehende Zeilen (aktuell 0) unter keinen Umstaenden ungueltig werden.
--
-- KEINE Datenaenderung (nur Constraint). Idempotent.
-- Rollback: 20260816010001_rollback_ereignis_typ_konsistenz.sql
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ops_ereignis_regeln'
  ) THEN
    RAISE NOTICE 'ops_ereignis_regeln existiert nicht — uebersprungen';
    RETURN;
  END IF;

  ALTER TABLE public.ops_ereignis_regeln
    DROP CONSTRAINT IF EXISTS ops_ereignis_typ_check;

  ALTER TABLE public.ops_ereignis_regeln
    ADD CONSTRAINT ops_ereignis_typ_check CHECK (ereignis_typ IN (
      -- bisher schon zulaessig
      'qualifikation_abgelaufen', 'qualifikation_warnung',
      'dokument_abgelaufen', 'verordnung_abgelaufen',
      'dienstplan_aenderung', 'neuer_einsatz', 'einsatz_geaendert', 'einsatz_storniert',
      'urlaub_beantragt', 'urlaub_genehmigt', 'urlaub_abgelehnt',
      'aufgabe_zugewiesen', 'aufgabe_ueberfaellig', 'aufgabe_erledigt', 'aufgabe_eskaliert',
      'unterschrift_fehlend', 'pflege_doku_offen',
      'abrechnung_fehler', 'abrechnung_ruecklaefer',
      'wiedervorlage_faellig',
      'nachricht_empfangen',
      'system_kritisch',
      -- neu ergaenzt (bisher nur in TypeScript bekannt)
      'aufgabe_erstellt', 'aufgabe_faellig',
      'wiedervorlage_erstellt',
      'nachricht_dringend',
      'einsatz_erstellt',
      'dienstplan_geaendert',
      'dokument_hochgeladen',
      'abrechnung_erstellt',
      'pflege_aufnahme',
      'eskalation_ausgeloest',
      'system_wartung'
    ));
END $$;

COMMIT;

-- ── VERIFIKATION nach dem Apply ─────────────────────────────────────────────
-- Muss ohne Fehler durchlaufen und danach wieder zurueckgerollt werden:
--   BEGIN;
--     INSERT INTO public.ops_ereignis_regeln
--       (organization_id, name, ereignis_typ, titel_vorlage, nachricht_vorlage)
--     VALUES ('00000000-0000-4000-8000-000460629986', 'probe',
--             'abrechnung_erstellt', 't', 'n');
--   ROLLBACK;
