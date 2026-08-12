-- ════════════════════════════════════════════════════════════════════════════
-- Migration: P0 — SECURITY-DEFINER-RPCs der Workflow-Engine und der
--            Rechnungsnummern-Vergabe sind fuer `anon` aufrufbar.
-- Datum:     2026-08-17
-- Branch:    staging/expansion-abnahme
--
-- BEFUND (live gemessen gegen nnwyktkqibdjxgimjyuq am 09.08.2026, ueber
--         pg_proc/has_function_privilege — Katalogwahrheit, keine Vermutung)
--
--   Sechs Funktionen sind SECURITY DEFINER (laufen also als `postgres` und
--   umgehen JEDE RLS-Policy), nehmen die Mandanten-ID als PARAMETER entgegen
--   und pruefen KEINE Berechtigung im Body. Gleichzeitig darf `anon` sie
--   ausfuehren — der anon-Key steht in jedem Browser-Bundle:
--
--     has_function_privilege('anon', ..., 'EXECUTE') = true fuer
--       public.wf_emit_event(uuid,text,text,text,uuid,jsonb,text,text,uuid)
--       public.wf_process_event(uuid)
--       public.wf_execute_queue_item(uuid)
--       public.wf_process_pending(integer)
--       public.wf_check_fristen()
--       public.next_billing_number(uuid,text,integer)
--
--   Konkrete Wirkung ohne jede Anmeldung:
--
--   a) next_billing_number(p_org_id) macht ein INSERT .. ON CONFLICT DO
--      UPDATE last_number = last_number + 1 auf billing_number_sequences —
--      fuer eine FREI WAEHLBARE organization_id. Ein anonymer Aufrufer kann
--      den Rechnungsnummernkreis eines beliebigen Mandanten hochzaehlen.
--      Folge: Luecken in der fortlaufenden Rechnungsnummer (§14 Abs. 4 UStG,
--      GoBD-Grundsatz der Vollstaendigkeit).
--
--   b) wf_emit_event(p_organization_id, ...) schreibt frei bestimmbare Zeilen
--      nach wf_events UND nach wf_audit_log — in JEDEN Mandanten. Das ist
--      Fremdbeschreibung des Audit-Logs durch einen Unangemeldeten.
--
--   c) wf_process_pending()/wf_execute_queue_item() arbeiten die Warte-
--      schlange ab und legen dabei als `postgres` Zeilen in ops_aufgaben,
--      ops_benachrichtigungen und ops_wiedervorlagen an — mandantenweit,
--      an der RLS vorbei. In Kombination mit (b): Event einschleusen,
--      Verarbeitung anstossen, Schreibvorgang im fremden Mandanten ausloesen.
--
--   URSACHE — kein Einzelfehler, sondern eine Luecke im Standardverhalten:
--   20260813010000_workflow_engine.sql enthaelt KEIN einziges GRANT. Die
--   Rechte stammen aus den Default-Privileges von Supabase, die im Schema
--   `public` EXECUTE an anon und authenticated erteilen. Jede Funktion, die
--   nicht ausdruecklich zurueckgenommen wird, ist damit oeffentlich.
--   Die neueren Funktionen machen es richtig und dienen hier als Referenz:
--       update_state_settings, claim_waitlist_batch,
--       activate_insurance_billing, deactivate_insurance_billing
--           -> anon=false, authenticated=false  (live geprueft)
--
-- WARUM DER ENTZUG GEFAHRLOS IST — alle Produktionsaufrufer laufen ueber
-- service_role, nicht ueber anon/authenticated (im Code nachgewiesen):
--     app/api/ops/workflow/events/route.ts:10,30      createAdminClient()
--     app/api/ops/workflow/processing/route.ts:9      createAdminClient()
--         -> lib/workflow/events.ts:53   rpc('wf_emit_event')
--         -> lib/workflow/processing.ts:20,28  rpc('wf_process_pending'),
--                                              rpc('wf_check_fristen')
--     lib/billing/core/invoice-engine.ts:402  rpc('next_billing_number')
--         invoice-engine wird ausserhalb von __tests__ nirgends importiert;
--         zusaetzlich faengt generateInvoiceNumber() einen RPC-Fehler ab und
--         weicht auf generateInvoiceNumberFallback() aus (Zeile 409-412).
--         Selbst ein uebersehener Pfad bricht also nicht, sondern degradiert.
--     Browserseitig existiert genau EIN .rpc()-Aufruf im gesamten Repo:
--         app/notfall/[id]/page.tsx:84  get_emergency_info_with_pin
--     — der ist absichtlich anon-faehig (PIN-gated) und wird NICHT angefasst.
--
-- FIX: Rechteentzug fuer die oeffentlichen Rollen, expliziter GRANT an
--      service_role. Es wird KEINE Funktion geloescht, KEIN Body geaendert,
--      KEINE Zeile angefasst.
--
-- ZUSATZ: drei SECURITY-DEFINER-Triggerfunktionen laufen ohne gesetztes
--      search_path (check_aufgabe_eskalation, create_recurring_aufgabe,
--      log_arbeitszeit_korrektur). Das ist nicht akut ausnutzbar — anon hat
--      kein CREATE im Schema public — aber es ist der Standardschutz gegen
--      search_path-Hijacking und wird hier nachgezogen.
--
-- Idempotent. Rollback: 20260817030001_rollback_secdef_rpc_haertung.sql
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1) Oeffentliche Ausfuehrungsrechte auf den sechs RPCs entziehen ─────────
-- Ueber pg_proc statt fester Signaturen: haelt auch, wenn eine Funktion
-- ueberladen ist oder die Signatur sich aendert.
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
      AND p.proname IN (
        'wf_emit_event',
        'wf_process_event',
        'wf_execute_queue_item',
        'wf_process_pending',
        'wf_check_fristen',
        'next_billing_number'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', sig);
    -- service_role ausdruecklich behalten: der Grant darf nicht davon
    -- abhaengen, dass PUBLIC das Recht hat (PUBLIC wird oben entzogen).
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', sig);
    n := n + 1;
    RAISE NOTICE 'abgesichert: %', sig;
  END LOOP;

  IF n = 0 THEN
    RAISE EXCEPTION 'Keine der sechs Zielfunktionen gefunden — falsche '
                    'Datenbank oder Schema? Abbruch statt stiller No-Op.';
  END IF;
  RAISE NOTICE '% Funktion(en) abgesichert', n;
END $$;

-- ── 2) search_path bei SECURITY-DEFINER-Triggerfunktionen nachziehen ────────
DO $$
DECLARE
  sig text;
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
    RAISE NOTICE 'search_path gesetzt: %', sig;
  END LOOP;
