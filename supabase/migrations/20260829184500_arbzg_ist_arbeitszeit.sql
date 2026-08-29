-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: ArbZG auf die ERFASSTE Arbeitszeit ziehen (§ 3, § 4, § 5)
--
-- BEFUND GAP-13 (29.08.2026):
--   Die ArbZG-Pruefung des Projekts sitzt seit `20260920060000` auf
--   `dienstplan_eintraege` — also auf dem PLAN. Die tatsaechlich erfasste
--   Arbeitszeit in `personal_arbeitszeiten` wird von keiner Regel beruehrt.
--
--   Das ist die falsche Haelfte. Das Arbeitszeitgesetz bindet an die
--   geleistete Arbeitszeit (§ 2 Abs. 1 ArbZG), nicht an die geplante. Wer
--   8 Stunden eingeplant bekommt und 11,5 Stunden arbeitet, erzeugt einen
--   Verstoss, den heute nichts sieht: der Plan bleibt unauffaellig, und
--   die Zeiterfassung hat keine Regel.
--
--   Zweiter Teil desselben Befundes: § 4 ArbZG (Ruhepausen) fehlte
--   vollstaendig — auch im Plan. Geprueft wurden nur § 3
--   (Tageshoechstarbeitszeit) und § 5 (Ruhezeit). Eine Zwoelfstundenschicht
--   ohne jede Pause war damit im Plan nur EIN Verstoss statt zwei, und in
--   der Erfassung gar keiner.
--
--   Nie aufgefallen, weil `personal_arbeitszeiten` live 0 Zeilen traegt.
--   Das ist eine Aussage ueber den Bestand, nicht ueber den Code.
--
-- WAS DIESE MIGRATION TUT
--   1. `arbeitszeit_verstoesse` wird geweitet: ein Verstoss kann jetzt
--      entweder an einem Dienstplan-Eintrag ODER an einer erfassten
--      Arbeitszeit haengen. Bewusst DIESELBE Tabelle statt einer zweiten:
--      `ladeWochenUebersicht()` (lib/pdl/dienstplanfreigabe.ts) und
--      `fristen-sammler.ts` lesen sie bereits, und ein Verstoss ist ein
--      Verstoss — unabhaengig davon, ob Plan oder Erfassung ihn erzeugt
--      hat. Eine zweite Tabelle haette jeden Leser neu belehren muessen,
--      und `quittiereVerstoss()` waere doppelt zu bauen gewesen.
--   2. Neue Verstoss-Art `pflichtpause` (§ 4 ArbZG).
--   3. Neuer Trigger `arbzg_pruefung_ist()` auf `personal_arbeitszeiten`.
--   4. `arbzg_pruefung()` (Plan) prueft zusaetzlich § 4 und traegt die
--      neue Spalte `basis = 'plan'`.
--
-- BEWUSST NICHT BLOCKIEREND — unveraendert die Entscheidung aus
--   `20260920060000`: ein hartes Verbot wuerde in Notfaellen (spontaner
--   Ausfallersatz) die Einsatzplanung lahmlegen. Der Verstoss wird
--   protokolliert; die PDL entscheidet ueber `quittiereVerstoss()`, und
--   diese Entscheidung verlangt eine Begruendung.
--
-- Datum:     2026-08-29
-- Projekt:   Alltagsengel UG
-- IDEMPOTENT.
-- Rollback:  20260829184501_rollback_arbzg_ist_arbeitszeit.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Tabelle weiten ──────────────────────────────────────────────────────

ALTER TABLE public.arbeitszeit_verstoesse
  ADD COLUMN IF NOT EXISTS arbeitszeit_id uuid
    REFERENCES public.personal_arbeitszeiten(id) ON DELETE CASCADE;

ALTER TABLE public.arbeitszeit_verstoesse
  ADD COLUMN IF NOT EXISTS basis text NOT NULL DEFAULT 'plan';

