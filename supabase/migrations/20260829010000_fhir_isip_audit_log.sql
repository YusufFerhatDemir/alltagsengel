-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Block 21 — FHIR / ISiP Interoperabilität — fhir_audit_log
-- Datum:     2026-08-29 (sequenziell), erstellt 2026-08-12
-- Projekt:   Alltagsengel UG
-- ═══════════════════════════════════════════════════════════════════════════
-- IDEMPOTENT: alle Statements mit IF NOT EXISTS / DO-Guards.
-- Rollback:  20260829010001_rollback_fhir_isip_audit_log.sql
--
-- ISiP-Interpretation (kein Zertifizierungsanspruch — siehe docs/fhir-isip.md):
-- Diese Tabelle ist die technische Grundlage der "ISiP-Konformität" in
-- Block 21 — ein lückenloser Audit-Trail für jeden FHIR-Export und -Import.
-- org_fence + is_admin() wie bei allen Betriebs-Tabellen (Vorbild:
-- 20260826010000_dipa_freischaltung_nachweise_eul.sql).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.fhir_audit_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT current_org_id(),

  actor_id        uuid NOT NULL,
  actor_name      text NOT NULL,

  action          text NOT NULL CHECK (action IN ('export', 'import_preview', 'import_commit')),
  resource_types  text[] NOT NULL DEFAULT '{}',
  client_id       uuid,
  resource_count  integer NOT NULL DEFAULT 0,
  details         jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fhir_audit_log_org ON public.fhir_audit_log (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fhir_audit_log_client ON public.fhir_audit_log (client_id) WHERE client_id IS NOT NULL;

ALTER TABLE public.fhir_audit_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'fhir_audit_log' AND policyname = 'admin_fhir_audit_log') THEN
    CREATE POLICY admin_fhir_audit_log ON fhir_audit_log FOR ALL TO authenticated
      USING (is_admin()) WITH CHECK (is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'fhir_audit_log' AND policyname = 'org_fence_fhir_audit_log') THEN
    CREATE POLICY org_fence_fhir_audit_log ON fhir_audit_log AS RESTRICTIVE FOR ALL TO authenticated
      USING (organization_id = current_org_id()) WITH CHECK (organization_id = current_org_id());
  END IF;
END $$;

REVOKE ALL ON fhir_audit_log FROM anon;

COMMENT ON TABLE public.fhir_audit_log IS
  'Audit-Trail für FHIR-Exporte/-Importe (Block 21, ISiP-Sicherheitsmaßnahme). Wer, wann, welcher Klient, welche Ressourcentypen.';
