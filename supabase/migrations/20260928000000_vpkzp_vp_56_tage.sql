-- VP-Tagekontingent: 42 -> 56 Tage (8 Wochen)
--
-- Quelle: Bundesministerium fuer Gesundheit,
-- bundesgesundheitsministerium.de/verhinderungspflege —
-- "fuer laengstens acht Wochen je Kalenderjahr". Die zeitliche
-- Hoechstdauer der Verhinderungspflege wurde der Hoechstdauer der
-- Kurzzeitpflege angeglichen; wirksam mit dem gemeinsamen Jahresbetrag
-- nach § 42a SGB XI zum 01.07.2025.
--
-- 20260926000000_vpkzp_zeitraum_budget.sql hatte den konservativen Wert
-- 42 Tage (6 Wochen) hinterlegt, weil die Anhebung dort nicht belegt war
-- (OFFENE_FACHFRAGEN.vp_dauer_ab_072025). Der Beleg liegt jetzt vor.
--
-- Warum nach Jahr getrennt und nicht pauschal ueberschrieben: das
-- Kontingent ist kalenderjahresbezogen. Bis einschliesslich 2024 galten
-- 6 Wochen — eine Pruefung fuer ein vergangenes Jahr muss reproduzierbar
-- bleiben, sonst wuerde eine Nacherfassung fuer 2024 stillschweigend
-- 14 Tage zu viel durchlassen. Gleiche Aufteilung wie in
-- VPKZP_ZEIT_VERSIONEN (lib/billing/vpkzp/konstanten.ts) und wie bei den
-- Geldbetraegen in BUDGET_VERSIONEN, die schon zum 01.01.2025 wechseln.
--
-- Der Wechsel wird auf den 01.01.2025 gelegt, obwohl das Gesetz zum
-- 01.07.2025 greift: die Funktion kennt nur Kalenderjahre, und wer die
-- Hoechstdauer im Jahr 2025 ausschoepft, tut das unter dem ab 01.07.2025
-- geltenden Recht.

BEGIN;

CREATE OR REPLACE FUNCTION public.vpkzp_max_tage(p_art text, p_jahr integer)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_catalog
AS $fn$
  SELECT CASE
    WHEN p_jahr IS NULL OR p_jahr < 2024 THEN NULL
    -- Rechtsstand bis einschliesslich 2024
    -- 6 Wochen a 7 Tage je Kalenderjahr (§ 39 SGB XI)
    WHEN p_jahr <= 2024 AND lower(p_art) = 'verhinderungspflege' THEN 42
    -- 8 Wochen a 7 Tage je Kalenderjahr (§ 42 SGB XI)
    WHEN p_jahr <= 2024 AND lower(p_art) = 'kurzzeitpflege' THEN 56
    -- Rechtsstand ab 2025 — beide Kontingente sind gleich gross
    -- 8 Wochen a 7 Tage je Kalenderjahr (§ 39 SGB XI, BMG ab 01.07.2025)
    WHEN lower(p_art) = 'verhinderungspflege' THEN 56
    -- 8 Wochen a 7 Tage je Kalenderjahr (§ 42 SGB XI)
    WHEN lower(p_art) = 'kurzzeitpflege' THEN 56
    ELSE NULL
  END;
$fn$;

COMMENT ON FUNCTION public.vpkzp_max_tage(text, integer) IS
  'Tageskontingent je Leistungsart und Kalenderjahr. Verhinderungspflege '
  '8 Wochen ab 2025 (BMG: acht Wochen ab 01.07.2025, § 39/§ 42a SGB XI), '
  'bis 2024 6 Wochen. Kurzzeitpflege durchgehend 8 Wochen. Zwilling zu '
  'VPKZP_ZEIT_VERSIONEN (lib/billing/vpkzp/konstanten.ts). NULL = kein '
  'hinterlegtes Kontingent; der Fortschreibungs-Trigger lehnt dann ab.';

-- Ausfuehrungsrechte wie in 20260926000000: CREATE OR REPLACE erhaelt sie
-- zwar, aber sie stehen hier ausdruecklich, damit die Migration auch auf
-- einer frisch aufgebauten Datenbank denselben Zustand hinterlaesst.
REVOKE ALL ON FUNCTION public.vpkzp_max_tage(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vpkzp_max_tage(text, integer) TO authenticated, service_role;

COMMIT;
