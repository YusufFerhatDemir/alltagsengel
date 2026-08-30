-- ════════════════════════════════════════════════════════════════════
-- ROLLBACK zu 20261018000000_rollenmatrix_sicherheit_lesen.sql
-- ════════════════════════════════════════════════════════════════════
--
-- Setzt public.rollen_matrix OHNE 'sicherheit.lesen', aber MIT
-- 'marketing.verwalten' (Block 20). Ein Rollback dieser Migration darf
-- dem Marketing-Modul nicht seine Berechtigung nehmen — die Funktion ist
-- geteilt, die zuletzt angewendete Fassung gewinnt.
--
-- ACHTUNG: danach ist public.darf('sicherheit.lesen') fuer alle false.
-- Die RLS-Policies der Sicherheitsspur haengen deshalb nicht allein
-- daran, sondern an public.ist_sicherheitsadmin(), das zusaetzlich
-- is_admin() befragt. Die Aufsicht bleibt also lesbar.
-- ════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION public.rollen_matrix(p_rolle text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT CASE p_rolle
    WHEN 'superadmin' THEN ARRAY[
      'stammdaten.lesen','stammdaten.schreiben',
      'personal.lesen','personal.schreiben',
      'einsatz.lesen','einsatz.schreiben',
      'pflege.lesen','pflege.schreiben',
      'qm.lesen','qm.schreiben',
      'abrechnung.lesen','abrechnung.schreiben',
      'bankdaten.lesen','bankdaten.schreiben',
      'tarife.lesen','tarife.schreiben',
      'audit.lesen','benutzer.verwalten','system.verwalten','berichte.lesen',
      'bonus.verwalten','marketing.verwalten'
    ]
    WHEN 'admin' THEN ARRAY[
      'stammdaten.lesen','stammdaten.schreiben',
      'personal.lesen','personal.schreiben',
      'einsatz.lesen','einsatz.schreiben',
      'pflege.lesen','pflege.schreiben',
      'qm.lesen','qm.schreiben',
      'abrechnung.lesen','abrechnung.schreiben',
      'bankdaten.lesen','bankdaten.schreiben',
      'tarife.lesen','tarife.schreiben',
      'audit.lesen','benutzer.verwalten','system.verwalten','berichte.lesen',
      'bonus.verwalten','marketing.verwalten'
    ]
    WHEN 'pdl' THEN ARRAY[
      'stammdaten.lesen','stammdaten.schreiben',
      'personal.lesen','personal.schreiben',
      'einsatz.lesen','einsatz.schreiben',
      'pflege.lesen','pflege.schreiben',
      'qm.lesen','qm.schreiben',
      'abrechnung.lesen',
      'tarife.lesen',
      'audit.lesen','berichte.lesen'
    ]
    WHEN 'qm' THEN ARRAY[
      'stammdaten.lesen',
      'personal.lesen',
      'einsatz.lesen',
      'pflege.lesen',
      'qm.lesen','qm.schreiben',
      'audit.lesen','berichte.lesen'
    ]
    WHEN 'buchhaltung' THEN ARRAY[
      'stammdaten.lesen',
      'einsatz.lesen',
      'abrechnung.lesen','abrechnung.schreiben',
      'bankdaten.lesen','bankdaten.schreiben',
      'tarife.lesen',
      'audit.lesen','berichte.lesen'
    ]
    ELSE ARRAY[]::text[]
  END;
$$;

COMMIT;
