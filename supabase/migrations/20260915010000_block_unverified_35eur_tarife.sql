-- M-3: 4 Tarife mit preis_cent=3500 von 'unverified' auf 'blocked' setzen
-- 35€/h-Tarife bleiben BLOCKED — Preise NICHT automatisch ändern
-- Betrifft: alltagsbegleitung, betreuung_45a, demenzbetreuung, hauswirtschaft (je §39 Stamm-Org)
-- Applied to Production 14.08.2026 via Supabase MCP execute_sql

UPDATE public.billing_tariffs
SET tarif_status = 'blocked',
    updated_at = now()
WHERE preis_cent = 3500
  AND tarif_status = 'unverified';
