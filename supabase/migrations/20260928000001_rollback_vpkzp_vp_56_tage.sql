-- Rollback zu 20260928000000_vpkzp_vp_56_tage.sql
--
-- Stellt den Stand aus 20260926000000_vpkzp_zeitraum_budget.sql wieder
-- her: Verhinderungspflege 42 Tage (6 Wochen) in allen Jahren.
-- Achtung: bereits erfasste Buchungen werden dadurch NICHT geprueft.
-- Ein Jahresstand mit mehr als 42 VP-Tagen bleibt bestehen und sperrt nur
-- jede weitere Buchung — das ist gewollt, ein Rollback darf keine Belege
-- stillschweigend verwerfen.

BEGIN;

CREATE OR REPLACE FUNCTION public.vpkzp_max_tage(p_art text, p_jahr integer)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_catalog
AS $fn$
  SELECT CASE
    WHEN p_jahr IS NULL OR p_jahr < 2024 THEN NULL
    -- 6 Wochen a 7 Tage je Kalenderjahr (§ 39 SGB XI)
    WHEN lower(p_art) = 'verhinderungspflege' THEN 42
    -- 8 Wochen a 7 Tage je Kalenderjahr (§ 42 SGB XI)
    WHEN lower(p_art) = 'kurzzeitpflege' THEN 56
    ELSE NULL
  END;
$fn$;

COMMENT ON FUNCTION public.vpkzp_max_tage(text, integer) IS
  'Tageskontingent je Leistungsart und Kalenderjahr. Zwilling zu '
  'VPKZP_ZEIT_VERSIONEN (lib/billing/vpkzp/konstanten.ts). NULL = kein '
  'hinterlegtes Kontingent; der Fortschreibungs-Trigger lehnt dann ab.';

REVOKE ALL ON FUNCTION public.vpkzp_max_tage(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vpkzp_max_tage(text, integer) TO authenticated, service_role;

COMMIT;
