-- ═══════════════════════════════════════════════════════════════════════
-- Persistenter API-Ratelimit
--
-- Master-Final-Release-Audit 2026-08-19, Befund B-2 / I-6:
-- /api/visitor-alert ist unauthentifiziert aufrufbar, nutzt
-- createAdminClient(), legt Notifications an und versendet Mail. Der
-- bisherige Schutz (lib/rate-limit.ts + eine Map im Modul-Scope) gilt nur
-- PRO SERVERLESS-INSTANZ. Auf Vercel skaliert das horizontal — jede neue
-- Instanz startet mit leerem Zaehler, das Limit ist damit beliebig oft
-- umgehbar.
--
-- Diese Migration legt einen gemeinsamen Zaehler in der Datenbank an.
--
-- Bewusst NICHT login_rate_limits wiederverwendet: dessen Semantik
-- (attempts/locked_until) gehoert der Login-Sperre und wird von
-- cleanup_old_rate_limits() nach eigener Regel abgeraeumt.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1) Zaehler-Tabelle ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.api_rate_limits (
  key          text        PRIMARY KEY,
  window_start timestamptz NOT NULL DEFAULT now(),
  hits         integer     NOT NULL DEFAULT 0,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;

-- Keine Policy: die Tabelle ist ausschliesslich service_role-Sache.
-- service_role umgeht RLS, alle anderen Rollen sehen damit nichts.
REVOKE ALL ON TABLE public.api_rate_limits FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.api_rate_limits TO service_role;

COMMENT ON TABLE public.api_rate_limits IS
  'Instanzuebergreifender Ratelimit-Zaehler fuer oeffentliche API-Routen (Audit B-2).';

-- ── 2) Zaehl-RPC (atomar, ein Roundtrip) ────────────────────────────
-- Rueckgabe: true = Request erlaubt, false = Limit erreicht.
CREATE OR REPLACE FUNCTION public.api_rate_limit_hit(
  p_key            text,
  p_limit          integer,
  p_window_seconds integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_key    text;
  v_hits   integer;
BEGIN
  -- Fail-closed bei Unsinn-Parametern: lieber blocken als durchwinken.
  IF p_key IS NULL OR length(btrim(p_key)) = 0 THEN RETURN false; END IF;
  IF p_limit IS NULL OR p_limit < 1 THEN RETURN false; END IF;
  IF p_window_seconds IS NULL OR p_window_seconds < 1 THEN RETURN false; END IF;

  v_key := left(p_key, 200);

  INSERT INTO public.api_rate_limits AS l (key, window_start, hits, updated_at)
  VALUES (v_key, now(), 1, now())
  ON CONFLICT (key) DO UPDATE
    SET hits = CASE
                 WHEN l.window_start < now() - make_interval(secs => p_window_seconds)
                 THEN 1
                 ELSE l.hits + 1
               END,
        window_start = CASE
                 WHEN l.window_start < now() - make_interval(secs => p_window_seconds)
                 THEN now()
                 ELSE l.window_start
               END,
        updated_at = now()
  RETURNING l.hits INTO v_hits;

  RETURN v_hits <= p_limit;
END;
$$;

-- Jede public-Funktion ist per Default anon-ausfuehrbar. Ohne dieses
-- REVOKE koennte ein Angreifer fremde Zaehler hochtreiben.
REVOKE ALL ON FUNCTION public.api_rate_limit_hit(text, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_rate_limit_hit(text, integer, integer)
  TO service_role;

-- ── 3) Retention ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cleanup_api_rate_limits()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  deleted integer;
BEGIN
  DELETE FROM public.api_rate_limits
  WHERE updated_at < now() - interval '7 days';
  GET DIAGNOSTICS deleted = ROW_COUNT;
  RETURN deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_api_rate_limits() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_api_rate_limits() TO service_role;

COMMIT;
