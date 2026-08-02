-- ════════════════════════════════════════════════════════════════════
-- BASELINE Teil 1b: Funktionen & Spalten, die nur live existierten
-- ════════════════════════════════════════════════════════════════════
--
-- Gegenstück zu 20260101000000_baseline_live_only_tables.sql. Enthält
-- die fünf RPCs und die Spalten/Constraints, die im Live-Projekt
-- nnwyktkqibdjxgimjyuq existieren, aber in keiner Migration standen.
-- Ohne sie brechen 20260502_revoke_anon_security_definer_funcs.sql und
-- 20260705_engel_cards_rpc_safe_columns.sql auf einer leeren DB ab.
--
-- ⚠️  WICHTIGE EINSCHRÄNKUNG — bitte vor Nutzung lesen
-- ----------------------------------------------------
-- Funktions-RÜMPFE sind über PostgREST nicht introspizierbar. Nur die
-- Signaturen sind aus dem Live-Schema bzw. den Aufrufstellen im Code
-- gesichert. Die Implementierungen unten sind REKONSTRUKTIONEN aus:
--   • app/notfall/[id]/page.tsx        (Aufrufvertrag + Fehler-Codes)
--   • scripts/audit-rls.ts            (Parameter + Rückgabespalten)
--   • supabase/migrations/20260419_rls_matrix_rpcs.sql (all-Varianten)
--
-- Sie sind funktional äquivalent zum dokumentierten Vertrag, aber NICHT
-- byte-gleich mit dem Live-Stand. Alle CREATE sind deshalb defensiv
-- (`IF NOT EXISTS` / Existenzprüfung) — auf der Produktions-DB wäre
-- diese Datei ein No-Op. Sie wurde dort NICHT angewendet.
--
-- Um die Rekonstruktion durch das Original zu ersetzen, sobald ein
-- Zugang mit DB-Passwort vorliegt:
--   supabase db dump --db-url "$PROD_DB_URL" --schema public -f live.sql
--   # daraus die CREATE FUNCTION-Blöcke übernehmen
-- Siehe audit/DATABASE_SCHEMA_GAP_REPORT.md, Gap G-3.
-- ════════════════════════════════════════════════════════════════════

BEGIN;

-- ── Live-only-Spalten auf Repo-verwalteten Tabellen ──────────────────
-- profiles.is_test wird von get_engel_cards() (20260705) gelesen.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_test boolean DEFAULT false;

-- ── CHECK-Constraint, den scripts/audit-rls.ts erzwingt ──────────────
-- 4-stellige numerische PIN (CAPA-2026-001).
DO $$ BEGIN
  IF to_regclass('public.notfall_info') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint WHERE conname = 'notfall_info_pin_format_check'
     ) THEN
    ALTER TABLE public.notfall_info
      ADD CONSTRAINT notfall_info_pin_format_check
      CHECK (notfall_pin IS NULL OR notfall_pin ~ '^[0-9]{4}$');
  END IF;
END $$;

-- ── 0) Trigger-Funktionen, auf die spätere Migrationen zugreifen ─────
-- 20260414_fix_user_metadata_rls.sql:261 setzt per ALTER FUNCTION den
-- search_path beider Funktionen; 20260502 entzieht ihnen Grants. Ohne
-- diese Definitionen bricht der Replay dort ab.

-- prevent_role_escalation: verhindert, dass ein Nutzer seine eigene
-- profiles.role hochsetzt. Nur Admins dürfen role ändern.
CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.role IS NOT DISTINCT FROM OLD.role THEN
    RETURN NEW;
  END IF;

  -- Kein JWT im Request → Zugriff läuft über service_role bzw. eine
  -- direkte DB-Verbindung (Backend-Job, Migration, Seed). Diese Wege
  -- müssen Rollen administrieren können; die Absicherung dagegen ist
  -- der Schutz des Service-Role-Keys, nicht dieser Trigger.
  IF coalesce(current_setting('request.jwt.claims', true), '') = '' THEN
    RETURN NEW;
  END IF;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Rollenwechsel nicht erlaubt';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_role_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_role_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_role_escalation();

-- Referral-Spalten + Code-Generator (live-only auf public.profiles).
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS referral_code   text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS referred_by     uuid;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS referral_credit numeric DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS postal_code     text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_referral_code
  ON public.profiles (referral_code) WHERE referral_code IS NOT NULL;

