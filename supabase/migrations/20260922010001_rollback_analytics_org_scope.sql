-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK zu 20260922010000_analytics_org_scope.sql
--
-- Entfernt den Mandanten-Fence und die organization_id-Spalte wieder und
-- stellt die offenen INSERT-Policies her.
--
-- ACHTUNG: Danach ist das Admin-Analytics wieder mandantenblind und die drei
-- Tracking-Tabellen sind wieder von aussen unbegrenzt beschreibbar
-- (Security-Audit 2026-08-19, MITTEL-2 / NIEDRIG-3). Nur ausfuehren, wenn ein
-- Schreibpfad nachweislich haengt.
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
      CONTINUE;
    END IF;

    EXECUTE format('DROP POLICY IF EXISTS "%s_org_fence" ON public.%I', t, t);
    EXECUTE format('DROP INDEX IF EXISTS public.idx_%s_org', t);
    EXECUTE format('ALTER TABLE public.%I DROP COLUMN IF EXISTS organization_id', t);
  END LOOP;
END $$;

CREATE POLICY "Anyone can insert page_views"
  ON public.page_views FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Anyone can insert visitors"
  ON public.visitors FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Anyone can insert visitor_locations"
  ON public.visitor_locations FOR INSERT TO public WITH CHECK (true);

COMMIT;
