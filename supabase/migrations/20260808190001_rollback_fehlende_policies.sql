-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK: Policies für zuvor regellose Tabellen (20260808190000)
--
-- Danach sind die Tabellen wieder fuer alles ausser service_role gesperrt.
-- Sicher, aber Admin-Einstellungen, Push-Registrierung und das
-- Empfehlungsprogramm funktionieren dann nicht mehr ueber den
-- Nutzer-Client.
-- ════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS app_settings_admin_all        ON public.app_settings;
DROP POLICY IF EXISTS datenannahmestellen_admin_all ON public.datenannahmestellen;
DROP POLICY IF EXISTS fcm_tokens_eigene             ON public.fcm_tokens;
DROP POLICY IF EXISTS push_subscriptions_eigene     ON public.push_subscriptions;
DROP POLICY IF EXISTS referrals_beteiligte_lesen    ON public.referrals;
