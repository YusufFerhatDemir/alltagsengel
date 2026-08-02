-- ════════════════════════════════════════════════════════════════════
-- Monatsabschluss-Assistent + KI-Leistungsnachweis-Prüfzentrale
-- 2026-07-06
-- ════════════════════════════════════════════════════════════════════
--
-- BEFUND vor dieser Migration (live via REST/OpenAPI verifiziert):
--   - service_records, invoice_items, invoices, client_budgets, clients,
--     caregivers existieren bereits (nicht in Migrations-Historie) und
--     sind korrekt constraint-t (siehe 20260702_fix_service_records_check_constraints.sql).
--   - service_records.client_id    → clients.id (NICHT profiles.id)
--   - service_records.caregiver_id → caregivers.id (NICHT profiles.id)
--   - clients.user_id / caregivers.user_id → profiles.id, NULLABLE
--     (viele Klienten/Betreuungskräfte haben keinen eigenen Login).
--   - client_budgets deckt bereits "budget_accounts" ab (§45b/§42a
--     Entlastungs-/Verhinderungspflege-Konten) → KEINE neue Tabelle,
--     nur genutzt/referenziert.
--   - mis_signature_requests existiert bereits (E-Signatur für Dokumente/
--     Verträge) → neue Tabelle heißt service_signatures, um Kollision
--     zu vermeiden (fachlich anderer Zweck: Leistungsnachweis-Unterschrift
--     von Klient + Betreuungskraft direkt am Einsatzort).
--   - mis_audit_log existiert bereits (ISO-Dokumenten-Audit) → neue
--     Tabelle audit_logs ist bewusst getrennter Namensraum für das
--     operative Monatsabschluss-Modul (andere Entities, andere Retention).
--
-- RLS-Muster (Fortsetzung von 20260704/20260705):
--   {table}_admin_all    → is_admin() (Rolle admin/superadmin)
--   {table}_service_all  → service_role (Server-API-Routen, Sync-Endpoint)
-- Alle Schreibzugriffe aus der Native App laufen über Next.js API-Routen
-- (Session-Auth serverseitig geprüft, dann service_role-Insert) — daher
-- KEINE direkten INSERT-Policies für 'authenticated' auf diesen Tabellen.
-- Ausnahme: gezielte read-only Policies für Klient/Betreuungskraft-
-- Transparenz (eigene Zeilen einsehen).
-- ════════════════════════════════════════════════════════════════════

BEGIN;

-- ── Rollen-Helper ─────────────────────────────────────────────────────
-- Interne Mitarbeiter (Admin/PDL/Büro) — breiterer Lesezugriff auf
-- operative Daten als reine is_admin()-Gates, ohne die bestehende
-- is_admin()-Semantik (Admin-Panel-Schreibrechte) zu verändern.
CREATE OR REPLACE FUNCTION public.is_internal_staff()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role = ANY (ARRAY['admin','superadmin','pdl','buero'])
  );
$$;
GRANT EXECUTE ON FUNCTION public.is_internal_staff() TO authenticated, anon, service_role;

-- Betreuungskraft: prüft ob auth.uid() der eingeloggte User der
-- angegebenen caregivers.id ist.
CREATE OR REPLACE FUNCTION public.is_own_caregiver(p_caregiver_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.caregivers
    WHERE id = p_caregiver_id AND user_id = auth.uid()
  );
$$;
GRANT EXECUTE ON FUNCTION public.is_own_caregiver(uuid) TO authenticated, service_role;

-- Klient/Angehörige: prüft ob auth.uid() der eingeloggte User der
-- angegebenen clients.id ist.
CREATE OR REPLACE FUNCTION public.is_own_client(p_client_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.clients
    WHERE id = p_client_id AND user_id = auth.uid()
  );
$$;
GRANT EXECUTE ON FUNCTION public.is_own_client(uuid) TO authenticated, service_role;

