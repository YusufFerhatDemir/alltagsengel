-- ════════════════════════════════════════════════════════════════════════════
-- Migration: SECURITY-DEFINER-Trigger-Funktionen — Nachtrag zu 20260823010000
-- Datum:     2026-08-14 (Phase 7 — Security Red Team)
--
-- BEFUND
--   20260823010000_secdef_trigger_revoke.sql haertete 17 Trigger-Funktionen,
--   die zu diesem Zeitpunkt existierten. Seither wurden 16 weitere
--   SECURITY-DEFINER-Trigger-Funktionen angelegt (Audit-Unveraenderlichkeit,
--   Zahlungsziel, wf_*-Workflow-Engine, Tarif-Belegpflicht) — ohne dasselbe
--   REVOKE. Live pruefbar per has_function_privilege('anon'/'authenticated',
--   oid, 'EXECUTE').
--
-- EINSTUFUNG: kein aktiv ausnutzbares Leck.
--   Trigger-Funktionen (RETURNS trigger) lassen sich nicht direkt per
--   SELECT/RPC aufrufen — Postgres bricht mit "trigger functions can only
--   be called as triggers" ab, unabhaengig von EXECUTE-Rechten. Der
--   Trigger-Mechanismus selbst prueft keine EXECUTE-Rechte der ausloesenden
--   Rolle. Das REVOKE ist Haertung nach demselben Muster wie 20260823010000,
--   keine Reaktion auf eine tatsaechlich ausnutzbare Luecke.
--
-- BETROFFENE FUNKTIONEN (alle RETURNS trigger, SECURITY DEFINER)
--   enforce_booking_status_transition, prevent_assignment_audit_edit,
--   prevent_billing_tariff_audit_edit, prevent_finalized_service_record_mutation,
--   prevent_service_record_audit_edit, set_invoice_due_date,
--   sync_service_record_status, trg_billing_tariff_audit,
--   trg_leistungspreis_audit, trg_verifizierung_belegpflicht,
--   trg_verifizierung_verfaellt, wf_trigger_aufgabe_ueberfaellig,
--   wf_trigger_dienstplan, wf_trigger_dta_fehler, wf_trigger_dta_ruecklaeufer,
--   wf_trigger_zahlung
--
-- Idempotent: die Schleife wirkt nur auf Funktionen, die existieren.
-- ROLLBACK: 20260913000001_rollback_secdef_trigger_revoke_nachtrag.sql
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
DECLARE
  sig text;
  n   integer := 0;
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
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', sig);
    n := n + 1;
    RAISE NOTICE 'trigger-fn abgesichert: %', sig;
  END LOOP;

  RAISE NOTICE '% Trigger-Funktion(en) abgesichert', n;
END $$;

COMMIT;