CREATE OR REPLACE FUNCTION public.generate_referral_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.referral_code IS NULL THEN
    NEW.referral_code := upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8));
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_role_escalation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.generate_referral_code()  FROM PUBLIC, anon, authenticated;

-- ── 1) audit_rls_status(p_tables) ────────────────────────────────────
-- Gefilterte Variante von audit_rls_all_status(). Service-Role-only.
CREATE OR REPLACE FUNCTION public.audit_rls_status(p_tables text[])
RETURNS TABLE (
  schemaname       text,
  tablename        text,
  rowsecurity      boolean,
  forcerowsecurity boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT n.nspname::text, c.relname::text, c.relrowsecurity, c.relforcerowsecurity
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r', 'p')
    AND c.relname = ANY (p_tables)
  ORDER BY c.relname;
$$;

REVOKE ALL ON FUNCTION public.audit_rls_status(text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.audit_rls_status(text[]) TO service_role;

-- ── 2) audit_rls_policies(p_tables) ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.audit_rls_policies(p_tables text[])
RETURNS TABLE (
  schemaname  text,
  tablename   text,
  policyname  text,
  permissive  text,
  roles       text[],
  cmd         text,
  qual        text,
  with_check  text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT schemaname::text, tablename::text, policyname::text, permissive::text,
         roles::text[], cmd::text, qual::text, with_check::text
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = ANY (p_tables)
  ORDER BY tablename, policyname;
$$;

REVOKE ALL ON FUNCTION public.audit_rls_policies(text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.audit_rls_policies(text[]) TO service_role;

-- ── 3) audit_check_constraint_exists(p_table, p_constraint) ──────────
CREATE OR REPLACE FUNCTION public.audit_check_constraint_exists(
  p_table text, p_constraint text
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = p_table
      AND con.conname = p_constraint
  );
$$;

REVOKE ALL ON FUNCTION public.audit_check_constraint_exists(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.audit_check_constraint_exists(text, text) TO service_role;

-- ── 4) cleanup_old_rate_limits() ─────────────────────────────────────
-- Retention für login_rate_limits: abgelaufene Sperren wegräumen.
CREATE OR REPLACE FUNCTION public.cleanup_old_rate_limits()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  deleted integer;
BEGIN
  DELETE FROM public.login_rate_limits
  WHERE locked_until < now() - interval '24 hours'
    AND updated_at   < now() - interval '24 hours';
  GET DIAGNOSTICS deleted = ROW_COUNT;
  RETURN deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_old_rate_limits() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_old_rate_limits() TO service_role;

-- ── 5) get_emergency_info_with_pin(p_user_id, p_pin) ─────────────────
-- Vertrag (aus app/notfall/[id]/page.tsx):
--   Treffer         → jsonb mit Notfalldaten, OHNE notfall_pin
--   falscher PIN    → {"error": "invalid_pin"}
--   zu viele Fehler → {"error": "rate_limited"}   (>5 Fehlversuche/Stunde)
--   kein Datensatz  → NULL
-- Der PIN verlässt die Datenbank in keinem Zweig.
CREATE OR REPLACE FUNCTION public.get_emergency_info_with_pin(
  p_user_id uuid, p_pin text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  rec       public.notfall_info%ROWTYPE;
  failures  integer;
BEGIN
  -- Brute-Force-Bremse: Fehlversuche der letzten Stunde pro Ziel-User
  SELECT count(*) INTO failures
  FROM public.notfall_access_attempts
  WHERE user_id = p_user_id
    AND success = false
    AND attempted_at > now() - interval '1 hour';

  IF failures >= 5 THEN
    RETURN jsonb_build_object('error', 'rate_limited');
  END IF;

  SELECT * INTO rec FROM public.notfall_info WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF rec.notfall_pin IS DISTINCT FROM p_pin THEN
    INSERT INTO public.notfall_access_attempts (user_id, success)
    VALUES (p_user_id, false);
    RETURN jsonb_build_object('error', 'invalid_pin');
  END IF;

  INSERT INTO public.notfall_access_attempts (user_id, success)
  VALUES (p_user_id, true);

  RETURN to_jsonb(rec) - 'notfall_pin';
END;
$$;

-- Grants bewusst restriktiv: 20260502_revoke_anon_security_definer_funcs.sql
-- entzieht anon/authenticated erneut — hier gar nicht erst vergeben.
REVOKE ALL ON FUNCTION public.get_emergency_info_with_pin(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_emergency_info_with_pin(uuid, text) TO service_role;

COMMIT;
