-- ════════════════════════════════════════════════════════════════════════════
-- Migration: Atomare Billing-RPCs nachziehen (M-1 aus dem Abschlussbericht)
-- Datum:     2026-08-14
--
-- BEFUND (live per PostgREST mit service_role verifiziert, 14.08.2026):
--   POST /rest/v1/rpc/validate_correction_atomic → PGRST202
--     "Could not find the function public.validate_correction_atomic
--      (p_invoice_id, p_org_id) in the schema cache"
--   POST /rest/v1/rpc/create_credit_note_atomic  → PGRST202 (dito)
--
--   Es fehlt nicht eine der beiden Funktionen, sondern die gesamte Migration
--   20260831010000_abgeschrieben_credit_cas.sql ist nie auf Production
--   angewendet worden.
--
-- PRUEFUNG DER VORLAGE — sie war NICHT fehlerfrei:
--   validate_correction_atomic ist korrekt (FOR UPDATE auf der Originalrechnung,
--   SECURITY DEFINER mit gesetztem search_path, REVOKE gegen anon/authenticated).
--   create_credit_note_atomic dagegen enthielt
--       SELECT COALESCE(SUM(...), 0) INTO … FROM invoice_corrections … FOR UPDATE;
--   PostgreSQL lehnt das ab: "FOR UPDATE is not allowed with aggregate
--   functions" (SQLSTATE 0A000). Die Funktion waere bei JEDEM Aufruf
--   abgestuerzt — jede Gutschrift ueber den RPC-Weg. Unbemerkt geblieben ist
--   das nur, weil die Migration nie live war und der Aufrufer den Fehler
--   "Funktion nicht gefunden" als weiche Landung behandelt.
--   Hier korrigiert: erst PERFORM … FOR UPDATE (sperren), dann aggregieren.
--   Nachgewiesen in __tests__/migrations/mittel-fixes-2026-08-14-pglite.test.ts.
--
-- AUSWIRKUNG:
--   correctInvoice() (lib/billing/core/invoice-engine.ts) ruft die RPC auf und
--   behandelt "Funktion nicht gefunden" bewusst als weiche Landung, damit der
--   Korrekturweg ohne die Migration nicht komplett ausfaellt. Damit laeuft er
--   aber ohne die FOR-UPDATE-Sperre: zwei gleichzeitige Korrekturen bzw. eine
--   Korrektur parallel zu einem Storno auf derselben Rechnung sind nicht
--   serialisiert. Es bleibt der App-Layer-CAS (Statusvergleich nach dem
--   Insert mit Rollback) — der raeumt hinterher auf, verhindert das Rennen
--   aber nicht.
--   Dieselbe Luecke bei createCreditNote(): ohne create_credit_note_atomic
--   kann die Summenpruefung "Gutschrift <= Restbetrag" von zwei parallelen
--   Laeufen gleichzeitig bestanden werden.
--
-- FIX:
--   Diese Migration zieht den Inhalt von 20260831010000 idempotent nach.
--   Alles darin ist CREATE OR REPLACE bzw. DROP-CONSTRAINT-IF-EXISTS —
--   sie ist deshalb auch dann gefahrlos anwendbar, wenn Teile doch schon
--   live sein sollten.
--
--   Bewusst NICHT nur die eine RPC: der invoices_status_check und
--   validate_invoice_status_transition() aus derselben Migration fehlen
--   ebenfalls. Ohne sie ist 'abgeschrieben' gar kein zulaessiger Status —
--   und dann laeuft die Statuspruefung IN validate_correction_atomic
--   ("Rechnung im Status abgeschrieben — Korrektur nicht moeglich") ins Leere.
--   Die Teile gehoeren zusammen.
--
--   KEINE Datenaenderung. Nur Funktionen und ein Check-Constraint.
--   Live-Bestand am 14.08.2026: 5 Rechnungen mit status sent/disputed/paid —
--   alle drei sind im Constraint enthalten, das ADD CONSTRAINT kann nicht
--   an Bestandsdaten scheitern.
--
-- Rollback: 20260910000001_rollback_nachziehen_atomare_billing_rpcs.sql
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- 1) 'abgeschrieben' als zulaessiger Rechnungsstatus
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_status_check CHECK (
  status IN (
    'draft', 'sent', 'paid', 'partial', 'rejected', 'disputed',
    'entwurf', 'geprueft', 'freigegeben', 'uebermittelt',
    'quittiert', 'abgelehnt', 'bezahlt', 'teilweise_bezahlt',
    'gekuerzt', 'korrektur_erforderlich', 'erneut_eingereicht',
    'akzeptiert', 'storniert', 'strittig',
    'abgeschrieben'
  )
);

