-- ═══════════════════════════════════════════════════════════════════════
-- Vitalwerte — Plausibilitätsbereiche als DB-CHECK (zweite Verteidigungslinie)
-- ═══════════════════════════════════════════════════════════════════════
--
-- Sicherheitsdurchsicht Vitalwerte-Modul (analog Medikamente/Akten). Zwei
-- Lücken, beide an derselben Stelle: der bisherige CHECK auf vital_signs
-- prüfte nur value >= 0 — ein Puls von 5000 bpm oder eine Sauerstoff-
-- sättigung von 300 % wären in der Datenbank durchgekommen, sobald ein
-- Schreibpfad an der API-seitigen Prüfung (lib/vitals/vitals.ts,
-- validierePlausibilitaet) vorbeikommt — etwa ein künftiger Batch-Import,
-- ein Backfill-Skript mit service_role, oder ein Bug in einem neuen
-- Aufrufer. Die App-Validierung ist die erste Linie; ohne einen
-- gleichwertigen DB-Constraint ist sie die EINZIGE Linie.
--
-- ── BEFUND (mittel): Grenzwerte konnten sich selbst wirkungslos machen ──
-- vital_sign_thresholds prüfte bislang nur die INNERE Konsistenz eines
-- Grenzwert-Satzes (min < max, kritisch außerhalb warn), nicht aber, ob
-- die Werte überhaupt im messbaren Bereich liegen. validierePlausibilitaet()
-- kappt jede Messung auf [plausibelMin, plausibelMax] je Typ (z. B. Puls
-- 20–250). Ein max_critical von 1000 für Puls ist intern konsistent
-- (1000 > jeder plausible min_warn), aber NIE erreichbar — der kritische
-- Alarm für diese Richtung wäre dauerhaft und unbemerkt abgeschaltet
-- (fail-open durch Fehlkonfiguration). lib/vitals/vitals.ts prüft das seit
-- dieser Migration ebenfalls (validiereGrenzwerte); dieser CHECK ist die
-- zweite Linie für Schreibpfade außerhalb der API.
--
-- Die Bereichsgrenzen je Typ sind in vitals_plausibel_min()/_max() als
-- SQL-Funktionen hinterlegt — sie spiegeln VITAL_TYPEN.plausibelMin/Max aus
-- lib/vitals/types.ts (Stand: Blutdruck diastolisch 20–200, Blutzucker bis
-- 600 — siehe VITAL_TYPEN.plausibelMinSekundaer/plausibelMaxSekundaer für
-- den Blutdruck-Sonderfall). Bei einer Änderung dort MUSS diese Migration
-- (per Folge-Migration) nachgezogen werden, sonst laufen App und DB
-- auseinander.
--
-- NOT VALID + VALIDATE: die CHECKs greifen sofort für neue/geänderte
-- Zeilen; ein Bestandsverstoß bricht die Migration nicht ab, sondern
-- meldet sich als WARNING (kein stiller Durchlauf).
--
-- Voraussetzung: 20260818010100_vitalwerte.sql
-- Rollback: 20261008000001_rollback_vitalwerte_plausibilitaet_db_check.sql
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'vital_signs'
  ) THEN
    RAISE EXCEPTION 'VITALWERTE_BASIS_FEHLT: 20260818010100_vitalwerte.sql muss zuerst laufen.';
  END IF;
END $$;

-- ── 1) Bereichsgrenzen je Typ (Spiegel von VITAL_TYPEN, s. o.) ─────────
-- Zwei Funktionspaare: der Primärwert (value / min_*, max_*) und der
-- Sekundärwert (value_secondary / *_secondary — nur beim Blutdruck belegt,
-- dort diastolisch mit eigenen, engeren Grenzen). Für alle anderen Typen
-- liefern die Sekundär-Funktionen dieselben Grenzen wie die Primär-
-- Funktionen (value_secondary ist dort ohnehin per Constraint NULL).
CREATE OR REPLACE FUNCTION public.vitals_plausibel_min(p_type text)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_type
    WHEN 'blutdruck'     THEN 40
    WHEN 'puls'          THEN 20
    WHEN 'temperatur'    THEN 30
    WHEN 'blutzucker'    THEN 20
    WHEN 'spo2'          THEN 50
    WHEN 'gewicht'       THEN 20
    WHEN 'atemfrequenz'  THEN 4
    WHEN 'schmerz'       THEN 0
    WHEN 'trinkmenge'    THEN 0
    WHEN 'ausscheidung'  THEN 0
  END
$$;

CREATE OR REPLACE FUNCTION public.vitals_plausibel_max(p_type text)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_type
    WHEN 'blutdruck'     THEN 300
    WHEN 'puls'          THEN 250
    WHEN 'temperatur'    THEN 45
    WHEN 'blutzucker'    THEN 600
    WHEN 'spo2'          THEN 100
    WHEN 'gewicht'       THEN 350
    WHEN 'atemfrequenz'  THEN 80
    WHEN 'schmerz'       THEN 10
    WHEN 'trinkmenge'    THEN 10000
    WHEN 'ausscheidung'  THEN 10000
  END
$$;

-- Nur Blutdruck (diastolisch) weicht ab; alle anderen Typen fallen auf
-- vitals_plausibel_min/_max zurück (Blutdruck-Sonderfall aus
-- VITAL_TYPEN.blutdruck.plausibelMinSekundaer/-MaxSekundaer).
CREATE OR REPLACE FUNCTION public.vitals_plausibel_min_sekundaer(p_type text)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_type
    WHEN 'blutdruck' THEN 20
    ELSE public.vitals_plausibel_min(p_type)
  END
$$;

CREATE OR REPLACE FUNCTION public.vitals_plausibel_max_sekundaer(p_type text)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_type
    WHEN 'blutdruck' THEN 200
    ELSE public.vitals_plausibel_max(p_type)
  END