ALTER TABLE public.arbeitszeit_verstoesse
  ALTER COLUMN eintrag_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_azv_arbeitszeit
  ON public.arbeitszeit_verstoesse(arbeitszeit_id);

-- Verstoss-Arten: `pflichtpause` kommt dazu.
ALTER TABLE public.arbeitszeit_verstoesse
  DROP CONSTRAINT IF EXISTS azv_verstoss_art_check;
ALTER TABLE public.arbeitszeit_verstoesse
  ADD CONSTRAINT azv_verstoss_art_check
  CHECK (verstoss_art IN ('max_tagesarbeitszeit','mindestruhezeit','pflichtpause'));

ALTER TABLE public.arbeitszeit_verstoesse
  DROP CONSTRAINT IF EXISTS azv_basis_check;
ALTER TABLE public.arbeitszeit_verstoesse
  ADD CONSTRAINT azv_basis_check CHECK (basis IN ('plan','ist'));

-- GENAU EINE Herkunft. Ohne diesen Riegel waere eine Zeile ohne beide
-- Bezuege moeglich — ein Verstoss, der zu nichts gehoert und den niemand
-- aufloesen kann, weil die aufraeumenden DELETEs beider Trigger ueber
-- genau diese Bezuege gehen.
ALTER TABLE public.arbeitszeit_verstoesse
  DROP CONSTRAINT IF EXISTS azv_genau_eine_herkunft;
ALTER TABLE public.arbeitszeit_verstoesse
  ADD CONSTRAINT azv_genau_eine_herkunft
  CHECK (num_nonnulls(eintrag_id, arbeitszeit_id) = 1);

-- Die alte UNIQUE-Bedingung traegt nicht mehr: mit nullable `eintrag_id`
-- sind NULL-Werte in Postgres voneinander verschieden, Ist-Verstoesse
-- wuerden sich also unbegrenzt stapeln. Zwei partielle Indizes statt
-- dessen — je einer pro Herkunft.
ALTER TABLE public.arbeitszeit_verstoesse
  DROP CONSTRAINT IF EXISTS azv_eintrag_art_unique;

CREATE UNIQUE INDEX IF NOT EXISTS uq_azv_eintrag_art
  ON public.arbeitszeit_verstoesse(eintrag_id, verstoss_art)
  WHERE eintrag_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_azv_arbeitszeit_art
  ON public.arbeitszeit_verstoesse(arbeitszeit_id, verstoss_art)
  WHERE arbeitszeit_id IS NOT NULL;

COMMENT ON COLUMN public.arbeitszeit_verstoesse.basis IS
  'Woraus der Verstoss stammt: plan = Dienstplan-Eintrag (geplante Zeit), ist = erfasste Arbeitszeit (§ 2 Abs. 1 ArbZG).';

-- ── 2. Plan-Pruefung: § 4 ArbZG ergaenzen, `basis` setzen ───────────────────

CREATE OR REPLACE FUNCTION public.arbzg_pruefung()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_start  timestamptz;
  v_end    timestamptz;
  v_dauer_minuten int;
  v_grenzwert_tag  CONSTANT int := 600;  -- 10h, § 3 ArbZG
  v_grenzwert_ruhe CONSTANT int := 660;  -- 11h, § 5 ArbZG
  v_pflichtpause   int;
  v_pause          int;
  v_vor_ende   timestamptz;
  v_nach_start timestamptz;
  v_gap_vor  int;
  v_gap_nach int;
