-- ════════════════════════════════════════════════════════════════════════════
-- Migration: pflege_uebersicht liefert care_level zusaetzlich zu pflegegrad
-- Datum:     2026-08-15 (Audit Module 6-10, Befund Pflegedokumentation)
-- ════════════════════════════════════════════════════════════════════════════
-- BEFUND:
--   clients fuehrt den Pflegegrad in zwei Spalten (care_level fuehrend,
--   pflegegrad nachgeordnet, s. lib/clients/pflegegrad.ts). Seit
--   20260910020000 haelt ein Trigger beide Spalten synchron, und
--   20260907000000 hat den Bestand einmalig geheilt — SOLANGE beide
--   Migrationen live angewendet sind.
--
--   Die View public.pflege_uebersicht (20260810010000) liest bislang NUR
--   c.pflegegrad. app/admin/pflegedoku/page.tsx und
--   app/admin/pflegedoku/berichteblatt/[clientId]/page.tsx lesen dieses Feld
--   direkt (z.pflegegrad / kunde.pflegegrad), OHNE die projektweite Regel
--   "immer pflegegradVon() nutzen, nie pflegegrad direkt lesen" einzuhalten.
--   Auf einer Umgebung, auf der der Sync-Trigger (20260910020000) NICHT
--   live ist, zeigt die Pflegedoku-Uebersicht dann weiterhin "-" fuer
--   Bestandskunden, obwohl care_level gesetzt ist.
--
-- FIX (reine View-Aenderung, kein neues Feld auf clients, kein Trigger):
--   View liefert zusaetzlich care_level. Die Anwendungsseite (Fix im selben
--   Commit) liest ab jetzt ueber pflegegradVon({care_level, pflegegrad}),
--   nicht mehr direkt ueber pflegegrad. Das macht die UI unabhaengig davon,
--   ob der Sync-Trigger auf der jeweiligen Umgebung bereits live ist.
--
-- STATUS: NICHT ANGEWENDET — wartet auf Live-Apply (kein DB-Zugriff in
--   dieser Session). Bis zum Apply liest die UI weiterhin nur pflegegrad
--   (Fallback in lib/pflege/types.ts macht care_level optional).
--
-- Rollback: 20260921020001_rollback_pflege_uebersicht_care_level.sql
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE VIEW public.pflege_uebersicht
WITH (security_invoker = true) AS
SELECT
  c.id AS client_id,
  c.organization_id,
  c.first_name,
  c.last_name,
  c.care_level,
  c.pflegegrad,
  c.aufnahmestatus,
  c.aufnahmedatum,
  (SELECT count(*) FROM pflege_aufnahmen pa WHERE pa.client_id = c.id) AS aufnahmen_count,
  (SELECT count(*) FROM pflege_anamnesen pan WHERE pan.client_id = c.id) AS anamnesen_count,
  (SELECT max(pan.anamnese_datum) FROM pflege_anamnesen pan WHERE pan.client_id = c.id) AS letzte_anamnese,
  (SELECT count(*) FROM pflege_diagnosen pd WHERE pd.client_id = c.id AND pd.aktiv = true) AS aktive_diagnosen,
  (SELECT count(*) FROM pflege_risiken pr WHERE pr.client_id = c.id AND pr.aktiv = true) AS aktive_risiken,
  (SELECT count(*) FROM pflege_massnahmenplaene pm WHERE pm.client_id = c.id AND pm.status = 'aktiv') AS aktive_plaene,
  (SELECT count(*) FROM pflege_verlauf pv WHERE pv.client_id = c.id) AS verlauf_count,
  (SELECT max(pv.eintrag_datum) FROM pflege_verlauf pv WHERE pv.client_id = c.id) AS letzter_verlauf
FROM clients c;

COMMENT ON VIEW public.pflege_uebersicht IS
  'Pflegedoku-Uebersicht je Klient. security_invoker = true. Liefert care_level '
  'UND pflegegrad -- Anwendungscode muss pflegegradVon() nutzen, nie pflegegrad '
  'direkt lesen (lib/clients/pflegegrad.ts).';

COMMIT;
