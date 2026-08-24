-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: org_fence für 5 Tabellen nachrüsten (P2-c)
-- Datum: 2026-08-24, Phase 5
--
-- BEFUND
--   5 Tabellen mit organization_id haben keinen RESTRICTIVE org_fence.
--   Ihre permissiven Policies prüfen die Organisation bereits selbst —
--   der org_fence ist reiner Tiefenschutz: wenn jemand eine neue permissive
--   Policy ohne Org-Check hinzufügt, greift der Zaun trotzdem.
--
--   state_settings, state_settings_audit, billing_tariff_audit:
--     Permissive Policies nutzen current_org_id() — org_fence passt direkt.
--
--   billing_tarif_belege:
--     Permissive Policy nutzt organization_members-Subquery (alle Orgs des
--     Users). org_fence mit current_org_id() ist enger, aber korrekt: der
--     Lesepfad geht immer über den Admin-Client im Kontext einer Org.
--
--   organization_subscriptions:
--     Permissive Policy nutzt is_org_member(). org_fence mit current_org_id()
--     ist enger, aber korrekt: Abo-Daten werden immer im Org-Kontext gelesen.
--
--   NICHT enthalten:
--   - organization_members: Multi-Org-Verwaltung braucht Zugriff über die
--     aktuelle Org hinaus (Owner wechselt zwischen Orgs). org_fence hier
--     würde das brechen.
--   - state_waitlist: Öffentliche Warteliste ohne Org-Zugehörigkeit des
--     Einschreibenden. org_fence passt nicht zum Anwendungsfall.
--
-- Idempotent via IF NOT EXISTS-Prüfung im DO-Block.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
DECLARE
  tabellen text[] := ARRAY[
    'billing_tarif_belege',
    'billing_tariff_audit',
    'organization_subscriptions',
    'state_settings',
    'state_settings_audit'
  ];
  t text;
  polname text;
BEGIN
  FOREACH t IN ARRAY tabellen LOOP
    polname := 'org_fence_' || t;

    -- Nur anlegen, wenn noch nicht vorhanden
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t AND policyname = polname
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (organization_id = current_org_id())',
        polname, t
      );
      RAISE NOTICE 'org_fence angelegt: %', t;
    ELSE
      RAISE NOTICE 'org_fence existiert bereits: %', t;
    END IF;
  END LOOP;
END $$;

COMMIT;
