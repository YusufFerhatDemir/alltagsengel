-- ════════════════════════════════════════════════════════════════════════════
-- Migration: Abrechnungsdaten abdichten + Audit-Trail unfaelschbar machen
-- Datum:     2026-08-14
-- Befund:    Security-Final-Audit, Bereiche 1/2/6/12
--
-- ── BEFUND 1 (P0, Vertraulichkeit) ──────────────────────────────────────────
-- Sechs abrechnungsnahe Tabellen tragen eine PERMISSIVE Lesepolicy
--   FOR SELECT TO authenticated USING (true)
-- Einziger Gegenhalt ist die RESTRICTIVE Policy
--   organization_id = current_org_id()
-- current_org_id() faellt aber fuer JEDEN Nutzer ohne Zeile in
-- organization_members auf die Stamm-Org zurueck (COALESCE-Default). Live
-- existieren genau 3 Mitgliedschaften — jeder Kunde und jeder Engel landet
-- damit INNERHALB des Zauns der Stamm-Org.
--
-- Wirkung: jeder eingeloggte Nutzer konnte per PostgREST direkt lesen:
--   invoice_snapshots        — Klientenbezug, Kostentraeger, Versichertennummer,
--                              Rechnungsbetraege (vollstaendiger Rechnungsinhalt)
--   invoice_line_snapshots   — Leistungsart + Leistungsdatum je Klient
--   invoice_corrections      — Storno-/Gutschriftgruende
--   billing_audit_trail      — kompletter Abrechnungs-Audit-Trail
--   billing_tariffs          — Preisgefuege
--   billing_number_sequences — Rechnungsnummernstand
-- Das sind personenbezogene Gesundheits- und Finanzdaten Dritter.
--
-- Fix: die USING(true)-Policies werden durch eine Rollenpruefung ersetzt.
-- Der RESTRICTIVE Org-Zaun bleibt zusaetzlich bestehen (beide muessen greifen).
--
-- ── BEFUND 2 (P0, Integritaet / GoBD) ───────────────────────────────────────
-- billing_audit_trail.INSERT hatte WITH CHECK (true) fuer authenticated.
-- Jeder eingeloggte Nutzer konnte damit beliebige Audit-Eintraege erzeugen —
-- inklusive erfundener Aktionen unter fremder actor_id. Ein Audit-Trail, in
-- den jeder schreiben kann, ist als Nachweis wertlos.
-- Dieselbe Luecke in assignment_audit_log und service_record_audit_log.
--
-- Fix: INSERT nur noch fuer Admins. Der regulaere Schreibweg der Anwendung
-- laeuft ueber Service-Role und ist von RLS ohnehin nicht betroffen.
--
-- ── BEFUND 3 (bewertet, bewusst NICHT geaendert) ────────────────────────────
-- angel_availability: SELECT USING(true), kein Org-Zaun — Verfuegbarkeiten
-- aller Engel sind fuer jeden eingeloggten Nutzer lesbar.
-- Bewertung: das ist Marktplatz-Funktion, keine Luecke. Die Kundenseite
-- (app/kunde/engel/[id], app/kunde/buchen/[id]) liest diese Zeilen mit dem
-- User-JWT, um freie Termine anzuzeigen; die Engel-Profile in `angels` sind
-- aus demselben Grund bereits bewusst oeffentlich (siehe Freigabeliste in
-- scripts/verify-anon-exposure.mjs). Die Tabelle enthaelt Zeitfenster und
-- angel_id, keine Kontakt- oder Gesundheitsdaten.
-- Eine Verschaerfung auf `angel_id = auth.uid() OR is_admin()` wurde geprueft
-- und verworfen: sie haette die Terminauswahl im Buchungsweg abgeschaltet.
--
-- ── BEFUND 4 (P1, Unveraenderlichkeit Leistungsnachweis) ────────────────────
-- prevent_finalized_service_record_mutation() prueft OLD.status = 'freigegeben'.
-- Diesen Status gibt es in der Statusleiter von service_records nicht; sie
-- lautet draft → incomplete → complete → signed → invoiced (siehe
-- sync_service_record_status()). Der Trigger war damit wirkungslos: live
-- stehen 15 Nachweise auf 'invoiced', alle mit is_locked = false, also
-- inhaltlich weiterhin aenderbar — nach der Abrechnung.
--
-- Fix: Statusliste korrigiert. Ab 'signed' sind die abrechnungsrelevanten
-- Felder unveraenderlich; der Weg zurueck bleibt ueber 'korrektur' offen.
--
-- KEINE Datenaenderung. Rein rechteseitig + ein Trigger.
-- Rollback: 20260908000001_rollback_rls_abrechnungsdaten_und_auditschutz.sql
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────
-- 1) Abrechnungsdaten: Lesen nur noch fuer internes Personal
-- ─────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS invoice_snapshots_select      ON public.invoice_snapshots;
CREATE POLICY invoice_snapshots_select ON public.invoice_snapshots
  FOR SELECT TO authenticated
  USING (public.is_admin() OR public.is_internal_staff());

