-- ════════════════════════════════════════════════════════════════════
-- Löschkette — der tote pg_cron-Takt wird abgeräumt
-- ════════════════════════════════════════════════════════════════════
--
-- BEFUND (live gelesen mit `npm run verify:loeschkette`, Prüfung B):
--
--   app.settings.supabase_url  →  (nicht gesetzt)
--
-- Der Job `account-hard-delete-daily` aus Migration 20260918020000 baut
-- seine Ziel-URL aus `current_setting('app.settings.supabase_url', true)`.
-- Ist die GUC nicht gesetzt, ist der Ausdruck NULL, `NULL || '/pfad'` ist
-- ebenfalls NULL, und `net.http_post(url := NULL)` ruft nichts auf — ohne
-- Fehlermeldung irgendwo. Der Takt schlug also täglich ins Leere.
--
-- DIE GUC WIRD HIER ABSICHTLICH NICHT GESETZT. Drei Gründe:
--
--   1. Der Job bräuchte zusätzlich `app.settings.service_role_key`. Ein
--      Geheimnis gehört nicht in eine eingecheckte Migration und nicht in
--      eine per `SELECT current_setting(...)` lesbare GUC.
--   2. Selbst mit beiden GUCs liefe der Aufruf ins Leere: der Job schickt
--      den service_role_key als Bearer, die Edge Function vergleicht
--      gegen CRON_SECRET — zwei verschiedene Geheimnisse.
--   3. Die Edge Function `account-hard-delete` ist seit Track 11
--      stillgelegt und antwortet ohne HARD_DELETE_EDGE_AKTIV mit 410.
--
-- Nur die URL zu setzen wäre die schlechteste aller Varianten: die
-- Prüfung würde grün, der Takt bliebe tot.
--
-- DER TAKT LIEGT SEIT TRACK 11 WOANDERS: `vercel.json` ruft täglich um
-- 03:00 `/api/cron/konto-loeschung` auf. Dort stehen die Umgebungs-
-- variablen ohnehin, der Türsteher ist `pruefeCronGeheimnis` aus
-- lib/api/cron-auth.ts, und der Ablauf ist ohne Datenbank prüfbar.
-- Zwei Taktgeber für dieselbe Aufgabe sind einer zu viel — der tote
-- kommt weg.
--
-- ZUSÄTZLICH: eine Diagnosefunktion, damit die Behauptung „es hängt kein
-- Taktgeber mehr an einer ungesetzten GUC" von außen NACHLESBAR wird.
-- Das Schema `cron` gehört `postgres`; der Dienstschlüssel hat darauf
-- keine USAGE und bekommt sie hier auch nicht — die Funktion gibt nur
-- Jobnamen und ein Ja/Nein zurück, NIE den Befehlstext, in dem bei
-- anderen Jobs Geheimnisse stehen könnten.
--
-- STATUS: NICHT ANGEWENDET. Nur eingecheckt.
-- HINWEIS ZUR NUMMER: der Zeitstempel ist der reale Zeitpunkt der
-- Erstellung (29.08.2026) und liegt damit VOR den vorausdatierten
-- Nummern 202610*. Die Reihenfolge spielt hier keine Rolle: die
-- Migration hat keine Abhängigkeit zu ihnen.
-- ════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1) Den toten Job entfernen ──────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron nicht vorhanden — nichts abzuräumen.';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'account-hard-delete-daily') THEN
    PERFORM cron.unschedule('account-hard-delete-daily');
    RAISE NOTICE 'pg_cron-Job "account-hard-delete-daily" entfernt (toter Takt, NULL-URL).';
  ELSE
    RAISE NOTICE 'pg_cron-Job "account-hard-delete-daily" war nicht eingeplant.';
  END IF;
END $$;

-- ── 2) Die Tatsache von außen nachlesbar machen ─────────────────────
-- Gibt je eingeplantem Job zurück, OB sein Befehl auf `app.settings.*`
-- zugreift und ob die dort verlangte GUC gesetzt ist. Der Befehlstext
-- selbst verlässt die Funktion nicht.
CREATE OR REPLACE FUNCTION public.loeschkette_takt_diagnose()
RETURNS TABLE (jobname text, haengt_an_guc boolean, guc_gesetzt boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF to_regclass('cron.job') IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT j.jobname::text,
           j.command ILIKE '%app.settings.%',
           coalesce(nullif(current_setting('app.settings.supabase_url', true), ''), '') <> ''
    FROM cron.job j;
END;
$$;

COMMENT ON FUNCTION public.loeschkette_takt_diagnose() IS
  'Diagnose fuer npm run verify:loeschkette (Pruefung B): welcher eingeplante '
  'pg_cron-Job baut seinen Aufruf aus app.settings.* zusammen. Gibt bewusst '
  'NIE den Befehlstext zurueck — dort koennen Geheimnisse stehen. Nur fuer '
  'service_role ausfuehrbar.';

-- Fail-closed: jede public-Funktion ist per Default fuer anon ausfuehrbar.
REVOKE ALL ON FUNCTION public.loeschkette_takt_diagnose() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.loeschkette_takt_diagnose() FROM anon;
REVOKE ALL ON FUNCTION public.loeschkette_takt_diagnose() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.loeschkette_takt_diagnose() TO service_role;

COMMIT;

-- ── Nach dem Apply ──────────────────────────────────────────────────
-- `npm run verify:loeschkette` ausfuehren: Pruefung B meldet dann
-- „kein Taktgeber haengt an app.settings.*" statt „nicht lesbar".
