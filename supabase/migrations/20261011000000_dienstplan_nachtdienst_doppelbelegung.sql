-- ═══════════════════════════════════════════════════════════════════════════
-- Dienstplan: Doppelbelegungs-Prüfung über Mitternacht
--
-- BEFUND
-- `check_doppelbelegung()` (20260811010000_personalmanagement.sql) verglich
-- zwei Dienste ausschliesslich als Uhrzeiten DESSELBEN Kalendertages:
--
--     NEW.start_zeit < end_zeit AND NEW.end_zeit > start_zeit
--
-- Ein Nachtdienst traegt aber end_zeit <= start_zeit (22:00–06:00). Fuer den
-- Vergleich oben ist dieses Intervall LEER — die Bedingung wird fuer jeden
-- Gegenspieler falsch. Folge, in beide Richtungen:
--
--   · Ein zweiter Nachtdienst 23:00–05:00 fuer dieselbe Kraft am selben Tag
--     lief anstandslos durch. Genau die Doppelbelegung, die der Trigger
--     verhindern soll, war bei Nachtdiensten NICHT abgesichert.
--   · Umgekehrt hing der Dienst 22:00–06:00 des Vortages ungeprueft in den
--     Folgetag hinein: ein Fruehdienst 05:00–09:00 am Folgetag kollidiert
--     tatsaechlich, wurde aber nie gemeldet, weil der Trigger nur `datum =
--     NEW.datum` betrachtete.
--
-- Die Tabelle hat keinen CHECK auf end_zeit > start_zeit, und
-- `lib/personal/types.ts` haelt ausdruecklich fest, dass Nachtdienste ueber
-- Mitternacht legitim sind. Der Fehler liegt also in der Pruefung, nicht in
-- den Daten — es wird NICHT verboten, sondern richtig gerechnet.
--
-- KORREKTUR
-- Beide Dienste werden in Minuten seit Mitternacht IHRES Kalendertages
-- umgerechnet und auf die Zeitachse von NEW.datum gelegt:
--
--     start_abs = (r.datum - NEW.datum) * 1440 + minuten(r.start_zeit)
--     dauer     = end > start ? end - start
--               : end = start ? 0            (Null-Dienst, ueberlappt nie)
--               : end - start + 1440         (ueber Mitternacht)
--
-- Verglichen wird dann das gewoehnliche Halboffen-Intervall
-- `a.start < b.ende AND b.start < a.ende`; Beruehrung an den Raendern
-- (06:00-Ende trifft 06:00-Beginn) bleibt konfliktfrei wie bisher.
--
-- Der Suchraum waechst dafuer auf `datum-1 .. datum+1` — ohne den Vortag
-- bliebe der hineinragende Nachtdienst weiter unsichtbar.
--
-- Die Abwesenheitspruefung im zweiten Teil der Funktion bleibt Wort fuer
-- Wort unveraendert.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION check_doppelbelegung()
RETURNS TRIGGER AS $$
DECLARE
  neu_start integer;
  neu_ende  integer;
BEGIN
  -- Nur prüfen wenn Caregiver zugewiesen und nicht ausgefallen
  IF NEW.caregiver_id IS NOT NULL AND NEW.status != 'ausgefallen' THEN
    neu_start := EXTRACT(HOUR FROM NEW.start_zeit)::int * 60
               + EXTRACT(MINUTE FROM NEW.start_zeit)::int;
    neu_ende  := neu_start + CASE
      WHEN NEW.end_zeit > NEW.start_zeit THEN
        (EXTRACT(HOUR FROM NEW.end_zeit)::int * 60 + EXTRACT(MINUTE FROM NEW.end_zeit)::int)
        - neu_start
      WHEN NEW.end_zeit = NEW.start_zeit THEN 0
      ELSE
        (EXTRACT(HOUR FROM NEW.end_zeit)::int * 60 + EXTRACT(MINUTE FROM NEW.end_zeit)::int)
        - neu_start + 1440
    END;

    IF neu_ende > neu_start AND EXISTS (
      SELECT 1 FROM dienstplan_eintraege d
      CROSS JOIN LATERAL (
        SELECT
          (d.datum - NEW.datum) * 1440
          + EXTRACT(HOUR FROM d.start_zeit)::int * 60
          + EXTRACT(MINUTE FROM d.start_zeit)::int AS s,
          CASE
            WHEN d.end_zeit > d.start_zeit THEN
              (EXTRACT(HOUR FROM d.end_zeit)::int * 60 + EXTRACT(MINUTE FROM d.end_zeit)::int)
              - (EXTRACT(HOUR FROM d.start_zeit)::int * 60 + EXTRACT(MINUTE FROM d.start_zeit)::int)
            WHEN d.end_zeit = d.start_zeit THEN 0
            ELSE
              (EXTRACT(HOUR FROM d.end_zeit)::int * 60 + EXTRACT(MINUTE FROM d.end_zeit)::int)
              - (EXTRACT(HOUR FROM d.start_zeit)::int * 60 + EXTRACT(MINUTE FROM d.start_zeit)::int)
              + 1440
          END AS dauer
      ) z
      WHERE d.id != NEW.id
        AND d.organization_id = NEW.organization_id
        AND d.caregiver_id = NEW.caregiver_id
        AND d.datum BETWEEN NEW.datum - 1 AND NEW.datum + 1
        AND d.status != 'ausgefallen'
        -- Null-Dienste (Beginn = Ende) belegen keine Zeit und koennen
        -- deshalb nichts blockieren. Ohne diese Zeile trifft der
        -- Halboffen-Vergleich das entartete Intervall [t, t) faelschlich.
        AND z.dauer > 0
        AND neu_start < z.s + z.dauer
        AND z.s < neu_ende
    ) THEN
      RAISE EXCEPTION 'Doppelbelegung: Mitarbeiter hat bereits einen Dienst in diesem Zeitraum.';
    END IF;
  END IF;

  -- Prüfe auch auf Abwesenheit
  IF NEW.caregiver_id IS NOT NULL AND NEW.status NOT IN ('ausgefallen','vertretung') THEN
    IF EXISTS (
      SELECT 1 FROM absences
      WHERE organization_id = NEW.organization_id
        AND caregiver_id = NEW.caregiver_id
        AND NEW.datum BETWEEN start_date AND end_date
        AND (status IS NULL OR status IN ('beantragt','genehmigt'))
    ) THEN
      RAISE EXCEPTION 'Konflikt: Mitarbeiter ist an diesem Tag als abwesend gemeldet.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_doppelbelegung ON dienstplan_eintraege;
CREATE TRIGGER trg_check_doppelbelegung
  BEFORE INSERT OR UPDATE ON dienstplan_eintraege
  FOR EACH ROW EXECUTE FUNCTION check_doppelbelegung();
