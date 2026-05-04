-- ═══════════════════════════════════════════════════════════════════
-- 20260502: Security-Hardening — REVOKE EXECUTE auf SECURITY DEFINER
-- ═══════════════════════════════════════════════════════════════════
-- Supabase-Linter (advisor) hat 16 SECURITY DEFINER Funktionen
-- gemeldet, die für anon UND authenticated User via PostgREST
-- /rest/v1/rpc/<function> aufrufbar waren. Risiken:
--
--   * admin_audit_log_purge — KRITISCH: anonymer User konnte
--     Audit-Logs löschen. Function läuft mit erhöhten Rechten (DEFINER).
--   * get_emergency_info_with_pin — 4-stellige PIN, brute-forcebar.
--     Anonyme dürfen das nicht aufrufen.
--   * cleanup_old_rate_limits, handle_new_user, prevent_role_escalation
--     — Trigger/Cron-only, sollten nicht öffentlich callable sein.
--   * audit_check_constraint_exists, audit_rls_policies, audit_rls_status
--     — interne DB-Audit-Tools, nur Service-Role nötig.
--
-- Lösung: REVOKE EXECUTE von anon + authenticated wo nicht benötigt.
-- Service-Role behält EXECUTE (automatisch, kein REVOKE nötig).
-- Trigger funktionieren weiter, weil Trigger nicht über REST-EXECUTE
-- aufgerufen werden — sie nutzen ihre interne Trigger-Permission.
--
-- is_admin() bleibt für authenticated callable — das Frontend braucht
-- es um UI-Sichtbarkeit zu prüfen. anon wird aber entzogen.
-- ═══════════════════════════════════════════════════════════════════

-- 1. admin_audit_log_purge: NUR Service-Role
REVOKE EXECUTE ON FUNCTION public.admin_audit_log_purge(interval) FROM anon, authenticated, public;

-- 2. get_emergency_info_with_pin: NUR Service-Role (Brute-Force-Schutz)
REVOKE EXECUTE ON FUNCTION public.get_emergency_info_with_pin(uuid, text) FROM anon, authenticated, public;

-- 3. cleanup_old_rate_limits: Cron-only
REVOKE EXECUTE ON FUNCTION public.cleanup_old_rate_limits() FROM anon, authenticated, public;

-- 4. handle_new_user: Trigger-only
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;

-- 5. prevent_role_escalation: Trigger-only
REVOKE EXECUTE ON FUNCTION public.prevent_role_escalation() FROM anon, authenticated, public;

-- 6. is_admin: anon entziehen, authenticated darf bleiben (Frontend-UI-Check)
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon, public;

-- 7-9. audit_* Funktionen: nur Service-Role
REVOKE EXECUTE ON FUNCTION public.audit_check_constraint_exists(text, text) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.audit_rls_policies(text[]) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.audit_rls_status(text[]) FROM anon, authenticated, public;
