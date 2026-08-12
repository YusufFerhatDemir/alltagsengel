-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: D4 — ON DELETE CASCADE → RESTRICT auf Pflegedokumentation
-- Datum:     2026-08-12 (Betriebsabnahme-Befund D4)
-- ═══════════════════════════════════════════════════════════════════════════
-- GRUND: Alle Pflege-Dokumentationstabellen hatten ON DELETE CASCADE auf
--        clients(id). Ein DELETE FROM clients hätte die gesamte Pflege-
--        dokumentation unwiderruflich gelöscht — Verstoß gegen die
--        gesetzliche Aufbewahrungspflicht (10 Jahre, § 630f Abs. 3 BGB
--        i.V.m. § 11 Abs. 1 HeimG, §§ 75 Abs. 2, 113 SGB XI).
--
-- LÖSUNG: Alle client_id → clients(id) FKs auf ON DELETE RESTRICT ändern.
--         Interne Parent-Child-Beziehungen (z.B. wound_assessments → wounds)
--         behalten CASCADE, da der Parent selbst durch RESTRICT geschützt
--         ist und ein Löschen einzelner Dokumentationen (z.B. einer Wunde)
--         fachlich legitim sein kann.
--
-- IDEMPOTENT: Constraint-Drop ist IF EXISTS, Re-Create prüft Tabellen-Existenz.
-- ROLLBACK:   20260831010001_rollback_d4_cascade_to_restrict.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── Hilfsfunktion: FK droppen und mit RESTRICT neu anlegen ────────────
-- Kapselt das Pattern für alle betroffenen Tabellen.
CREATE OR REPLACE FUNCTION _tmp_fk_cascade_to_restrict(
  p_table   text,
  p_column  text,
  p_ref     text,    -- z.B. 'clients(id)'
  p_conname text     -- gewünschter Constraint-Name
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_old_con text;
BEGIN
  -- Bestehenden CASCADE-FK finden (egal welcher Name)
  SELECT c.conname INTO v_old_con
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public'
    AND t.relname = p_table
    AND c.contype = 'f'
    AND EXISTS (
      SELECT 1 FROM pg_attribute a
      WHERE a.attrelid = t.oid
        AND a.attnum = ANY(c.conkey)
        AND a.attname = p_column
    )
    AND c.confdeltype = 'c';  -- 'c' = CASCADE

  IF v_old_con IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', p_table, v_old_con);
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.%s ON DELETE RESTRICT',
      p_table, p_conname, p_column, p_ref
    );
    RAISE NOTICE 'D4: %.% CASCADE → RESTRICT (alt: %)', p_table, p_column, v_old_con;
  ELSE
    RAISE NOTICE 'D4: %.% — kein CASCADE-FK gefunden, übersprungen', p_table, p_column;
  END IF;
END;
$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- Pflegedokumentation (20260810010000)
-- ═══════════════════════════════════════════════════════════════════════════

SELECT _tmp_fk_cascade_to_restrict(
  'pflege_aufnahmen', 'client_id', 'clients(id)',
  'pflege_aufnahmen_client_id_restrict_fkey'
);

SELECT _tmp_fk_cascade_to_restrict(
  'pflege_anamnesen', 'client_id', 'clients(id)',
  'pflege_anamnesen_client_id_restrict_fkey'
);

SELECT _tmp_fk_cascade_to_restrict(
  'pflege_diagnosen', 'client_id', 'clients(id)',
  'pflege_diagnosen_client_id_restrict_fkey'
);

SELECT _tmp_fk_cascade_to_restrict(
  'pflege_risiken', 'client_id', 'clients(id)',
  'pflege_risiken_client_id_restrict_fkey'
);

SELECT _tmp_fk_cascade_to_restrict(
  'pflege_massnahmenplaene', 'client_id', 'clients(id)',
  'pflege_massnahmenplaene_client_id_restrict_fkey'
);

SELECT _tmp_fk_cascade_to_restrict(
  'pflege_verlauf', 'client_id', 'clients(id)',
  'pflege_verlauf_client_id_restrict_fkey'
);

SELECT _tmp_fk_cascade_to_restrict(
  'pflege_doku_perioden', 'client_id', 'clients(id)',
  'pflege_doku_perioden_client_id_restrict_fkey'
);


-- ═══════════════════════════════════════════════════════════════════════════
-- SIS (20260818010000)
-- ═══════════════════════════════════════════════════════════════════════════

SELECT _tmp_fk_cascade_to_restrict(
  'sis_assessments', 'client_id', 'clients(id)',
  'sis_assessments_client_id_restrict_fkey'
);


-- ═══════════════════════════════════════════════════════════════════════════
-- Vitalwerte (20260818010000)
-- ═══════════════════════════════════════════════════════════════════════════

SELECT _tmp_fk_cascade_to_restrict(
  'vital_signs', 'client_id', 'clients(id)',
  'vital_signs_client_id_restrict_fkey'
);

SELECT _tmp_fk_cascade_to_restrict(
  'vital_sign_thresholds', 'client_id', 'clients(id)',
  'vital_sign_thresholds_client_id_restrict_fkey'
);


-- ═══════════════════════════════════════════════════════════════════════════
-- Wunddokumentation (20260818030000)
-- ═══════════════════════════════════════════════════════════════════════════

SELECT _tmp_fk_cascade_to_restrict(
  'wounds', 'client_id', 'clients(id)',
  'wounds_client_id_restrict_fkey'
);


-- ═══════════════════════════════════════════════════════════════════════════
-- Medikamentenmanagement (20260820010000)
-- ═══════════════════════════════════════════════════════════════════════════

SELECT _tmp_fk_cascade_to_restrict(
  'medikamente', 'client_id', 'clients(id)',
  'medikamente_client_id_restrict_fkey'
);

SELECT _tmp_fk_cascade_to_restrict(
  'medikament_eingaben', 'client_id', 'clients(id)',
  'medikament_eingaben_client_id_restrict_fkey'
);


-- ═══════════════════════════════════════════════════════════════════════════
-- Hilfsfunktion aufräumen
-- ═══════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS _tmp_fk_cascade_to_restrict(text, text, text, text);

COMMIT;