-- ─────────────────────────────────────────────────────────────────────
-- 2) Statusuebergaenge inkl. 'abgeschrieben'
-- ─────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.validate_invoice_status_transition()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.frozen_at IS NOT NULL AND (
    NEW.total_amount IS DISTINCT FROM OLD.total_amount OR
    NEW.client_id IS DISTINCT FROM OLD.client_id OR
    NEW.period_start IS DISTINCT FROM OLD.period_start OR
    NEW.period_end IS DISTINCT FROM OLD.period_end
  ) THEN
    RAISE EXCEPTION 'Festgeschriebene Rechnung darf inhaltlich nicht veraendert werden. Erstellen Sie eine Korrekturrechnung.';
  END IF;

  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  IF OLD.status IN ('bezahlt', 'storniert', 'akzeptiert', 'abgeschrieben') THEN
    RAISE EXCEPTION 'Rechnung im Status % kann nicht mehr geaendert werden', OLD.status;
  END IF;

  IF OLD.status = 'entwurf' AND NEW.status NOT IN ('geprueft', 'storniert') THEN
    RAISE EXCEPTION 'Ungueltiger Statusuebergang: % -> %', OLD.status, NEW.status;
  END IF;
  IF OLD.status = 'geprueft' AND NEW.status NOT IN ('freigegeben', 'entwurf', 'storniert') THEN
    RAISE EXCEPTION 'Ungueltiger Statusuebergang: % -> %', OLD.status, NEW.status;
  END IF;
  IF OLD.status = 'freigegeben' AND NEW.status NOT IN ('uebermittelt', 'storniert', 'abgeschrieben') THEN
    RAISE EXCEPTION 'Ungueltiger Statusuebergang: % -> %', OLD.status, NEW.status;
  END IF;
  IF OLD.status = 'uebermittelt' AND NEW.status NOT IN ('quittiert', 'abgelehnt', 'storniert', 'abgeschrieben') THEN
    RAISE EXCEPTION 'Ungueltiger Statusuebergang: % -> %', OLD.status, NEW.status;
  END IF;
  IF OLD.status = 'quittiert' AND NEW.status NOT IN ('bezahlt', 'teilweise_bezahlt', 'gekuerzt', 'strittig', 'storniert', 'abgeschrieben') THEN
    RAISE EXCEPTION 'Ungueltiger Statusuebergang: % -> %', OLD.status, NEW.status;
  END IF;
  IF OLD.status = 'teilweise_bezahlt' AND NEW.status NOT IN ('bezahlt', 'storniert', 'korrektur_erforderlich', 'strittig', 'abgeschrieben') THEN
    RAISE EXCEPTION 'Ungueltiger Statusuebergang: % -> %', OLD.status, NEW.status;
  END IF;
  IF OLD.status = 'gekuerzt' AND NEW.status NOT IN ('korrektur_erforderlich', 'akzeptiert', 'storniert', 'strittig', 'abgeschrieben') THEN
    RAISE EXCEPTION 'Ungueltiger Statusuebergang: % -> %', OLD.status, NEW.status;
  END IF;
  IF OLD.status = 'abgelehnt' AND NEW.status NOT IN ('erneut_eingereicht', 'storniert', 'abgeschrieben') THEN
    RAISE EXCEPTION 'Ungueltiger Statusuebergang: % -> %', OLD.status, NEW.status;
  END IF;
  IF OLD.status = 'korrektur_erforderlich' AND NEW.status NOT IN ('entwurf', 'storniert', 'abgeschrieben') THEN
    RAISE EXCEPTION 'Ungueltiger Statusuebergang: % -> %', OLD.status, NEW.status;
  END IF;
  IF OLD.status = 'strittig' AND NEW.status NOT IN ('gekuerzt', 'korrektur_erforderlich', 'abgelehnt', 'akzeptiert', 'bezahlt', 'storniert', 'abgeschrieben') THEN
    RAISE EXCEPTION 'Ungueltiger Statusuebergang: % -> %', OLD.status, NEW.status;
  END IF;
  IF OLD.status = 'erneut_eingereicht' AND NEW.status NOT IN ('uebermittelt', 'storniert', 'abgeschrieben') THEN
    RAISE EXCEPTION 'Ungueltiger Statusuebergang: % -> %', OLD.status, NEW.status;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────────────────────────────
