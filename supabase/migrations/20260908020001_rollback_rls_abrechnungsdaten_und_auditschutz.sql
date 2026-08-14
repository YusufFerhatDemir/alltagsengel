-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK zu 20260908000000_rls_abrechnungsdaten_und_auditschutz.sql
--
-- WARNUNG: dieses Rollback stellt den unsicheren Ausgangszustand wieder her
-- (orgweites Lesen der Abrechnungsdaten fuer jeden eingeloggten Nutzer,
-- beschreibbarer Audit-Trail, wirkungsloser Unveraenderlichkeits-Trigger).
-- Nur ausfuehren, wenn die Migration nachweislich einen Betriebsausfall
-- verursacht — und dann sofort einen engeren Ersatz nachziehen.
-- ════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS invoice_snapshots_select ON public.invoice_snapshots;
CREATE POLICY invoice_snapshots_select ON public.invoice_snapshots
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS invoice_line_snapshots_select ON public.invoice_line_snapshots;
CREATE POLICY invoice_line_snapshots_select ON public.invoice_line_snapshots
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS invoice_corrections_select ON public.invoice_corrections;
CREATE POLICY invoice_corrections_select ON public.invoice_corrections
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS billing_audit_trail_select ON public.billing_audit_trail;
CREATE POLICY billing_audit_trail_select ON public.billing_audit_trail
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS billing_number_sequences_select ON public.billing_number_sequences;
CREATE POLICY billing_number_sequences_select ON public.billing_number_sequences
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS billing_tariffs_select ON public.billing_tariffs;
CREATE POLICY billing_tariffs_select ON public.billing_tariffs
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS billing_audit_trail_insert ON public.billing_audit_trail;
CREATE POLICY billing_audit_trail_insert ON public.billing_audit_trail
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS as_audit_insert ON public.assignment_audit_log;
CREATE POLICY as_audit_insert ON public.assignment_audit_log
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS sr_audit_insert ON public.service_record_audit_log;
CREATE POLICY sr_audit_insert ON public.service_record_audit_log
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS angel_availability_select ON public.angel_availability;
CREATE POLICY angel_availability_select ON public.angel_availability
  FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.prevent_finalized_service_record_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'freigegeben' AND NEW.status != 'korrektur' THEN
    RAISE EXCEPTION 'Freigegebene Leistungsnachweise können nur über Korrektur geändert werden.';
  END IF;
  RETURN NEW;
END;
$$;