BEGIN
  IF NEW.caregiver_id IS NULL OR NEW.status = 'ausgefallen' OR NEW.typ IN ('bereitschaft','notdienst') THEN
    DELETE FROM arbeitszeit_verstoesse WHERE eintrag_id = NEW.id;
    RETURN NEW;
  END IF;

  v_start := (NEW.datum + NEW.start_zeit)::timestamptz;
  v_end   := CASE WHEN NEW.end_zeit > NEW.start_zeit
                  THEN (NEW.datum + NEW.end_zeit)::timestamptz
                  ELSE (NEW.datum + 1 + NEW.end_zeit)::timestamptz END;
  v_pause := COALESCE(NEW.pause_minuten, 0);
  v_dauer_minuten := (EXTRACT(EPOCH FROM (v_end - v_start))::int / 60) - v_pause;

  -- Tageshöchstarbeitszeit (§ 3 ArbZG)
  IF v_dauer_minuten > v_grenzwert_tag THEN
    INSERT INTO arbeitszeit_verstoesse
      (organization_id, caregiver_id, eintrag_id, basis, verstoss_art, datum, gemessener_wert_minuten, grenzwert_minuten)
    VALUES
      (NEW.organization_id, NEW.caregiver_id, NEW.id, 'plan', 'max_tagesarbeitszeit', NEW.datum, v_dauer_minuten, v_grenzwert_tag)
    ON CONFLICT (eintrag_id, verstoss_art) WHERE eintrag_id IS NOT NULL DO UPDATE
      SET gemessener_wert_minuten = EXCLUDED.gemessener_wert_minuten,
          erkannt_am = now(), quittiert = false, quittiert_von = NULL, quittiert_am = NULL;
  ELSE
    DELETE FROM arbeitszeit_verstoesse WHERE eintrag_id = NEW.id AND verstoss_art = 'max_tagesarbeitszeit';
  END IF;

  -- Ruhepausen (§ 4 ArbZG): mehr als 6 h → 30 min, mehr als 9 h → 45 min.
  -- Die Schwellen sind „mehr als", nicht „ab": exakt 6 h ohne Pause ist
  -- zulaessig.
  v_pflichtpause := CASE
    WHEN v_dauer_minuten > 540 THEN 45
    WHEN v_dauer_minuten > 360 THEN 30
    ELSE 0 END;

  IF v_pflichtpause > 0 AND v_pause < v_pflichtpause THEN
    INSERT INTO arbeitszeit_verstoesse
      (organization_id, caregiver_id, eintrag_id, basis, verstoss_art, datum, gemessener_wert_minuten, grenzwert_minuten)
    VALUES
      (NEW.organization_id, NEW.caregiver_id, NEW.id, 'plan', 'pflichtpause', NEW.datum, v_pause, v_pflichtpause)
    ON CONFLICT (eintrag_id, verstoss_art) WHERE eintrag_id IS NOT NULL DO UPDATE
      SET gemessener_wert_minuten = EXCLUDED.gemessener_wert_minuten,
          grenzwert_minuten = EXCLUDED.grenzwert_minuten,
          erkannt_am = now(), quittiert = false, quittiert_von = NULL, quittiert_am = NULL;
  ELSE
    DELETE FROM arbeitszeit_verstoesse WHERE eintrag_id = NEW.id AND verstoss_art = 'pflichtpause';
  END IF;

  -- Mindestruhezeit (§ 5 ArbZG) — Abstand zum vorherigen und naechsten Dienst
  SELECT MAX(CASE WHEN d.end_zeit > d.start_zeit
                  THEN (d.datum + d.end_zeit)::timestamptz
                  ELSE (d.datum + 1 + d.end_zeit)::timestamptz END)
    INTO v_vor_ende
    FROM dienstplan_eintraege d
    WHERE d.id != NEW.id AND d.organization_id = NEW.organization_id AND d.caregiver_id = NEW.caregiver_id
      AND d.status != 'ausgefallen' AND d.typ NOT IN ('bereitschaft','notdienst')
      AND d.datum BETWEEN NEW.datum - 1 AND NEW.datum
      AND (d.datum + d.start_zeit)::timestamptz < v_start;

  SELECT MIN((d.datum + d.start_zeit)::timestamptz)
    INTO v_nach_start
    FROM dienstplan_eintraege d
    WHERE d.id != NEW.id AND d.organization_id = NEW.organization_id AND d.caregiver_id = NEW.caregiver_id
      AND d.status != 'ausgefallen' AND d.typ NOT IN ('bereitschaft','notdienst')
      AND d.datum BETWEEN NEW.datum AND NEW.datum + 1
      AND (d.datum + d.start_zeit)::timestamptz > v_end;

  v_gap_vor  := CASE WHEN v_vor_ende IS NOT NULL THEN EXTRACT(EPOCH FROM (v_start - v_vor_ende))::int / 60 END;
  v_gap_nach := CASE WHEN v_nach_start IS NOT NULL THEN EXTRACT(EPOCH FROM (v_nach_start - v_end))::int / 60 END;

  IF (v_gap_vor IS NOT NULL AND v_gap_vor < v_grenzwert_ruhe)
     OR (v_gap_nach IS NOT NULL AND v_gap_nach < v_grenzwert_ruhe) THEN
    INSERT INTO arbeitszeit_verstoesse
      (organization_id, caregiver_id, eintrag_id, basis, verstoss_art, datum, gemessener_wert_minuten, grenzwert_minuten)
    VALUES
      (NEW.organization_id, NEW.caregiver_id, NEW.id, 'plan', 'mindestruhezeit', NEW.datum,
       LEAST(COALESCE(v_gap_vor, v_grenzwert_ruhe), COALESCE(v_gap_nach, v_grenzwert_ruhe)), v_grenzwert_ruhe)
    ON CONFLICT (eintrag_id, verstoss_art) WHERE eintrag_id IS NOT NULL DO UPDATE
      SET gemessener_wert_minuten = EXCLUDED.gemessener_wert_minuten,
          erkannt_am = now(), quittiert = false, quittiert_von = NULL, quittiert_am = NULL;
  ELSE
    DELETE FROM arbeitszeit_verstoesse WHERE eintrag_id = NEW.id AND verstoss_art = 'mindestruhezeit';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_arbzg_pruefung ON public.dienstplan_eintraege;
