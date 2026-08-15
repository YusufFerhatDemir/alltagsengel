-- ════════════════════════════════════════════════════════════════════
-- ROLLBACK zu 20260919030000_fix_ops_posteingang_organization_id.sql
-- ════════════════════════════════════════════════════════════════════
-- ACHTUNG: Stellt die urspruengliche View ohne organization_id wieder her —
-- lib/ops/nachrichten.ts::listPosteingang() bricht danach wieder mit
-- "column ops_posteingang.organization_id does not exist".
-- Nur ausfuehren, wenn die View selbst (nicht die Spalte) Probleme macht.
-- ════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE VIEW public.ops_posteingang AS
SELECT
  n.id as nachricht_id,
  n.betreff,
  n.inhalt,
  n.absender_id,
  COALESCE(pa.first_name || ' ' || pa.last_name, '') as absender_name,
  n.prioritaet,
  n.kategorie,
  n.bezug_typ,
  n.bezug_id,
  n.eltern_id,
  n.created_at,
  e.empfaenger_id,
  e.gelesen,
  e.gelesen_am,
  (SELECT count(*) FROM public.ops_nachrichten r WHERE r.eltern_id = n.id) as antworten_anzahl
FROM public.ops_nachrichten n
JOIN public.ops_nachrichten_empfaenger e ON e.nachricht_id = n.id
JOIN public.profiles pa ON pa.id = n.absender_id;

COMMIT;