-- ════════════════════════════════════════════════════════════════════
-- 1) service_record_items — Einzelpositionen innerhalb eines Einsatzes
--    (mehrere Tätigkeiten/Module während eines Leistungsnachweises)
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.service_record_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_record_id uuid NOT NULL REFERENCES public.service_records(id) ON DELETE CASCADE,
  activity text NOT NULL,
  duration_minutes int,
  notes text DEFAULT '',
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_service_record_items_record ON public.service_record_items(service_record_id);

-- ════════════════════════════════════════════════════════════════════
-- 2) service_signatures — digitale Unterschrift Klient + Betreuungskraft
--    je Einsatz (ergänzt service_records.client_signature/caregiver_initials
--    um vollwertige Signatur-Erfassung inkl. Geo/Device-Kontext)
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.service_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_record_id uuid NOT NULL REFERENCES public.service_records(id) ON DELETE CASCADE,
  signer_role text NOT NULL CHECK (signer_role IN ('client', 'caregiver')),
  signer_name text NOT NULL,
  signature_image text NOT NULL,
  signed_at timestamptz DEFAULT now(),
  device_info jsonb DEFAULT '{}',
  gps_lat numeric,
  gps_lng numeric,
  created_at timestamptz DEFAULT now(),
  UNIQUE (service_record_id, signer_role)
);
CREATE INDEX IF NOT EXISTS idx_service_signatures_record ON public.service_signatures(service_record_id);

-- ════════════════════════════════════════════════════════════════════
-- 3) geo_events — EREIGNISBASIERTER Standort-Nachweis (Check-in/Check-out)
--    KEIN Dauertracking: ein Datensatz pro Ereignis, 150m-Radius-Prüfung
--    gegen approved_locations erfolgt serverseitig bei INSERT.
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.geo_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_record_id uuid NOT NULL REFERENCES public.service_records(id) ON DELETE CASCADE,
  caregiver_id uuid NOT NULL REFERENCES public.caregivers(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('check_in', 'check_out')),
  gps_lat numeric NOT NULL,
  gps_lng numeric NOT NULL,
  accuracy_m numeric,
  distance_to_client_m numeric,
  within_radius boolean,
  radius_m int DEFAULT 150,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_geo_events_record ON public.geo_events(service_record_id);
CREATE INDEX IF NOT EXISTS idx_geo_events_caregiver ON public.geo_events(caregiver_id);

-- ════════════════════════════════════════════════════════════════════
-- 4) approved_locations — geokodierte Klientenadressen für 150m-Prüfung
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.approved_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  label text DEFAULT 'Zuhause',
  address text,
  postal_code text,
  city text,
  gps_lat numeric NOT NULL,
  gps_lng numeric NOT NULL,
  radius_m int DEFAULT 150,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_approved_locations_client ON public.approved_locations(client_id);

-- ════════════════════════════════════════════════════════════════════
-- 5) ocr_results — KI/OCR-Extraktion aus fotografierten Leistungsnachweisen
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.ocr_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_record_id uuid REFERENCES public.service_records(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  raw_text text,
  extracted jsonb DEFAULT '{}',
  confidence numeric,
  engine text DEFAULT 'tesseract',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'failed', 'needs_review')),
  error_message text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ocr_results_record ON public.ocr_results(service_record_id);
CREATE INDEX IF NOT EXISTS idx_ocr_results_status ON public.ocr_results(status);

