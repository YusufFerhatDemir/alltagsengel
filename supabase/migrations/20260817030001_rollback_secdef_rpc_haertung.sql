-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK zu 20260817030000_secdef_rpc_haertung.sql
--
-- WARNUNG — dieser Rollback stellt eine SICHERHEITSLUECKE WIEDER HER.
-- Danach kann jeder Besitzer des oeffentlichen anon-Keys wieder
--   - den Rechnungsnummernkreis eines beliebigen Mandanten hochzaehlen
--     (next_billing_number -> Luecken in der fortlaufenden Nummer),
--   - Zeilen in wf_events und wf_audit_log eines beliebigen Mandanten
--     schreiben (wf_emit_event),
--   - die Workflow-Warteschlange als `postgres` an der RLS vorbei
--     abarbeiten lassen (wf_process_pending / wf_execute_queue_item).
--
-- Es gibt keinen fachlichen Grund dafuer: alle Produktionsaufrufer nutzen
-- service_role und behalten ihr Recht auch nach der Migration.
--
-- Der in Schritt 2 gesetzte search_path wird NICHT zurueckgenommen — ihn zu
-- entfernen waere eine reine Verschlechterung ohne Gegenwert.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

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
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated', sig);
    EXECUTE format('COMMENT ON FUNCTION %s IS NULL', sig);
  END LOOP;
END $$;

COMMIT;
