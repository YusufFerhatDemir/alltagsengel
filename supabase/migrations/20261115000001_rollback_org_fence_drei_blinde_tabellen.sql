-- Rücknahme zu 20261115000000. Stellt den Zustand vom 14.09.2026 wieder her:
-- die drei Tabellen ohne mandantenbezogene Policy.
--
-- Nur benutzen, wenn der Zaun einen Betriebsweg blockiert — dann aber
-- MIT Befund, warum der Weg ohne Mandantenbezug arbeitet.
DROP POLICY IF EXISTS email_entwuerfe_org_fence ON public.email_entwuerfe;
DROP POLICY IF EXISTS marketing_content_status_org_fence ON public.marketing_content_status;
DROP POLICY IF EXISTS security_watchlist_org_fence ON public.security_watchlist;