-- ════════════════════════════════════════════════════════════════════
-- 6) review_errors — Prüfprotokoll: Abweichungen OCR↔Leistungsnachweis,
--    fehlende Unterschriften, Geo-Mismatches, Budget-Überschreitung etc.
--    Fachliche Basis für die Ampel-Logik (gruen/gelb/rot).
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.review_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_record_id uuid NOT NULL REFERENCES public.service_records(id) ON DELETE CASCADE,
  ocr_result_id uuid REFERENCES public.ocr_results(id) ON DELETE SET NULL,
  error_type text NOT NULL CHECK (error_type IN (
    'signature_missing', 'time_mismatch', 'duplicate', 'geo_mismatch',
    'amount_mismatch', 'budget_exceeded', 'ocr_low_confidence', 'other'
  )),
  severity text NOT NULL DEFAULT 'warning' CHECK (severity IN ('info', 'warning', 'critical')),
  description text NOT NULL,
  resolved boolean DEFAULT false,
  resolved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_review_errors_record ON public.review_errors(service_record_id);
CREATE INDEX IF NOT EXISTS idx_review_errors_resolved ON public.review_errors(resolved);

-- ════════════════════════════════════════════════════════════════════
-- 7) monthly_closings — Monatsabschluss je Klient+Monat
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.monthly_closings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  year int NOT NULL,
  month int NOT NULL CHECK (month BETWEEN 1 AND 12),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_review', 'ready', 'closed', 'sent')),
  ampel text NOT NULL DEFAULT 'gruen' CHECK (ampel IN ('gruen', 'gelb', 'rot')),
  total_records int DEFAULT 0,
  total_amount numeric DEFAULT 0,
  budget_used numeric,
  budget_available numeric,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  closed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  closed_at timestamptz,
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (client_id, year, month)
);
CREATE INDEX IF NOT EXISTS idx_monthly_closings_client ON public.monthly_closings(client_id);
CREATE INDEX IF NOT EXISTS idx_monthly_closings_period ON public.monthly_closings(year, month);
CREATE INDEX IF NOT EXISTS idx_monthly_closings_status ON public.monthly_closings(status);

-- ════════════════════════════════════════════════════════════════════
-- 8) invoice_packages — zusammengestelltes PDF-Paket (Rechnung +
--    Leistungsnachweise + Unterschriften) je Rechnung
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.invoice_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL UNIQUE REFERENCES public.invoices(id) ON DELETE CASCADE,
  pdf_url text,
  page_count int,
  generated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  generated_at timestamptz DEFAULT now(),
  checksum text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_invoice_packages_invoice ON public.invoice_packages(invoice_id);

-- ════════════════════════════════════════════════════════════════════
-- 9) payment_status — Zahlungskontrolle je Rechnung (granularer als
--    invoices.status)
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.payment_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'offen' CHECK (status IN ('offen', 'teilbezahlt', 'bezahlt', 'ueberfaellig', 'storniert')),
  amount_due numeric NOT NULL DEFAULT 0,
  amount_paid numeric NOT NULL DEFAULT 0,
  due_date date,
  paid_date date,
  payment_method text,
  reference text,
  reminder_count int DEFAULT 0,
  last_reminder_at timestamptz,
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payment_status_invoice ON public.payment_status(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payment_status_status ON public.payment_status(status);

-- ════════════════════════════════════════════════════════════════════
-- 10) dispatch_status — Versand des Rechnungspakets (Post/E-Mail/Portal)
--     an Pflegekasse/Kostenträger
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.dispatch_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  channel text NOT NULL DEFAULT 'email' CHECK (channel IN ('post', 'email', 'portal')),
  recipient text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'failed', 'bounced')),
  sent_at timestamptz,
  delivered_at timestamptz,
  tracking_ref text,
  error_message text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dispatch_status_invoice ON public.dispatch_status(invoice_id);

-- ════════════════════════════════════════════════════════════════════
-- 11) audit_logs — Append-only Audit-Trail für das Monatsabschluss-Modul
--     (eigener Namensraum, getrennt von mis_audit_log)
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id uuid,
  action text NOT NULL,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_role text,
  before jsonb,
  after jsonb,
  ip_address text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON public.audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON public.audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON public.audit_logs(created_at DESC);

