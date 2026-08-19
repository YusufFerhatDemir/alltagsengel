-- ════════════════════════════════════════════════════════════════════════════
-- Migration: Cron-/Wartungs-Funktionen fuer anon+authenticated sperren
-- Datum:     2026-08-19 (Security-Audit 2026-08-19 — MITTEL-5)
--
-- BEFUND (live nachgestellt, nicht nur aus dem Katalog geschlossen)
--   POST /rest/v1/rpc/cron_check_ueberfaellige_aufgaben mit dem oeffentlichen
--   anon-Key antwortete mit HTTP 200 und
--     {"checked_at": "...", "marked_overdue": 0}
--   Die Funktion ist SECURITY DEFINER und setzt ops_aufgaben auf
--   'ueberfaellig'. Damit haengen zwei Trigger:
--     a) check_aufgabe_eskalation      (BEFORE UPDATE) → Eskalationsstufe/Historie
--     b) wf_trigger_aufgabe_ueberfaellig (AFTER UPDATE) → Workflow-Event
--   Ein Unbeteiligter konnte also ohne Anmeldung Statuswechsel samt
--   Eskalations- und Workflow-Kette ausloesen. Kein Datenabfluss, aber ein
--   schreibender Pfad von aussen.
--
-- URSACHE
--   In Postgres ist EXECUTE auf neu angelegten Funktionen per Default an
--   PUBLIC vergeben. 20260918000000 legte die Funktion an, ohne — wie
--   20260812040000 / 20260823010000 / 20260913000000 — das REVOKE
--   nachzuziehen.
--
-- FIX
--   EXECUTE fuer PUBLIC/anon/authenticated entziehen, nur service_role
--   behaelt es. pg_cron laeuft als Superuser und braucht kein Grant; der
--   Server-seitige Aufruf laeuft ueber den Service-Role-Key.
--
-- Die Schleife wirkt idempotent und nur auf Funktionen, die es gibt.
-- ROLLBACK: 20260922000001_rollback_revoke_anon_cron_funktionen.sql
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
DECLARE
  sig text;
  n   integer := 0;
  cron_fns text[] := ARRAY[
    'cron_check_ueberfaellige_aufgaben'
  ];
BEGIN
  FOR sig IN
    SELECT p.oid::regprocedure::text
    FROM pg_proc p
    JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
    WHERE nsp.nspname = 'public'
      AND p.proname = ANY(cron_fns)
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', sig);
    n := n + 1;
    RAISE NOTICE 'cron-fn abgesichert: %', sig;
  END LOOP;

  RAISE NOTICE '% Cron-Funktion(en) abgesichert', n;
END $$;

-- ── NIEDRIG-7: Pseudonymitaets-Orakel im PflegeCoach schliessen ────────────
--   coach_finde_nutzer_id(text) ist SECURITY DEFINER und war laut
--   20260916000000 ausdruecklich fuer `authenticated` freigegeben. Damit
--   konnte jeder angemeldete Nutzer zu einer beliebigen E-Mail-Adresse
--   abfragen, ob dazu ein PflegeCoach-Konto existiert — eine ungedrosselte
--   Mitgliedschaftsauskunft im Gesundheitskontext (Art. 9 DSGVO).
--   Die Funktion wird nur aus app/api/coach/freigaben/route.ts gerufen; die
--   Route laeuft serverseitig und kann den Service-Role-Client nutzen.
DO $$
DECLARE
  sig text;
BEGIN
  FOR sig IN
    SELECT p.oid::regprocedure::text
    FROM pg_proc p
    JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
    WHERE nsp.nspname = 'public'
      AND p.proname = 'coach_finde_nutzer_id'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', sig);
    RAISE NOTICE 'coach-orakel abgesichert: %', sig;
  END LOOP;
END $$;

COMMIT;