-- 3) Atomare Gutschrift-Pruefung (FOR UPDATE auf der Originalrechnung)
-- ─────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_credit_note_atomic(
  p_invoice_id      UUID,
  p_amount_cents    INTEGER,
  p_reason          TEXT,
  p_actor_id        UUID,
  p_org_id          UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_original         RECORD;
  v_original_cents   INTEGER;
  v_already_credited INTEGER;
  v_remaining        INTEGER;
BEGIN
  -- Sperre die Originalrechnung (verhindert parallele Gutschriften)
  SELECT * INTO v_original
  FROM invoices
  WHERE id = p_invoice_id
    AND organization_id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rechnung nicht gefunden oder falsche Organisation.';
  END IF;

  IF v_original.status IN ('storniert', 'abgeschrieben') THEN
    RAISE EXCEPTION 'Rechnung im Status % — Gutschrift nicht moeglich.', v_original.status;
  END IF;

  v_original_cents := ROUND(v_original.total_amount * 100)::INTEGER;

  -- Bestehende Gutschriftzeilen sperren, DANN summieren.
  -- Beides in einer Anweisung (SELECT SUM(...) ... FOR UPDATE) ist in
  -- PostgreSQL nicht erlaubt: "FOR UPDATE is not allowed with aggregate
  -- functions" (SQLSTATE 0A000). Die Originalfassung in 20260831010000 hatte
  -- genau das — die Funktion waere bei JEDEM Aufruf abgestuerzt. Aufgefallen
  -- ist es nie, weil die Migration nie angewendet wurde und der Aufrufer den
  -- Fehler "Funktion nicht gefunden" abfaengt.
  PERFORM 1
  FROM invoice_corrections
  WHERE original_invoice_id = p_invoice_id
    AND correction_type = 'gutschrift'
    AND deleted_at IS NULL
  FOR UPDATE;

  SELECT COALESCE(SUM(v_original_cents - COALESCE(corrected_amount_cents, v_original_cents)), 0)
  INTO v_already_credited
  FROM invoice_corrections
  WHERE original_invoice_id = p_invoice_id
    AND correction_type = 'gutschrift'
    AND deleted_at IS NULL;

  v_remaining := v_original_cents - v_already_credited;

  IF p_amount_cents > v_remaining THEN
    RAISE EXCEPTION 'Gutschriftbetrag (% Cent) uebersteigt verfuegbaren Betrag (% Cent).', p_amount_cents, v_remaining;
  END IF;

  RETURN jsonb_build_object(
    'original_amount_cents', v_original_cents,
    'already_credited_cents', v_already_credited,
    'remaining_cents', v_remaining,
    'validated', TRUE
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_credit_note_atomic(UUID, INTEGER, TEXT, UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_credit_note_atomic(UUID, INTEGER, TEXT, UUID, UUID) FROM anon;
REVOKE ALL ON FUNCTION public.create_credit_note_atomic(UUID, INTEGER, TEXT, UUID, UUID) FROM authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- 4) Atomare Korrektur-Validierung (M-1, der eigentliche Befund)
-- ─────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.validate_correction_atomic(
  p_invoice_id      UUID,
  p_org_id          UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_original RECORD;
BEGIN
  SELECT * INTO v_original
  FROM invoices
  WHERE id = p_invoice_id
    AND organization_id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rechnung nicht gefunden oder falsche Organisation.';
  END IF;

  IF v_original.status IN ('storniert', 'abgeschrieben') THEN
    RAISE EXCEPTION 'Rechnung im Status % — Korrektur nicht moeglich.', v_original.status;
  END IF;

  RETURN jsonb_build_object(
    'status', v_original.status,
    'total_amount', v_original.total_amount,
    'validated', TRUE
  );
END;
$$;

REVOKE ALL ON FUNCTION public.validate_correction_atomic(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_correction_atomic(UUID, UUID) FROM anon;
REVOKE ALL ON FUNCTION public.validate_correction_atomic(UUID, UUID) FROM authenticated;

COMMENT ON FUNCTION public.validate_correction_atomic(UUID, UUID) IS
  'Sperrt die Originalrechnung mit FOR UPDATE und prueft, ob eine Korrektur '
  'zulaessig ist. Serialisiert parallele Korrektur-/Storno-Vorgaenge auf '
  'derselben Rechnung. Nur service_role.';

COMMIT;

-- ════════════════════════════════════════════════════════════════════
-- VERIFIKATION nach dem Apply (manuell, mit SERVICE-ROLE-Key):
--
--   curl -s -X POST "$URL/rest/v1/rpc/validate_correction_atomic" \
--     -H "apikey: $SERVICE_ROLE" -H "Authorization: Bearer $SERVICE_ROLE" \
--     -H "Content-Type: application/json" \
--     -d '{"p_invoice_id":"00000000-0000-0000-0000-000000000000",
--          "p_org_id":"00000000-0000-0000-0000-000000000000"}'
--   → erwartet: HTTP 400 mit "Rechnung nicht gefunden oder falsche
--     Organisation." (NICHT mehr PGRST202 "Could not find the function")
--
--   Dasselbe fuer create_credit_note_atomic mit den 5 Parametern.
--
--   Gegenprobe anon (muss scheitern):
--   curl -s -X POST ".../rpc/validate_correction_atomic" -H "apikey: $ANON" ...
--   → erwartet 404/403, nie ein Ergebnis.
-- ════════════════════════════════════════════════════════════════════