-- Immutabilität analog mis_audit_log (20260417): kein UPDATE/DELETE.
CREATE OR REPLACE FUNCTION public.audit_logs_prevent_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs ist append-only — UPDATE/DELETE nicht erlaubt';
END;
$$;
DROP TRIGGER IF EXISTS trg_audit_logs_no_update ON public.audit_logs;
CREATE TRIGGER trg_audit_logs_no_update BEFORE UPDATE ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.audit_logs_prevent_mutation();
DROP TRIGGER IF EXISTS trg_audit_logs_no_delete ON public.audit_logs;
CREATE TRIGGER trg_audit_logs_no_delete BEFORE DELETE ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.audit_logs_prevent_mutation();

-- ════════════════════════════════════════════════════════════════════
-- 12) offline_queue — lokal gepufferte Mutationen der Native App,
--     werden bei Netz-Wiederkehr serverseitig verarbeitet.
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.offline_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id text,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  operation text NOT NULL CHECK (operation IN ('insert', 'update', 'delete')),
  payload jsonb NOT NULL,
  client_created_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'synced', 'failed', 'conflict')),
  sync_attempts int DEFAULT 0,
  last_error text,
  synced_at timestamptz,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_offline_queue_user ON public.offline_queue(user_id);
CREATE INDEX IF NOT EXISTS idx_offline_queue_status ON public.offline_queue(status);

-- ════════════════════════════════════════════════════════════════════
-- 13) sync_conflicts — Konflikt zwischen lokalem Offline-Stand und
--     Server-Stand beim Sync
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.sync_conflicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offline_queue_id uuid REFERENCES public.offline_queue(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid,
  local_payload jsonb,
  server_payload jsonb,
  resolution text NOT NULL DEFAULT 'pending' CHECK (resolution IN ('pending', 'kept_local', 'kept_server', 'merged')),
  resolved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sync_conflicts_queue ON public.sync_conflicts(offline_queue_id);
CREATE INDEX IF NOT EXISTS idx_sync_conflicts_resolution ON public.sync_conflicts(resolution);

-- ════════════════════════════════════════════════════════════════════
-- 14) action_fingerprints — Idempotenz-Schutz gegen doppelte
--     Offline-Sync-Retries (verhindert doppelte Einsatz-/Signatur-Inserts)
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.action_fingerprints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint text NOT NULL UNIQUE,
  offline_queue_id uuid REFERENCES public.offline_queue(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

COMMIT;

-- ════════════════════════════════════════════════════════════════════
-- RLS
-- ════════════════════════════════════════════════════════════════════
BEGIN;

ALTER TABLE public.service_record_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_signatures   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.geo_events           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approved_locations   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ocr_results          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_errors        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_closings     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_packages     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_status       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatch_status      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offline_queue        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_conflicts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_fingerprints  ENABLE ROW LEVEL SECURITY;

-- Admin-Panel voller Zugriff (Admin/Superadmin) + interne Mitarbeiter lesend
DROP POLICY IF EXISTS service_record_items_admin_all ON public.service_record_items;
CREATE POLICY service_record_items_admin_all ON public.service_record_items
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS service_record_items_staff_read ON public.service_record_items;
CREATE POLICY service_record_items_staff_read ON public.service_record_items
  FOR SELECT USING (public.is_internal_staff());
DROP POLICY IF EXISTS service_record_items_service_all ON public.service_record_items;
CREATE POLICY service_record_items_service_all ON public.service_record_items
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS service_signatures_admin_all ON public.service_signatures;
CREATE POLICY service_signatures_admin_all ON public.service_signatures
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS service_signatures_staff_read ON public.service_signatures;
CREATE POLICY service_signatures_staff_read ON public.service_signatures
  FOR SELECT USING (public.is_internal_staff());
DROP POLICY IF EXISTS service_signatures_caregiver_read ON public.service_signatures;
CREATE POLICY service_signatures_caregiver_read ON public.service_signatures
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.service_records sr
      WHERE sr.id = service_signatures.service_record_id
        AND public.is_own_caregiver(sr.caregiver_id)
    )
  );
