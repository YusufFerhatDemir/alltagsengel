-- Constraint anpassen damit reale source-Werte aus app/api/track/route.ts akzeptiert werden.
-- Vorher: nur ('gps','ip','fallback'); Code schreibt aber 'ip-api' und 'vercel' -> permanente Insert-Fehler
-- (>8 Errors in den letzten 24h gesehen).
ALTER TABLE public.visitor_locations DROP CONSTRAINT IF EXISTS visitor_locations_source_check;
ALTER TABLE public.visitor_locations ADD CONSTRAINT visitor_locations_source_check
  CHECK (source = ANY (ARRAY['gps','ip','fallback','ip-api','vercel']));