DROP POLICY IF EXISTS invoice_line_snapshots_select ON public.invoice_line_snapshots;
CREATE POLICY invoice_line_snapshots_select ON public.invoice_line_snapshots
  FOR SELECT TO authenticated
  USING (public.is_admin() OR public.is_internal_staff());

DROP POLICY IF EXISTS invoice_corrections_select    ON public.invoice_corrections;
CREATE POLICY invoice_corrections_select ON public.invoice_corrections
  FOR SELECT TO authenticated
  USING (public.is_admin() OR public.is_internal_staff());

-- is_internal_staff() = admin, superadmin, pdl, buero. Bewusst nicht nur
-- is_admin(): die Ops-Audit-Ansicht (lib/analytics/opsAudit.ts, aufgerufen
-- aus /admin) laeuft mit dem User-JWT und wird auch von PDL und Buero
-- geoeffnet. Kunden und Engel bleiben aussen vor.
DROP POLICY IF EXISTS billing_audit_trail_select    ON public.billing_audit_trail;
CREATE POLICY billing_audit_trail_select ON public.billing_audit_trail
  FOR SELECT TO authenticated
  USING (public.is_admin() OR public.is_internal_staff());

DROP POLICY IF EXISTS billing_number_sequences_select ON public.billing_number_sequences;
CREATE POLICY billing_number_sequences_select ON public.billing_number_sequences
  FOR SELECT TO authenticated
  USING (public.is_admin() OR public.is_internal_staff());

-- billing_tariffs: internes Personal darf Preise sehen (Einsatzplanung,
-- Rechnungspruefung). Kunden und Engel nicht.
DROP POLICY IF EXISTS billing_tariffs_select        ON public.billing_tariffs;
CREATE POLICY billing_tariffs_select ON public.billing_tariffs
  FOR SELECT TO authenticated
  USING (public.is_admin() OR public.is_internal_staff());

-- ─────────────────────────────────────────────────────────────────────
-- 2) Audit-Trails: nicht mehr von beliebigen Nutzern beschreibbar
-- ─────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS billing_audit_trail_insert ON public.billing_audit_trail;
CREATE POLICY billing_audit_trail_insert ON public.billing_audit_trail
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS as_audit_insert ON public.assignment_audit_log;
CREATE POLICY as_audit_insert ON public.assignment_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS sr_audit_insert ON public.service_record_audit_log;
CREATE POLICY sr_audit_insert ON public.service_record_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

-- ─────────────────────────────────────────────────────────────────────
-- 4) Leistungsnachweis nach Freigabe unveraenderlich
-- ─────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.prevent_finalized_service_record_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Ab 'signed' ist der Nachweis unterschrieben, ab 'invoiced' abgerechnet.
  -- Der frueher gepruefte Status 'freigegeben' existiert in dieser Leiter
  -- nicht (draft → incomplete → complete → signed → invoiced, siehe
  -- service_records_status_check), der Trigger lief deshalb immer ins Leere.
  IF OLD.status NOT IN ('signed', 'invoiced') THEN
    RETURN NEW;
  END IF;

  -- Der Rueckweg ist die Stornierung, nicht die stille Aenderung:
  -- proof_status = 'STORNIERT' bleibt erlaubt (prevent_locked_record_change
  -- behaelt dafuer die Admin-Pruefung). Der frueher hier stehende Ausweg
  -- "NEW.status = 'korrektur'" war wirkungslos — 'korrektur' ist per
  -- CHECK-Constraint gar kein zulaessiger Wert von service_records.status.
  IF NEW.proof_status = 'STORNIERT' AND OLD.proof_status IS DISTINCT FROM 'STORNIERT' THEN
    RETURN NEW;
  END IF;

  IF (
    NEW.client_id        IS DISTINCT FROM OLD.client_id        OR
    NEW.caregiver_id     IS DISTINCT FROM OLD.caregiver_id     OR
    NEW.date             IS DISTINCT FROM OLD.date             OR
    NEW.start_time       IS DISTINCT FROM OLD.start_time       OR
    NEW.end_time         IS DISTINCT FROM OLD.end_time         OR
    NEW.amount           IS DISTINCT FROM OLD.amount           OR
    NEW.budget_type      IS DISTINCT FROM OLD.budget_type      OR
    NEW.organization_id  IS DISTINCT FROM OLD.organization_id
  ) THEN
    RAISE EXCEPTION
      'Leistungsnachweis im Status "%" ist unveraenderlich. Korrektur nur '
      'ueber Stornierung (proof_status = ''STORNIERT'') und Neuerfassung.',
      OLD.status;
  END IF;

  -- Statusruecknahme (z.B. invoiced → signed) ebenfalls unterbinden.
  IF OLD.status = 'invoiced' AND NEW.status IS DISTINCT FROM 'invoiced' THEN
    RAISE EXCEPTION
      'Abgerechneter Leistungsnachweis kann nicht in den Status "%" '
      'zurueckgesetzt werden.', NEW.status;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.prevent_finalized_service_record_mutation() IS
  'BEFORE UPDATE auf service_records: sperrt abrechnungsrelevante Felder ab '
  'Status signed/invoiced. Vorher wurde der nicht existierende Status '
  '''freigegeben'' geprueft, der Trigger war dadurch wirkungslos.';