DROP POLICY IF EXISTS service_signatures_service_all ON public.service_signatures;
CREATE POLICY service_signatures_service_all ON public.service_signatures
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS geo_events_admin_all ON public.geo_events;
CREATE POLICY geo_events_admin_all ON public.geo_events
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS geo_events_staff_read ON public.geo_events;
CREATE POLICY geo_events_staff_read ON public.geo_events
  FOR SELECT USING (public.is_internal_staff());
DROP POLICY IF EXISTS geo_events_caregiver_read ON public.geo_events;
CREATE POLICY geo_events_caregiver_read ON public.geo_events
  FOR SELECT USING (public.is_own_caregiver(caregiver_id));
DROP POLICY IF EXISTS geo_events_service_all ON public.geo_events;
CREATE POLICY geo_events_service_all ON public.geo_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS approved_locations_admin_all ON public.approved_locations;
CREATE POLICY approved_locations_admin_all ON public.approved_locations
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS approved_locations_staff_read ON public.approved_locations;
CREATE POLICY approved_locations_staff_read ON public.approved_locations
  FOR SELECT USING (public.is_internal_staff());
DROP POLICY IF EXISTS approved_locations_service_all ON public.approved_locations;
CREATE POLICY approved_locations_service_all ON public.approved_locations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS ocr_results_admin_all ON public.ocr_results;
CREATE POLICY ocr_results_admin_all ON public.ocr_results
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS ocr_results_staff_read ON public.ocr_results;
CREATE POLICY ocr_results_staff_read ON public.ocr_results
  FOR SELECT USING (public.is_internal_staff());
DROP POLICY IF EXISTS ocr_results_service_all ON public.ocr_results;
CREATE POLICY ocr_results_service_all ON public.ocr_results
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS review_errors_admin_all ON public.review_errors;
CREATE POLICY review_errors_admin_all ON public.review_errors
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS review_errors_staff_read ON public.review_errors;
CREATE POLICY review_errors_staff_read ON public.review_errors
  FOR SELECT USING (public.is_internal_staff());
DROP POLICY IF EXISTS review_errors_service_all ON public.review_errors;
CREATE POLICY review_errors_service_all ON public.review_errors
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS monthly_closings_admin_all ON public.monthly_closings;
CREATE POLICY monthly_closings_admin_all ON public.monthly_closings
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS monthly_closings_staff_read ON public.monthly_closings;
CREATE POLICY monthly_closings_staff_read ON public.monthly_closings
  FOR SELECT USING (public.is_internal_staff());
DROP POLICY IF EXISTS monthly_closings_client_read ON public.monthly_closings;
CREATE POLICY monthly_closings_client_read ON public.monthly_closings
  FOR SELECT USING (public.is_own_client(client_id));
DROP POLICY IF EXISTS monthly_closings_service_all ON public.monthly_closings;
CREATE POLICY monthly_closings_service_all ON public.monthly_closings
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS invoice_packages_admin_all ON public.invoice_packages;
CREATE POLICY invoice_packages_admin_all ON public.invoice_packages
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS invoice_packages_staff_read ON public.invoice_packages;
CREATE POLICY invoice_packages_staff_read ON public.invoice_packages
  FOR SELECT USING (public.is_internal_staff());
DROP POLICY IF EXISTS invoice_packages_service_all ON public.invoice_packages;
CREATE POLICY invoice_packages_service_all ON public.invoice_packages
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS payment_status_admin_all ON public.payment_status;
CREATE POLICY payment_status_admin_all ON public.payment_status
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS payment_status_staff_read ON public.payment_status;
CREATE POLICY payment_status_staff_read ON public.payment_status
  FOR SELECT USING (public.is_internal_staff());
