-- ═══════════════════════════════════════════════════════════════════════════
-- Einsatzplanung: Doppelbelegungs-Pruefung ueber Mitternacht (assignments)
--
-- BEFUND
-- `check_assignment_overlap()` (20260808200000_einsatzplanung_leistungs-
-- nachweise.sql) vergleicht zwei Einsaetze ausschliesslich als Uhrzeiten
-- DESSELBEN Kalendertages:
--
--     start_time < NEW.end_time AND end_time > NEW.start_time
--
-- Ein Nachteinsatz traegt aber end_time <= start_time (22:00–06:00). Fuer
-- diesen Vergleich ist das Intervall LEER — die Bedingung wird gegen JEDEN
-- Gegenspieler falsch. Dieselbe Luecke wurde am 11.10. bereits fuer den
-- Dienstplan geschlossen (20261011000000); auf `assignments` — der Tabelle,
-- an der Tourenplanung, Kalender, Engel-App und Leistungsnachweis haengen —
-- stand sie noch offen. Folge, in beide Richtungen:
--
--   · Ein zweiter Nachteinsatz 23:00–05:00 derselben Kraft am selben Tag
--     lief anstandslos durch. Genau die Doppelbelegung, die der Trigger
--     verhindern soll, war bei Nachteinsaetzen NICHT abgesichert — und weil
--     die Tourenplanung ihre Konfliktzusage ausdruecklich an diesen Trigger
--     delegiert ("die Wahrheit ueber Zeitkonflikte bleibt der Trigger"),
--     war sie dort ebenfalls offen.
--   · Umgekehrt ragte der Einsatz 22:00–06:00 des Vortages ungeprueft in den
--     Folgetag: ein Fruehdienst 05:00–09:00 kollidiert tatsaechlich, wurde
--     aber nie gemeldet, weil nur `assignment_date = NEW.assignment_date`
--     betrachtet wurde.
--
-- Die Tabelle hat keinen CHECK auf end_time > start_time; Nachteinsaetze sind
-- fachlich gewollt (Nachtwache, Verhinderungspflege ueber Nacht). Der Fehler
-- liegt also in der Pruefung, nicht in den Daten — es wird NICHT verboten,
-- sondern richtig gerechnet.
--
-- KORREKTUR
-- Beide Einsaetze werden in Minuten seit Mitternacht IHRES Tages umgerechnet
-- und auf die Zeitachse des Kandidaten gelegt:
--
--     start_abs = versatz_tage * 1440 + minuten(start_time)
--     dauer     = end > start ? end - start
--               : end = start ? 0            (Null-Einsatz, belegt nichts)
--               : end - start + 1440         (ueber Mitternacht)
--
-- Verglichen wird das gewoehnliche Halboffen-Intervall
-- `a.start < b.ende AND b.start < a.ende`; Beruehrung an den Raendern
-- (06:00-Ende trifft 06:00-Beginn) bleibt konfliktfrei wie bisher.
--
-- Der Suchraum waechst dafuer auf `assignment_date-1 .. assignment_date+1` —
-- ohne den Vortag bliebe der hineinragende Nachteinsatz unsichtbar.
--
-- SERIEN (assignment_date IS NULL, weekday gesetzt) bekommen dieselbe
-- Rechnung: der Versatz kommt dort aus dem Wochentagsabstand. `weekday`
-- fuehrt Sonntag historisch als 0 ODER 7 — deshalb wird durchgaengig
-- `weekday % 7` gerechnet, sonst waere der Abstand zwischen 0 und 7
-- scheinbar 7 statt 0. Betrachtet werden nur die Abstaende -1, 0 und +1;
-- weiter reicht kein Einsatz, der hoechstens 24 Stunden dauert.
-- Das Gueltigkeitsfenster (valid_from/valid_until) bleibt Wort fuer Wort
-- wie bisher.
--
-- Idempotent: CREATE OR REPLACE + DROP/CREATE TRIGGER.
-- Kein BEGIN/COMMIT (der _run_sql-Apply-Weg laeuft bereits in einer
-- Transaktion und lehnt Transaktionskommandos mit 0A000 ab).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.check_assignment_overlap()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_conflict_id uuid;
  neu_start integer;
  neu_dauer integer;
