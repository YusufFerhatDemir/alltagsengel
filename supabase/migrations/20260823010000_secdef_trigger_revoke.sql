-- ════════════════════════════════════════════════════════════════════════════
-- Migration: SECURITY-DEFINER-Funktionen — EXECUTE-Rechte einschraenken
-- Datum:     2026-08-10
-- Branch:    staging/expansion-abnahme
--
-- BEFUND (aus audit/STAGING_STATUS_2026-08-10.md):
--   19 SECURITY-DEFINER-Funktionen im public-Schema ohne REVOKE.
--   Durch Default-Privileges in Supabase sind alle per EXECUTE fuer
--   anon und PUBLIC aufrufbar.
--
-- AUFTEILUNG:
--   A) 17 TRIGGER-Funktionen: kein User braucht EXECUTE — der Trigger-
--      Mechanismus ruft die Funktion unabhaengig von den Aufrufrechten.
--      → REVOKE ALL FROM PUBLIC, anon, authenticated; GRANT TO service_role.
--
--   B) 2 Non-Trigger (is_internal_staff, state_flag): werden in
--      RLS-Policies ausgewertet. Anon/authenticated brauchen EXECUTE
--      fuer die Policy-Auswertung. PUBLIC-Grant entziehen, explizite
--      Grants behalten.
--
-- Idempotent. Rollback: 20260823010001_rollback_secdef_trigger_revoke.sql
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── A) 17 Trigger-Funktionen: EXECUTE komplett entziehen ───────────────────
DO $$
DECLARE
  sig text;
  n   integer := 0;
  trigger_fns text[] := ARRAY[
    'audit_invoice_status_change',
    'prevent_messages_field_tampering',
    'prevent_notifications_field_tampering',
    'prevent_privileged_role_insert',
    'audit_service_record_change',
    'enforce_tariff_obergrenze',
    'enforce_kassentarif_freigeschaltet',
    'enforce_kassenrechnung_freigeschaltet',
    'enforce_booking_zahlungsart',
    'enforce_state_settings_kanal',
    'audit_state_settings_immer',
    'log_arbeitszeit_korrektur',
    'check_aufgabe_eskalation',
    'create_recurring_aufgabe',
    'compute_signature_hash',
    'prevent_locked_record_change',
    'seed_state_settings_for_org'
  ];
BEGIN
  FOR sig IN
    SELECT p.oid::regprocedure::text
    FROM pg_proc p
    JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
    WHERE nsp.nspname = 'public'
      AND p.proname = ANY(trigger_fns)
      AND p.prosecdef = true
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', sig);
    n := n + 1;
    RAISE NOTICE 'trigger-fn abgesichert: %', sig;
  END LOOP;

  RAISE NOTICE '% Trigger-Funktion(en) abgesichert', n;
END $$;

-- ── B) Non-Trigger SECDEF: PUBLIC-Grant entziehen, explizite Grants behalten
DO $$
DECLARE
  sig text;
  n   integer := 0;
  nontrigger_fns text[] := ARRAY[
    'is_internal_staff',
    'state_flag'
  ];
BEGIN
  FOR sig IN
    SELECT p.oid::regprocedure::text
    FROM pg_proc p
    JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
    WHERE nsp.nspname = 'public'
      AND p.proname = ANY(nontrigger_fns)
      AND p.prosecdef = true
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', sig);
    n := n + 1;
    RAISE NOTICE 'non-trigger-fn PUBLIC-revoke: %', sig;
  END LOOP;

  RAISE NOTICE '% Non-Trigger-Funktion(en) PUBLIC-revoked', n;
END $$;

-- is_internal_staff braucht EXECUTE fuer anon, weil RLS-Policies auf
-- MIS-Tabellen es evaluieren. Ohne Aufrufrecht bricht die Policy mit
-- permission-denied statt 0 Zeilen. REVOKE von anon ist NUR sicher,
-- wenn gleichzeitig SELECT auf den betroffenen Tabellen entzogen wird.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'is_internal_staff' AND p.prosecdef
  ) THEN
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION %s TO anon',
      (SELECT p.oid::regprocedure::text FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'is_internal_staff' LIMIT 1)
    );
    RAISE NOTICE 'is_internal_staff: anon-Grant beibehalten (RLS-Abhaengigkeit)';
  END IF;
END $$;

-- state_flag braucht EXECUTE fuer anon wegen Warteliste-RLS-Policy.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'state_flag' AND p.prosecdef
  ) THEN
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION %s TO anon',
      (SELECT p.oid::regprocedure::text FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'state_flag' LIMIT 1)
    );
    RAISE NOTICE 'state_flag: anon-Grant beibehalten (Warteliste-RLS)';
  END IF;
END $$;

-- ── C) search_path bei allen SECDEF-Funktionen ohne search_path setzen ─────
DO $$
DECLARE
  sig text;
  n   integer := 0;
BEGIN
  FOR sig IN
    SELECT p.oid::regprocedure::text
    FROM pg_proc p
    JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
    WHERE nsp.nspname = 'public'
      AND p.prosecdef
      AND NOT EXISTS (
        SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) c
        WHERE c LIKE 'search_path=%'
      )
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path TO public, pg_temp', sig);
    n := n + 1;
    RAISE NOTICE 'search_path gesetzt: %', sig;
  END LOOP;
  RAISE NOTICE '% Funktion(en) search_path nachgezogen', n;
END $$;

COMMIT;

-- ── VERIFIKATION ────────────────────────────────────────────────────────────
-- SELECT p.proname,
--        has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon,
--        has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth,
--        has_function_privilege('service_role',  p.oid, 'EXECUTE') AS svc
-- FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public' AND p.prosecdef;
--
-- Erwartet:
--   Trigger-Funktionen: anon=false, auth=false, svc=true
--   is_internal_staff:  anon=true,  auth=true,  svc=true
--   state_flag:         anon=true,  auth=true,  svc=true