DROP POLICY IF EXISTS payment_status_service_all ON public.payment_status;
CREATE POLICY payment_status_service_all ON public.payment_status
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS dispatch_status_admin_all ON public.dispatch_status;
CREATE POLICY dispatch_status_admin_all ON public.dispatch_status
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS dispatch_status_staff_read ON public.dispatch_status;
CREATE POLICY dispatch_status_staff_read ON public.dispatch_status
  FOR SELECT USING (public.is_internal_staff());
DROP POLICY IF EXISTS dispatch_status_service_all ON public.dispatch_status;
CREATE POLICY dispatch_status_service_all ON public.dispatch_status
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- audit_logs: nur lesen für Admin/Superadmin (sensibel), Insert nur service_role
DROP POLICY IF EXISTS audit_logs_admin_read ON public.audit_logs;
CREATE POLICY audit_logs_admin_read ON public.audit_logs
  FOR SELECT USING (public.is_admin());
DROP POLICY IF EXISTS audit_logs_service_all ON public.audit_logs;
CREATE POLICY audit_logs_service_all ON public.audit_logs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS offline_queue_admin_all ON public.offline_queue;
CREATE POLICY offline_queue_admin_all ON public.offline_queue
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS offline_queue_own_read ON public.offline_queue;
CREATE POLICY offline_queue_own_read ON public.offline_queue
  FOR SELECT USING (user_id = auth.uid());
DROP POLICY IF EXISTS offline_queue_service_all ON public.offline_queue;
CREATE POLICY offline_queue_service_all ON public.offline_queue
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS sync_conflicts_admin_all ON public.sync_conflicts;
CREATE POLICY sync_conflicts_admin_all ON public.sync_conflicts
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS sync_conflicts_staff_read ON public.sync_conflicts;
CREATE POLICY sync_conflicts_staff_read ON public.sync_conflicts
  FOR SELECT USING (public.is_internal_staff());
DROP POLICY IF EXISTS sync_conflicts_service_all ON public.sync_conflicts;
CREATE POLICY sync_conflicts_service_all ON public.sync_conflicts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS action_fingerprints_admin_all ON public.action_fingerprints;
CREATE POLICY action_fingerprints_admin_all ON public.action_fingerprints
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS action_fingerprints_service_all ON public.action_fingerprints;
CREATE POLICY action_fingerprints_service_all ON public.action_fingerprints
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;

-- ════════════════════════════════════════════════════════════════════
-- Storage-Bucket für Leistungsnachweis-Fotos (privat, Zugriff nur über
-- signierte URLs/Server-Route, analog mis-documents)
-- ════════════════════════════════════════════════════════════════════
INSERT INTO storage.buckets (id, name, public)
VALUES ('service-proofs', 'service-proofs', false)
ON CONFLICT (id) DO NOTHING;

-- storage.objects RLS für den service-proofs-Bucket: Bucket ist privat,
-- storage.objects hat RLS standardmäßig aktiv → ohne Policy kein Zugriff.
-- Admin-Web-Upload (lib/upload-service-proof.ts) läuft über den Browser
-- mit Anon-Key + eingeloggter Admin-Session → braucht is_admin()-Policy.
-- Native-App-Uploads laufen ausschließlich über Server-API-Routen mit
-- service_role (siehe app/api/native/leistungsnachweis-upload/route.ts).
DROP POLICY IF EXISTS service_proofs_admin_all ON storage.objects;
CREATE POLICY service_proofs_admin_all ON storage.objects
  FOR ALL USING (bucket_id = 'service-proofs' AND public.is_admin())
  WITH CHECK (bucket_id = 'service-proofs' AND public.is_admin());

DROP POLICY IF EXISTS service_proofs_service_all ON storage.objects;
CREATE POLICY service_proofs_service_all ON storage.objects
  FOR ALL TO service_role
  USING (bucket_id = 'service-proofs')
  WITH CHECK (bucket_id = 'service-proofs');