BEGIN
  IF NEW.status IN ('STORNIERT', 'cancelled', 'NO_SHOW') THEN
    RETURN NEW;
  END IF;

  IF NEW.assignment_date IS NULL AND NEW.weekday IS NULL THEN
    RETURN NEW;
  END IF;

  neu_start := EXTRACT(HOUR FROM NEW.start_time)::int * 60
             + EXTRACT(MINUTE FROM NEW.start_time)::int;
  neu_dauer := CASE
    WHEN NEW.end_time > NEW.start_time THEN
      (EXTRACT(HOUR FROM NEW.end_time)::int * 60 + EXTRACT(MINUTE FROM NEW.end_time)::int)
      - neu_start
    WHEN NEW.end_time = NEW.start_time THEN 0
    ELSE
      (EXTRACT(HOUR FROM NEW.end_time)::int * 60 + EXTRACT(MINUTE FROM NEW.end_time)::int)
      - neu_start + 1440
  END;

  -- Ein Einsatz ohne Dauer belegt keine Zeit und kann deshalb weder
  -- kollidieren noch blockieren. Ohne diese Schranke traefe der
  -- Halboffen-Vergleich das entartete Intervall [t, t) falsch.
  IF neu_dauer <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT a.id INTO v_conflict_id
  FROM public.assignments a
  CROSS JOIN LATERAL (
    SELECT
      CASE
        WHEN NEW.assignment_date IS NOT NULL THEN (a.assignment_date - NEW.assignment_date)
        -- Wochentagsabstand als -1 / 0 / +1; alles Weitere scheidet aus.
        WHEN ((a.weekday % 7) - (NEW.weekday % 7) + 7) % 7 = 0 THEN 0
        WHEN ((a.weekday % 7) - (NEW.weekday % 7) + 7) % 7 = 1 THEN 1
        WHEN ((a.weekday % 7) - (NEW.weekday % 7) + 7) % 7 = 6 THEN -1
        ELSE NULL
      END AS versatz,
      EXTRACT(HOUR FROM a.start_time)::int * 60
      + EXTRACT(MINUTE FROM a.start_time)::int AS s0,
      CASE
        WHEN a.end_time > a.start_time THEN
          (EXTRACT(HOUR FROM a.end_time)::int * 60 + EXTRACT(MINUTE FROM a.end_time)::int)
          - (EXTRACT(HOUR FROM a.start_time)::int * 60 + EXTRACT(MINUTE FROM a.start_time)::int)
        WHEN a.end_time = a.start_time THEN 0
        ELSE
          (EXTRACT(HOUR FROM a.end_time)::int * 60 + EXTRACT(MINUTE FROM a.end_time)::int)
          - (EXTRACT(HOUR FROM a.start_time)::int * 60 + EXTRACT(MINUTE FROM a.start_time)::int)
          + 1440
      END AS dauer
  ) z
  WHERE a.id != NEW.id
    AND a.caregiver_id = NEW.caregiver_id
    AND a.status NOT IN ('STORNIERT', 'cancelled', 'NO_SHOW')
    AND z.versatz IS NOT NULL
    AND z.versatz BETWEEN -1 AND 1
    AND z.dauer > 0
    AND (
      (NEW.assignment_date IS NOT NULL
        AND a.assignment_date IS NOT NULL
        AND a.assignment_date BETWEEN NEW.assignment_date - 1 AND NEW.assignment_date + 1)
      OR
      (NEW.assignment_date IS NULL
        AND NEW.weekday IS NOT NULL
        AND a.assignment_date IS NULL
        AND a.weekday IS NOT NULL
        AND (a.valid_until IS NULL OR a.valid_until >= COALESCE(NEW.valid_from, CURRENT_DATE))
        AND COALESCE(a.valid_from, CURRENT_DATE) <= COALESCE(NEW.valid_until, '9999-12-31'::date))
    )
    AND neu_start < z.versatz * 1440 + z.s0 + z.dauer
    AND z.versatz * 1440 + z.s0 < neu_start + neu_dauer
  LIMIT 1;

  IF v_conflict_id IS NOT NULL THEN
    RAISE EXCEPTION 'DOPPELBELEGUNG: Mitarbeiter % hat bereits einen Einsatz zur gleichen Zeit (Konflikt: %)',
      NEW.caregiver_id, v_conflict_id
      USING ERRCODE = 'unique_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_assignment_overlap ON public.assignments;
CREATE TRIGGER trg_check_assignment_overlap
  BEFORE INSERT OR UPDATE ON public.assignments
  FOR EACH ROW EXECUTE FUNCTION public.check_assignment_overlap();
