-- ════════════════════════════════════════════════════════════════════════════
-- Rollback: 20260913000000_secdef_trigger_revoke_nachtrag.sql
--
-- Stellt PUBLIC-EXECUTE auf den 16 Trigger-Funktionen wieder her (Supabase-
-- Default-Privileges). Nur im Notfall verwenden — die REVOKEs sind reine
-- Haertung ohne funktionale Auswirkung (siehe Kommentar in der Hauptmigration).
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
DECLARE
  sig text;
  trigger_fns text[] := ARRAY[
    'enforce_booking_status_transition',
    'prevent_assignment_audit_edit',
    'prevent_billing_tariff_audit_edit',
    'prevent_finalized_service_record_mutation',
    'prevent_service_record_audit_edit',
    'set_invoice_due_date',
    'sync_service_record_status',
    'trg_billing_tariff_audit',
    'trg_leistungspreis_audit',
    'trg_verifizierung_belegpflicht',
    'trg_verifizierung_verfaellt',
    'wf_trigger_aufgabe_ueberfaellig',
    'wf_trigger_dienstplan',
    'wf_trigger_dta_fehler',
    'wf_trigger_dta_ruecklaeufer',
    'wf_trigger_zahlung'
  ];
BEGIN
  FOR sig IN
    SELECT p.oid::regprocedure::text
    FROM pg_proc p
    JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
    WHERE nsp.nspname = 'public'
      AND p.proname = ANY(trigger_fns)
      AND p.prosecdef = true
      AND p.prorettype = 'trigger'::regtype
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO PUBLIC', sig);
  END LOOP;
END $$;

COMMIT;
