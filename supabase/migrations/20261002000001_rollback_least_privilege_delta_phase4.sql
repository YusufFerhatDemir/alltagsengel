-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK zu 20261002000000_least_privilege_delta_phase4.sql
-- ════════════════════════════════════════════════════════════════════════════
--
-- Stellt den Zustand VOR der Härtung wieder her. Das ist bewusst ein
-- Rückschritt in der Sicherheit und nur gedacht, wenn die Härtung einen
-- Produktionsweg bricht, der hier übersehen wurde.
--
-- WARNUNG: Schritt 1 gibt anon wieder INSERT/UPDATE/DELETE/TRUNCATE auf allen
-- public-Tabellen. Danach ist RLS erneut die alleinige Grenze — inklusive
-- Löschrecht auf audit_logs. Nur ausführen, wenn wirklich nötig, und danach
-- die Ursache beheben statt den Zustand zu lassen.
--
-- Die SECDEF-Rücknahme (Schritt 2) ist bewusst NICHT enthalten: EXECUTE für
-- anon auf SECURITY-DEFINER-Funktionen war nie beabsichtigt (siehe
-- 20260823010000 und 20260913000000). Ein Rollback, der das zurückdreht,
-- würde eine Regression wiederherstellen, die zweimal geschlossen wurde.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1) Schreibrechte für anon zurückgeben ──────────────────────────────────
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT INSERT, UPDATE, DELETE, TRUNCATE ON TABLES TO anon;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
    ORDER BY c.relname
  LOOP
    EXECUTE format(
      'GRANT INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.%I TO anon',
      r.relname);
  END LOOP;
END $$;

COMMIT;