CREATE TRIGGER trg_arbzg_pruefung
  AFTER INSERT OR UPDATE ON public.dienstplan_eintraege
  FOR EACH ROW EXECUTE FUNCTION public.arbzg_pruefung();

-- ── 3. Die ERFASSTE Arbeitszeit pruefen ────────────────────────────────────
--
-- `ist_minuten` ist die Netto-Arbeitszeit (Ende − Beginn − Pause) und damit
-- genau die Groesse, an die § 3 und § 4 ArbZG binden. Sie wird hier NICHT
-- neu gerechnet, sondern genommen: die Anwendung leitet sie serverseitig her
-- (`assertIstMinutenStimmig` in lib/personal/arbeitszeiten.ts) und weist einen
-- abweichenden Wert ab. Wuerde der Trigger stattdessen selbst rechnen, gaebe
-- es zwei Wahrheiten fuer dieselbe Zahl.
--
-- FALLBACK: traegt eine Altzeile ein `ist_minuten`, das nicht zu ihren
-- eigenen Zeiten passt, wird der GROESSERE der beiden Werte gemessen. Eine
-- ArbZG-Pruefung, die im Zweifel den kleineren Wert nimmt, meldet den
-- Verstoss nicht — und das ist die einzige Richtung, in die diese Pruefung
-- nicht irren darf.

CREATE OR REPLACE FUNCTION public.arbzg_pruefung_ist()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_start timestamptz;
  v_end   timestamptz;
  v_aus_zeiten int;
  v_dauer_minuten int;
  v_pause int;
  v_pflichtpause int;
  v_grenzwert_tag  CONSTANT int := 600;  -- 10h, § 3 ArbZG
  v_grenzwert_ruhe CONSTANT int := 660;  -- 11h, § 5 ArbZG
  v_vor_ende   timestamptz;
  v_nach_start timestamptz;
  v_gap_vor  int;
  v_gap_nach int;
