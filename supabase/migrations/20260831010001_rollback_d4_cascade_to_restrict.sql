-- Rollback: D4 CASCADE → RESTRICT
-- Setzt alle RESTRICT-FKs zurück auf CASCADE (ursprünglicher Zustand).

BEGIN;

CREATE OR REPLACE FUNCTION _tmp_fk_restrict_to_cascade(
  p_table   text,
  p_column  text,
  p_ref     text,
  p_conname text
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_old_con text;
BEGIN
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
    AND c.confdeltype = 'r';  -- 'r' = RESTRICT

  IF v_old_con IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', p_table, v_old_con);
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.%s ON DELETE CASCADE',
      p_table, p_conname, p_column, p_ref
    );
  END IF;
END;
$$;

SELECT _tmp_fk_restrict_to_cascade('pflege_aufnahmen',       'client_id', 'clients(id)', 'pflege_aufnahmen_client_id_fkey');
SELECT _tmp_fk_restrict_to_cascade('pflege_anamnesen',       'client_id', 'clients(id)', 'pflege_anamnesen_client_id_fkey');
SELECT _tmp_fk_restrict_to_cascade('pflege_diagnosen',       'client_id', 'clients(id)', 'pflege_diagnosen_client_id_fkey');
SELECT _tmp_fk_restrict_to_cascade('pflege_risiken',         'client_id', 'clients(id)', 'pflege_risiken_client_id_fkey');
SELECT _tmp_fk_restrict_to_cascade('pflege_massnahmenplaene','client_id', 'clients(id)', 'pflege_massnahmenplaene_client_id_fkey');
SELECT _tmp_fk_restrict_to_cascade('pflege_verlauf',         'client_id', 'clients(id)', 'pflege_verlauf_client_id_fkey');
SELECT _tmp_fk_restrict_to_cascade('pflege_doku_perioden',   'client_id', 'clients(id)', 'pflege_doku_perioden_client_id_fkey');
SELECT _tmp_fk_restrict_to_cascade('sis_assessments',        'client_id', 'clients(id)', 'sis_assessments_client_id_fkey');
SELECT _tmp_fk_restrict_to_cascade('vital_signs',            'client_id', 'clients(id)', 'vital_signs_client_id_fkey');
SELECT _tmp_fk_restrict_to_cascade('vital_sign_thresholds',  'client_id', 'clients(id)', 'vital_sign_thresholds_client_id_fkey');
SELECT _tmp_fk_restrict_to_cascade('wounds',                 'client_id', 'clients(id)', 'wounds_client_id_fkey');
SELECT _tmp_fk_restrict_to_cascade('medikamente',            'client_id', 'clients(id)', 'medikamente_client_id_fkey');
SELECT _tmp_fk_restrict_to_cascade('medikament_eingaben',    'client_id', 'clients(id)', 'medikament_eingaben_client_id_fkey');

DROP FUNCTION IF EXISTS _tmp_fk_restrict_to_cascade(text, text, text, text);

COMMIT;