END $$;

-- ── 3) Absicht dokumentieren, damit der naechste Apply-Weg es nicht kippt ───
DO $$
DECLARE
  sig text;
BEGIN
  FOR sig IN
    SELECT p.oid::regprocedure::text
    FROM pg_proc p
    JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
    WHERE nsp.nspname = 'public'
      AND p.proname IN (
        'wf_emit_event', 'wf_process_event', 'wf_execute_queue_item',
        'wf_process_pending', 'wf_check_fristen', 'next_billing_number'
      )
  LOOP
    EXECUTE format(
      $c$COMMENT ON FUNCTION %s IS
        'SECURITY DEFINER ohne Berechtigungspruefung im Body und mit '
        'Mandanten-ID als Parameter. Ausfuehrung deshalb NUR service_role. '
        'EXECUTE fuer anon/authenticated am 2026-08-17 entzogen '
        '(Migration 20260817030000). Nicht wieder oeffnen — der Aufruf '
        'gehoert hinter requireOpsAdmin() in einer API-Route.'$c$, sig);
  END LOOP;
END $$;

COMMIT;

-- ── VERIFIKATION nach dem Apply ─────────────────────────────────────────────
-- SELECT p.proname,
--        has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon,
--        has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth,
--        has_function_privilege('service_role',  p.oid, 'EXECUTE') AS svc
-- FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public'
--   AND p.proname IN ('wf_emit_event','wf_process_event','wf_execute_queue_item',
--                     'wf_process_pending','wf_check_fristen','next_billing_number');
-- Erwartet: anon = false, auth = false, svc = true fuer alle sechs.
--
-- node scripts/verify-secdef-rpc-haertung.mjs
