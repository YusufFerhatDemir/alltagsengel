-- ════════════════════════════════════════════════════════════════════════════
-- Migration: Mandantenbezug + Schreibschutz fuer die Analytics-/Tracking-Tabellen
-- Datum:     2026-08-19 (Security-Audit 2026-08-19 — MITTEL-2, NIEDRIG-3)
--
-- BEFUND MITTEL-2 (aktiver Schema-Drift)
--   `npm run check:schema-drift` meldete:
--     app/admin/analytics/actions.ts:61  page_views.organization_id  (.eq)
--     app/admin/analytics/actions.ts:87  visitors.organization_id    (.eq)
--   Beide Spalten existieren live nicht → die Abfragen scheitern mit 42703
--   und das Admin-Analytics ist still kaputt (leere Liste statt Fehler).
--   Zusaetzlich las app/api/ai-chat/route.ts `visitor_locations` komplett
--   ohne Org-Filter und schickte die Aggregation an ein LLM — Besucherdaten
--   aller Mandanten in einer Mandanten-Ansicht.
--
-- BEFUND NIEDRIG-3 (offene Insert-Policies)
--   page_views / visitors / visitor_locations hatten je eine INSERT-Policy
--   `WITH CHECK (true)` fuer `public`. Jeder Unbeteiligte konnte die
--   Tabellen ohne Anmeldung unbegrenzt befuellen (Datenmuell, Speicherkosten).
--   Lesen war bereits auf is_admin() beschraenkt — kein Datenabfluss.
--
-- FIX
--   1. organization_id auf allen Tracking-/Analytics-Tabellen nachziehen,
--      exakt nach dem Muster aus 20260801_phase3_multi_mandant_saas.sql:
--      Spalte → Backfill Stamm-Org → DEFAULT current_org_id() → NOT NULL →
--      Index → RESTRICTIVE org_fence.
--   2. Die drei offenen INSERT-Policies entfernen. Alle Schreibpfade laufen
--      danach ueber Server-Routen mit Service-Role-Key und Rate-Limit:
--        page_views        → POST /api/track/page-view (neu)
--        visitors          → POST /api/track
--        visitor_locations → POST /api/track
--      service_role umgeht RLS, braucht also keine Policy.
--
-- VORAUSSETZUNG: components/PageTracker.tsx darf nicht mehr direkt aus dem
--   Browser in page_views schreiben. Das ist im selben Commit umgestellt.
--
-- ROLLBACK: 20260922010001_rollback_analytics_org_scope.sql
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
DECLARE
  t text;
  analytics_tables text[] := ARRAY[
    'page_views',
    'visitors',
    'visitor_locations',
    'analytics_events',
    'partner_visits',
    'conversions',
    'geo_events'
  ];
BEGIN
  FOREACH t IN ARRAY analytics_tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      RAISE NOTICE 'Tabelle % existiert nicht — uebersprungen', t;
      CONTINUE;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND column_name = 'organization_id'
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD COLUMN organization_id uuid REFERENCES public.organizations(id)', t);
      EXECUTE format(
        'UPDATE public.%I SET organization_id = ''00000000-0000-4000-8000-000460629986'' WHERE organization_id IS NULL', t);
      EXECUTE format(
        'ALTER TABLE public.%I ALTER COLUMN organization_id SET DEFAULT public.current_org_id()', t);
      EXECUTE format(
        'ALTER TABLE public.%I ALTER COLUMN organization_id SET NOT NULL', t);
      RAISE NOTICE 'organization_id ergaenzt: %', t;
    END IF;

    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_%s_org ON public.%I (organization_id)', t, t);

    EXECUTE format('DROP POLICY IF EXISTS "%s_org_fence" ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY "%s_org_fence" ON public.%I AS RESTRICTIVE FOR ALL '
      || 'USING (organization_id = public.current_org_id()) '
      || 'WITH CHECK (organization_id = public.current_org_id())', t, t);
  END LOOP;
END $$;

-- ── NIEDRIG-3: offene INSERT-Policies entfernen ───────────────────────────
-- Diese drei Policies waren `WITH CHECK (true)` fuer die Rolle `public`.
-- Nach dem Drop schreibt nur noch der Service-Role-Key (Server-Routen).
DROP POLICY IF EXISTS "Anyone can insert page_views"        ON public.page_views;
DROP POLICY IF EXISTS "Anyone can insert visitors"          ON public.visitors;
DROP POLICY IF EXISTS "Anyone can insert visitor_locations" ON public.visitor_locations;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- VERIFIKATION (nach Apply):
--   select count(*) from page_views where organization_id is null;   -- 0
--   select count(*) from visitors   where organization_id is null;   -- 0
--   select policyname from pg_policies
--    where tablename in ('page_views','visitors','visitor_locations')
--      and cmd = 'INSERT';                                           -- leer
--   npm run check:schema-drift                                       -- 0 Treffer
-- ════════════════════════════════════════════════════════════════════════════
