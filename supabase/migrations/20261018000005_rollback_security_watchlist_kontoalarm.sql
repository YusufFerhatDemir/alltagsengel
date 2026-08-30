-- ════════════════════════════════════════════════════════════════════
-- ROLLBACK zu 20261018000004_security_watchlist_kontoalarm.sql
-- ════════════════════════════════════════════════════════════════════
--
-- Nimmt die drei Spalten zurueck. Die EINTRAEGE bleiben stehen —
-- security_watchlist selbst wird von 20261018000003 entfernt, nicht
-- hier. Nach diesem Rollback melden ueberwachte Konten wieder nur die
-- im Katalog als meldepflichtig gefuehrten Ereignisse, weil
-- lib/security/benachrichtigung.ts die fehlenden Spalten als
-- „Standardverhalten" liest (fail-soft, kein Absturz).
-- ════════════════════════════════════════════════════════════════════

BEGIN;

DROP TRIGGER IF EXISTS trg_security_audit_profil_aenderung ON public.profiles;
DROP FUNCTION IF EXISTS public.security_audit_profil_aenderung();

DROP INDEX IF EXISTS public.idx_security_watchlist_aktiv;

ALTER TABLE public.security_watchlist
  DROP COLUMN IF EXISTS alle_ereignisse,
  DROP COLUMN IF EXISTS ohne_sperrfrist,
  DROP COLUMN IF EXISTS email_kontrolle;

COMMIT;
