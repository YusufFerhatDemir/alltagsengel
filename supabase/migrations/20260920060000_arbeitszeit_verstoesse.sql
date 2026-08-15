-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Arbeitszeitgesetz-Konformität — arbeitszeit_verstoesse +
--            AFTER-Trigger auf dienstplan_eintraege, der bei jedem
--            INSERT/UPDATE die Tageshöchstarbeitszeit (§3 ArbZG: 10h/Tag)
--            und die Mindestruhezeit (§5 ArbZG: 11h zwischen zwei Diensten)
--            prüft.
--
--            BEWUSST NICHT BLOCKIEREND (kein RAISE EXCEPTION wie bei
--            check_doppelbelegung): ein hartes Verbot würde in Notfällen
--            (z. B. spontaner Ausfallersatz) die Einsatzplanung lahmlegen.
--            Stattdessen wird der Verstoß protokolliert und im
--            Fristen-Dashboard sichtbar gemacht — PDL entscheidet.
--            Bereitschaftsdienst/Notdienst (typ IN bereitschaft, notdienst)
--            unterliegen abweichenden ArbZG-Regeln (§7 ArbZG) und werden
--            hier bewusst nicht pauschal geprüft.
-- Datum:     2026-08-15
-- Projekt:   Alltagsengel UG
-- IDEMPOTENT.
-- Rollback:  20260920060001_rollback_arbeitszeit_verstoesse.sql
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS arbeitszeit_verstoesse (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT current_org_id(),
  caregiver_id    uuid NOT NULL REFERENCES caregivers(id) ON DELETE CASCADE,
  eintrag_id      uuid NOT NULL REFERENCES dienstplan_eintraege(id) ON DELETE CASCADE,

  verstoss_art  text NOT NULL,
  datum         date NOT NULL,
  gemessener_wert_minuten int NOT NULL,
  grenzwert_minuten       int NOT NULL,

  erkannt_am    timestamptz NOT NULL DEFAULT now(),
  quittiert     boolean NOT NULL DEFAULT false,
  quittiert_von uuid,
  quittiert_am  timestamptz,
  bemerkung     text,

  CONSTRAINT azv_verstoss_art_check CHECK (verstoss_art IN ('max_tagesarbeitszeit','mindestruhezeit')),
  CONSTRAINT azv_eintrag_art_unique UNIQUE (eintrag_id, verstoss_art)
);

CREATE INDEX IF NOT EXISTS idx_azv_org         ON arbeitszeit_verstoesse(organization_id);
CREATE INDEX IF NOT EXISTS idx_azv_caregiver    ON arbeitszeit_verstoesse(caregiver_id, datum);
CREATE INDEX IF NOT EXISTS idx_azv_unquittiert  ON arbeitszeit_verstoesse(organization_id, quittiert) WHERE quittiert = false;

ALTER TABLE arbeitszeit_verstoesse ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'arbeitszeit_verstoesse' AND policyname = 'admin_arbeitszeit_verstoesse') THEN
    CREATE POLICY admin_arbeitszeit_verstoesse ON arbeitszeit_verstoesse FOR ALL
      USING (is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'arbeitszeit_verstoesse' AND policyname = 'org_fence_arbeitszeit_verstoesse') THEN
    CREATE POLICY org_fence_arbeitszeit_verstoesse ON arbeitszeit_verstoesse AS RESTRICTIVE FOR ALL
      USING (organization_id = current_org_id());
  END IF;
END $$;


-- ═══════════════════════════════════════════════════════════════════════════
-- Trigger-Funktion: arbzg_pruefung
-- SECURITY DEFINER, damit die Protokollierung unabhängig von den
-- RLS-Rechten des einfügenden Callers auf dienstplan_eintraege funktioniert
-- (analog zu anderen SECDEF-Helfern in diesem Projekt).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.arbzg_pruefung()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_start  timestamptz;
  v_end    timestamptz;
  v_dauer_minuten int;
  v_grenzwert_tag  CONSTANT int := 600;  -- 10h
  v_grenzwert_ruhe CONSTANT int := 660;  -- 11h
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
  v_dauer_minuten := (EXTRACT(EPOCH FROM (v_end - v_start))::int / 60) - COALESCE(NEW.pause_minuten, 0);

  -- Tageshöchstarbeitszeit (§3 ArbZG)
  IF v_dauer_minuten > v_grenzwert_tag THEN
    INSERT INTO arbeitszeit_verstoesse
      (organization_id, caregiver_id, eintrag_id, verstoss_art, datum, gemessener_wert_minuten, grenzwert_minuten)
    VALUES
      (NEW.organization_id, NEW.caregiver_id, NEW.id, 'max_tagesarbeitszeit', NEW.datum, v_dauer_minuten, v_grenzwert_tag)
    ON CONFLICT (eintrag_id, verstoss_art) DO UPDATE
      SET gemessener_wert_minuten = EXCLUDED.gemessener_wert_minuten,
          erkannt_am = now(), quittiert = false, quittiert_von = NULL, quittiert_am = NULL;
  ELSE
    DELETE FROM arbeitszeit_verstoesse WHERE eintrag_id = NEW.id AND verstoss_art = 'max_tagesarbeitszeit';
  END IF;

  -- Mindestruhezeit (§5 ArbZG) — Abstand zum vorherigen und nächsten Dienst desselben Mitarbeiters
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
      (organization_id, caregiver_id, eintrag_id, verstoss_art, datum, gemessener_wert_minuten, grenzwert_minuten)
    VALUES
      (NEW.organization_id, NEW.caregiver_id, NEW.id, 'mindestruhezeit', NEW.datum,
       LEAST(COALESCE(v_gap_vor, v_grenzwert_ruhe), COALESCE(v_gap_nach, v_grenzwert_ruhe)), v_grenzwert_ruhe)
    ON CONFLICT (eintrag_id, verstoss_art) DO UPDATE
      SET gemessener_wert_minuten = EXCLUDED.gemessener_wert_minuten,
          erkannt_am = now(), quittiert = false, quittiert_von = NULL, quittiert_am = NULL;
  ELSE
    DELETE FROM arbeitszeit_verstoesse WHERE eintrag_id = NEW.id AND verstoss_art = 'mindestruhezeit';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_arbzg_pruefung ON dienstplan_eintraege;
CREATE TRIGGER trg_arbzg_pruefung
  AFTER INSERT OR UPDATE ON dienstplan_eintraege
  FOR EACH ROW EXECUTE FUNCTION arbzg_pruefung();