$$;

COMMENT ON FUNCTION public.vitals_plausibel_min(text) IS
  'Spiegelt VITAL_TYPEN[typ].plausibelMin aus lib/vitals/types.ts. Bei Änderung dort nachziehen.';
COMMENT ON FUNCTION public.vitals_plausibel_max(text) IS
  'Spiegelt VITAL_TYPEN[typ].plausibelMax aus lib/vitals/types.ts. Bei Änderung dort nachziehen.';
COMMENT ON FUNCTION public.vitals_plausibel_min_sekundaer(text) IS
  'Spiegelt VITAL_TYPEN[typ].plausibelMinSekundaer (Fallback: plausibelMin) aus lib/vitals/types.ts.';
COMMENT ON FUNCTION public.vitals_plausibel_max_sekundaer(text) IS
  'Spiegelt VITAL_TYPEN[typ].plausibelMaxSekundaer (Fallback: plausibelMax) aus lib/vitals/types.ts.';

-- ── 2) vital_signs: Messwert je Typ im plausiblen Bereich ──────────────
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('vital_signs_wert_plausibel_check',
        'value >= public.vitals_plausibel_min(type) AND value <= public.vitals_plausibel_max(type)'),
      ('vital_signs_sekundaer_plausibel_check',
        'value_secondary IS NULL OR (value_secondary >= public.vitals_plausibel_min_sekundaer(type) AND value_secondary <= public.vitals_plausibel_max_sekundaer(type))'),
      -- Diastolisch < systolisch — Spiegel der API-Prüfung in validierePlausibilitaet().
      ('vital_signs_sekundaer_kleiner_check',
        'value_secondary IS NULL OR value_secondary < value')
    ) AS v(name, ausdruck)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = r.name) THEN
      EXECUTE format('ALTER TABLE public.vital_signs ADD CONSTRAINT %I CHECK (%s) NOT VALID', r.name, r.ausdruck);
      BEGIN
        EXECUTE format('ALTER TABLE public.vital_signs VALIDATE CONSTRAINT %I', r.name);
      EXCEPTION WHEN check_violation THEN
        RAISE WARNING
          'VITALWERTE_BESTAND_UNPLAUSIBEL: % konnte nicht validiert werden — es gibt Messungen, die % verletzen. Der CHECK greift für neue/geänderte Zeilen; der Bestand muss von Hand geprüft werden.',
          r.name, r.ausdruck;
      END;
    END IF;
  END LOOP;
END;
$$;

-- ── 3) vital_sign_thresholds: Grenzwerte je Typ im plausiblen Bereich ──
-- Verhindert die fail-open-Fehlkonfiguration aus dem Befund oben: ein
-- Grenzwert außerhalb [plausibelMin, plausibelMax] kann nie ausgelöst
-- werden, weil keine gültige Messung ihn je erreicht.
DO $$
DECLARE
  r record;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'vital_sign_thresholds'
  ) THEN
    RAISE EXCEPTION 'VITALWERTE_BASIS_FEHLT: 20260818010100_vitalwerte.sql muss zuerst laufen.';
  END IF;

  FOR r IN
    SELECT * FROM (VALUES
      ('vital_sign_thresholds_plausibel_check',
        '(min_warn IS NULL OR (min_warn BETWEEN public.vitals_plausibel_min(type) AND public.vitals_plausibel_max(type)))' ||
        ' AND (max_warn IS NULL OR (max_warn BETWEEN public.vitals_plausibel_min(type) AND public.vitals_plausibel_max(type)))' ||
        ' AND (min_critical IS NULL OR (min_critical BETWEEN public.vitals_plausibel_min(type) AND public.vitals_plausibel_max(type)))' ||
        ' AND (max_critical IS NULL OR (max_critical BETWEEN public.vitals_plausibel_min(type) AND public.vitals_plausibel_max(type)))'),
      ('vital_sign_thresholds_sekundaer_plausibel_check',
        '(min_warn_secondary IS NULL OR (min_warn_secondary BETWEEN public.vitals_plausibel_min_sekundaer(type) AND public.vitals_plausibel_max_sekundaer(type)))' ||
        ' AND (max_warn_secondary IS NULL OR (max_warn_secondary BETWEEN public.vitals_plausibel_min_sekundaer(type) AND public.vitals_plausibel_max_sekundaer(type)))' ||
        ' AND (min_critical_secondary IS NULL OR (min_critical_secondary BETWEEN public.vitals_plausibel_min_sekundaer(type) AND public.vitals_plausibel_max_sekundaer(type)))' ||
        ' AND (max_critical_secondary IS NULL OR (max_critical_secondary BETWEEN public.vitals_plausibel_min_sekundaer(type) AND public.vitals_plausibel_max_sekundaer(type)))')
    ) AS v(name, ausdruck)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = r.name) THEN
      EXECUTE format('ALTER TABLE public.vital_sign_thresholds ADD CONSTRAINT %I CHECK (%s) NOT VALID', r.name, r.ausdruck);
      BEGIN
        EXECUTE format('ALTER TABLE public.vital_sign_thresholds VALIDATE CONSTRAINT %I', r.name);
      EXCEPTION WHEN check_violation THEN
        RAISE WARNING
          'VITALWERTE_GRENZWERT_UNPLAUSIBEL: % konnte nicht validiert werden — es gibt Grenzwert-Sätze, die % verletzen. Der CHECK greift für neue/geänderte Zeilen; der Bestand muss von Hand geprüft werden (fail-open-Risiko: Alarm löst evtl. nie aus).',
          r.name, r.ausdruck;
      END;
    END IF;
  END LOOP;
END;
$$;

COMMIT;
