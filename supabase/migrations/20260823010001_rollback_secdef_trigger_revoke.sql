-- Rollback: SECDEF-Trigger-REVOKE rueckgaengig machen
-- Stellt den Supabase-Default wieder her: PUBLIC hat EXECUTE auf alle
-- Funktionen im public-Schema.

DO $$
DECLARE
  sig text;
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
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO PUBLIC', sig);
    RAISE NOTICE 'rollback: %', sig;
  END LOOP;
END $$;