BEGIN
  IF NEW.caregiver_id IS NULL OR NEW.start_zeit IS NULL OR NEW.end_zeit IS NULL THEN
    DELETE FROM arbeitszeit_verstoesse WHERE arbeitszeit_id = NEW.id;
    RETURN NEW;
  END IF;

  v_pause := GREATEST(COALESCE(NEW.pause_minuten, 0), 0);
  v_start := (NEW.datum + NEW.start_zeit)::timestamptz;
  v_end   := CASE WHEN NEW.end_zeit > NEW.start_zeit
                  THEN (NEW.datum + NEW.end_zeit)::timestamptz
                  ELSE (NEW.datum + 1 + NEW.end_zeit)::timestamptz END;
  v_aus_zeiten := (EXTRACT(EPOCH FROM (v_end - v_start))::int / 60) - v_pause;
  v_dauer_minuten := GREATEST(COALESCE(NEW.ist_minuten, 0), GREATEST(v_aus_zeiten, 0));

  -- Tageshöchstarbeitszeit (§ 3 ArbZG)
  IF v_dauer_minuten > v_grenzwert_tag THEN
    INSERT INTO arbeitszeit_verstoesse
      (organization_id, caregiver_id, arbeitszeit_id, basis, verstoss_art, datum, gemessener_wert_minuten, grenzwert_minuten)
    VALUES
      (NEW.organization_id, NEW.caregiver_id, NEW.id, 'ist', 'max_tagesarbeitszeit', NEW.datum, v_dauer_minuten, v_grenzwert_tag)
    ON CONFLICT (arbeitszeit_id, verstoss_art) WHERE arbeitszeit_id IS NOT NULL DO UPDATE
      SET gemessener_wert_minuten = EXCLUDED.gemessener_wert_minuten,
          erkannt_am = now(), quittiert = false, quittiert_von = NULL, quittiert_am = NULL;
  ELSE
    DELETE FROM arbeitszeit_verstoesse WHERE arbeitszeit_id = NEW.id AND verstoss_art = 'max_tagesarbeitszeit';
  END IF;

  -- Ruhepausen (§ 4 ArbZG)
  v_pflichtpause := CASE
    WHEN v_dauer_minuten > 540 THEN 45
    WHEN v_dauer_minuten > 360 THEN 30
    ELSE 0 END;

  IF v_pflichtpause > 0 AND v_pause < v_pflichtpause THEN
    INSERT INTO arbeitszeit_verstoesse
      (organization_id, caregiver_id, arbeitszeit_id, basis, verstoss_art, datum, gemessener_wert_minuten, grenzwert_minuten)
    VALUES
      (NEW.organization_id, NEW.caregiver_id, NEW.id, 'ist', 'pflichtpause', NEW.datum, v_pause, v_pflichtpause)
    ON CONFLICT (arbeitszeit_id, verstoss_art) WHERE arbeitszeit_id IS NOT NULL DO UPDATE
      SET gemessener_wert_minuten = EXCLUDED.gemessener_wert_minuten,
          grenzwert_minuten = EXCLUDED.grenzwert_minuten,
          erkannt_am = now(), quittiert = false, quittiert_von = NULL, quittiert_am = NULL;
  ELSE
    DELETE FROM arbeitszeit_verstoesse WHERE arbeitszeit_id = NEW.id AND verstoss_art = 'pflichtpause';
  END IF;

  -- Mindestruhezeit (§ 5 ArbZG) gegen die uebrigen ERFASSTEN Zeiten
  -- desselben Mitarbeiters. Bewusst nicht gegen den Plan: eine geplante
  -- Schicht, die nicht gearbeitet wurde, hat keine Ruhezeit verkuerzt.
  SELECT MAX(CASE WHEN a.end_zeit > a.start_zeit
                  THEN (a.datum + a.end_zeit)::timestamptz
                  ELSE (a.datum + 1 + a.end_zeit)::timestamptz END)
    INTO v_vor_ende
    FROM personal_arbeitszeiten a
    WHERE a.id != NEW.id AND a.organization_id = NEW.organization_id AND a.caregiver_id = NEW.caregiver_id
      AND a.start_zeit IS NOT NULL AND a.end_zeit IS NOT NULL
      AND a.datum BETWEEN NEW.datum - 1 AND NEW.datum
      AND (a.datum + a.start_zeit)::timestamptz < v_start;

  SELECT MIN((a.datum + a.start_zeit)::timestamptz)
    INTO v_nach_start
    FROM personal_arbeitszeiten a
    WHERE a.id != NEW.id AND a.organization_id = NEW.organization_id AND a.caregiver_id = NEW.caregiver_id
      AND a.start_zeit IS NOT NULL AND a.end_zeit IS NOT NULL
      AND a.datum BETWEEN NEW.datum AND NEW.datum + 1
      AND (a.datum + a.start_zeit)::timestamptz > v_end;

  v_gap_vor  := CASE WHEN v_vor_ende IS NOT NULL THEN EXTRACT(EPOCH FROM (v_start - v_vor_ende))::int / 60 END;
  v_gap_nach := CASE WHEN v_nach_start IS NOT NULL THEN EXTRACT(EPOCH FROM (v_nach_start - v_end))::int / 60 END;

  -- Ein NEGATIVER Abstand ist keine kurze Ruhezeit, sondern eine
  -- Ueberschneidung — zwei erfasste Zeiten, die sich ueberlappen. Das ist
  -- ein anderer Sachverhalt, und ihn hier als „0 Minuten Ruhezeit" zu
  -- protokollieren wuerde einen negativen `gemessener_wert_minuten`
  -- schreiben und die Ursache verschleiern. Deshalb faellt er raus.
  IF v_gap_vor  IS NOT NULL AND v_gap_vor  < 0 THEN v_gap_vor  := NULL; END IF;
  IF v_gap_nach IS NOT NULL AND v_gap_nach < 0 THEN v_gap_nach := NULL; END IF;

  IF (v_gap_vor IS NOT NULL AND v_gap_vor < v_grenzwert_ruhe)
     OR (v_gap_nach IS NOT NULL AND v_gap_nach < v_grenzwert_ruhe) THEN
    INSERT INTO arbeitszeit_verstoesse
      (organization_id, caregiver_id, arbeitszeit_id, basis, verstoss_art, datum, gemessener_wert_minuten, grenzwert_minuten)
    VALUES
      (NEW.organization_id, NEW.caregiver_id, NEW.id, 'ist', 'mindestruhezeit', NEW.datum,
       LEAST(COALESCE(v_gap_vor, v_grenzwert_ruhe), COALESCE(v_gap_nach, v_grenzwert_ruhe)), v_grenzwert_ruhe)
    ON CONFLICT (arbeitszeit_id, verstoss_art) WHERE arbeitszeit_id IS NOT NULL DO UPDATE
      SET gemessener_wert_minuten = EXCLUDED.gemessener_wert_minuten,
          erkannt_am = now(), quittiert = false, quittiert_von = NULL, quittiert_am = NULL;
  ELSE
    DELETE FROM arbeitszeit_verstoesse WHERE arbeitszeit_id = NEW.id AND verstoss_art = 'mindestruhezeit';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_arbzg_pruefung_ist ON public.personal_arbeitszeiten;
CREATE TRIGGER trg_arbzg_pruefung_ist
  AFTER INSERT OR UPDATE ON public.personal_arbeitszeiten
  FOR EACH ROW EXECUTE FUNCTION public.arbzg_pruefung_ist();

COMMENT ON FUNCTION public.arbzg_pruefung_ist() IS
  'ArbZG § 3/§ 4/§ 5 auf der ERFASSTEN Arbeitszeit (personal_arbeitszeiten). Protokolliert in arbeitszeit_verstoesse mit basis = ist; blockiert bewusst nicht.';

COMMIT;
