-- ════════════════════════════════════════════════════════════════════════════
-- Migration: P0 — die SQL-Ausfuehrungs-RPC public._run_sql ist fuer die Rolle
--            `anon` ausfuehrbar. Der anon-Key steht in jedem Browser-Bundle.
-- Datum:     2026-08-17
-- Branch:    staging/expansion-abnahme
--
-- BEFUND (live gemessen gegen nnwyktkqibdjxgimjyuq am 09.08.2026)
--
--   In der Live-Datenbank existieren zwei Objekte, die in keiner Migration
--   dieses Repos stehen — Werkzeug-Reste eines frueheren Apply-Wegs:
--
--       public._run_sql(p text)            -- fuehrt beliebiges SQL aus
--       public._sql_parts(id int, part text)  -- Ablage fuer zerlegtes SQL
--
--   Beide sind oeffentlich erreichbar. Mit dem PUBLIC-Anon-Key gemessen:
--
--       POST /rest/v1/rpc/_run_sql  {"p":"SELECT 1"}      -> HTTP 204
--       POST /rest/v1/rpc/_run_sql  {"p":"SELEKT kaputt"} -> HTTP 400
--                {"code":"42601","message":"syntax error at or near \"SELEKT\""}
--       GET  /rest/v1/_sql_parts?select=*                 -> HTTP 200
--
--   Der Parser wird also erreicht: `anon` kann beliebiges SQL absetzen.
--
--   ENTWARNUNG ZUR TIEFE, KEINE ZUR SACHE: die Funktion laeuft als INVOKER,
--   nicht als DEFINER — gemessen an
--       POST ... {"p":"SELECT 1 FROM auth.users LIMIT 1"} -> HTTP 401
--                {"code":"42501","message":"permission denied for table users"}
--   Es ist also KEINE Superuser-Uebernahme. Ein anonymer Aufrufer bekommt
--   aber die vollen Rechte der Rolle `anon` OHNE den Umweg ueber PostgREST:
--     - beliebige SELECT/INSERT/UPDATE/DELETE, soweit Grants + RLS es zulassen
--     - Umgehung jeder Absicherung, die nur in der API-Schicht sitzt
--     - Fehlermeldungen als Lese-Orakel (Cast-Fehler geben Werte preis)
--     - pg_sleep / teure Queries als DoS gegen die Produktionsdatenbank
--
--   `public._sql_parts` hat zusaetzlich RLS AUS (einzige Tabelle im Schema
--   ohne RLS, gemessen ueber audit_rls_all_status: 201 Tabellen, 1 ohne RLS).
--
-- FIX — minimal und nicht zerstoerend:
--   Es wird NICHTS geloescht. Weder die Funktion noch die Tabelle noch eine
--   Zeile. Entzogen wird ausschliesslich der Zugriff der oeffentlichen Rollen.
--   `service_role` behaelt alles — dieser Schluessel hat ohnehin Vollzugriff,
--   ueber ihn entsteht keine zusaetzliche Angriffsflaeche.
--
-- Idempotent. Rollback: 20260817010001_rollback_sql_exec_rpc_absichern.sql
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1) EXECUTE auf jeder Signatur von public._run_sql entziehen ─────────────
-- Ueber pg_proc, weil die Signatur nicht aus dem Repo bekannt ist (die
-- Funktion wurde ausserhalb der Migrationen angelegt) und es Overloads
-- geben kann.
DO $$
DECLARE
  sig text;
BEGIN
  FOR sig IN
    SELECT p.oid::regprocedure::text
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = '_run_sql'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', sig);
    RAISE NOTICE 'EXECUTE entzogen: %', sig;
  END LOOP;
END $$;

-- ── 2) public._sql_parts: RLS einschalten und Grants entziehen ──────────────
-- Kein DROP: die Tabelle bleibt bestehen (Vorgabe „keine Tabellen loeschen").
-- Ohne Policy und ohne Grant ist sie fuer anon/authenticated unerreichbar;
-- service_role umgeht RLS ohnehin.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = '_sql_parts' AND c.relkind = 'r'
  ) THEN
    EXECUTE 'ALTER TABLE public._sql_parts ENABLE ROW LEVEL SECURITY';
    EXECUTE 'REVOKE ALL ON TABLE public._sql_parts FROM PUBLIC';
    EXECUTE 'REVOKE ALL ON TABLE public._sql_parts FROM anon';
    EXECUTE 'REVOKE ALL ON TABLE public._sql_parts FROM authenticated';
    EXECUTE $c$COMMENT ON TABLE public._sql_parts IS
      'Werkzeug-Rest eines frueheren SQL-Apply-Wegs. Kein Fachdatenbestand. '
      'Seit 20260817010000 ohne Grants fuer anon/authenticated und mit RLS. '
      'Kann geloescht werden, sobald bestaetigt ist, dass kein Apply-Weg sie nutzt.'$c$;
  END IF;
END $$;

-- ── 3) Funktion als das kennzeichnen, was sie ist ───────────────────────────
DO $$
DECLARE
  sig text;
BEGIN
  FOR sig IN
    SELECT p.oid::regprocedure::text
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = '_run_sql'
  LOOP
    EXECUTE format(
      $c$COMMENT ON FUNCTION %s IS
        'Fuehrt beliebiges SQL aus. NUR service_role. EXECUTE fuer anon und '
        'authenticated wurde am 2026-08-17 entzogen (war live offen). '
        'Nicht wieder oeffnen.'$c$, sig);
  END LOOP;
END $$;

COMMIT;

-- ── VERIFIKATION nach dem Apply ─────────────────────────────────────────────
-- a) anon darf nicht mehr:  POST /rest/v1/rpc/_run_sql  {"p":"SELECT 1"}
--    erwartet 404 (nicht mehr im Schema-Cache der Rolle) oder 401/403.
--    NICHT erwartet: 204.
-- b) anon-Tabellenzugriff:  GET /rest/v1/_sql_parts?select=*  -> 401/403/404
-- c) node scripts/verify-sql-exec-abgesichert.mjs
