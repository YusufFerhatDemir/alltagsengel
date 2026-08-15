-- ════════════════════════════════════════════════════════════════════════════
-- Migration: ops_posteingang — fehlende organization_id-Spalte nachtragen
-- Datum:     2026-08-15  (Audit Modul 23 Kommunikation intern)
--
-- BEFUND: public.ops_posteingang (20260812010000_aufgaben_kommunikation.sql,
--   TEIL "Nachrichten-Posteingang") exponiert keine organization_id-Spalte.
--   lib/ops/nachrichten.ts::listPosteingang() filtert aber genau danach:
--
--     supabase.from('ops_posteingang').select('*')
--       .eq('empfaenger_id', filter.empfaengerId)
--       .eq('organization_id', filter.organizationId)
--
--   PostgREST/Postgres wirft dafuer "column ops_posteingang.organization_id
--   does not exist" — GET /api/ops/nachrichten (Posteingang fuer Admin/Engel-
--   Kommunikation, app/admin/nachrichten, app/engel/nachrichten) schlaegt bei
--   jedem Aufruf fehl, sobald die View live ist.
--
-- FIX: n.organization_id in den SELECT der View aufnehmen. CREATE OR REPLACE
--   VIEW ist idempotent und aendert an bestehenden Grants/RLS nichts (Views
--   erben die RLS der Basistabellen ueber security_invoker; ops_posteingang
--   wird ausschliesslich per Admin-Client mit Server-seitigem organization_id-
--   Filter gelesen).
--
-- KEINE Datenaenderung. Rollback: 20260919030001_rollback_fix_ops_posteingang_organization_id.sql
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE VIEW public.ops_posteingang AS
SELECT
  n.id as nachricht_id,
  n.organization_id,
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
