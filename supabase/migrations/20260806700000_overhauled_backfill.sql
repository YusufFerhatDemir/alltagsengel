-- ============================================================================
-- OVERHAULED Backfill: Legacy EN → DE Status-Migration
-- Branch: fix/pre-backfill-security
-- ============================================================================
--
-- VORBEDINGUNGEN:
--   - 20260806600000_audit_security.sql (Audit-Trail absichern) muss zuerst laufen
--   - 20260806600001_fix_finalized_edit.sql (Finalized-Edit-Schutz) muss zuerst laufen
--
-- SICHERHEITSMERKMALE:
--   1. Feste ID-Allowlist (5 bekannte Rechnungen)
--   2. Vollstaendig transaktional (DO $$ Block)
--   3. Count-Guard: Abbruch bei unerwarteter Anzahl
--   4. Checksum-Guard: Abbruch bei veraenderten fachlichen Feldern
--   5. Atomare Audit-Eintraege pro Rechnung
--   6. trg_invoices_no_finalized_edit temporaer DISABLED
--   7. trg_validate_invoice_status temporaer DISABLED
--   8. trg_audit_invoice_status bleibt ENABLED (Audit-Trail mitlaufen!)
--   9. Post-Verification Queries
--  10. Idempotent: WHERE status IN (englische Werte)
--
-- PRODUCTION CHECKSUMS (aus PRODUCTION_PREFLIGHT_FINAL_REPORT.md):
--   Non-status MD5: f7216a986e44e738a4ed810296df1f49
--   Items MD5:      aacb6cb502e1b55f09c5dda4a1c71305
-- ============================================================================

DO $$
DECLARE
  v_expected_count     CONSTANT INT := 5;
  v_expected_checksum  CONSTANT TEXT := 'f7216a986e44e738a4ed810296df1f49';
  v_expected_items_md5 CONSTANT TEXT := 'aacb6cb502e1b55f09c5dda4a1c71305';
  v_migration_id       CONSTANT TEXT := '20260806700000_overhauled_backfill';

  -- Feste ID-Allowlist
  v_id_1 CONSTANT UUID := 'abbb388d-69e7-4c60-90df-94d19e4c5c45'; -- RE-2026-0001: sent→uebermittelt
  v_id_2 CONSTANT UUID := 'be2de1e2-2558-4a80-93d3-aa4669a996e6'; -- RE-2026-0002: disputed→strittig
  v_id_3 CONSTANT UUID := 'a97f48cc-9c18-4084-8cab-2632ac593ae9'; -- RE-2026-0003: paid→bezahlt
  v_id_4 CONSTANT UUID := 'c292fd2d-bddc-473c-8e99-e573f7ad27d7'; -- RG-2026-TEST-001: sent→uebermittelt
  v_id_5 CONSTANT UUID := 'e16ea245-01b0-46a0-8d2f-5cd1edf7cb58'; -- RG-2026-TEST-002: sent→uebermittelt

  v_actual_count       INT;
  v_actual_checksum    TEXT;
  v_actual_items_md5   TEXT;
  v_updated_count      INT;
  v_post_checksum      TEXT;
  v_post_items_md5     TEXT;
  v_post_en_count      INT;

  -- Einzelne Rechnungs-Checksums fuer Audit
  v_row RECORD;
  v_row_checksum TEXT;
BEGIN
  -- ════════════════════════════════════════════════════════════════════════
  -- PRE-FLIGHT CHECKS
  -- ════════════════════════════════════════════════════════════════════════

  -- 1. Count-Guard: Genau 5 Rechnungen muessen existieren
  SELECT COUNT(*) INTO v_actual_count FROM public.invoices;
  IF v_actual_count != v_expected_count THEN
    RAISE EXCEPTION 'Count-Guard FAILED: Erwartet % Rechnungen, gefunden %. Backfill abgebrochen.',
      v_expected_count, v_actual_count;
  END IF;

  -- 2. Alle 5 IDs muessen in der Allowlist existieren
  SELECT COUNT(*) INTO v_actual_count
  FROM public.invoices
  WHERE id IN (v_id_1, v_id_2, v_id_3, v_id_4, v_id_5);
  IF v_actual_count != v_expected_count THEN
    RAISE EXCEPTION 'Allowlist-Guard FAILED: Nur % von % Allowlist-IDs gefunden. Backfill abgebrochen.',
      v_actual_count, v_expected_count;
  END IF;

  -- 3. Checksum-Guard: Fachliche Felder unveraendert
  SELECT md5(string_agg(
    id::text || '|' || COALESCE(invoice_number,'') || '|' ||
    COALESCE(total_amount::text,'') || '|' || COALESCE(budget_amount::text,'') || '|' ||
    COALESCE(private_amount::text,'') || '|' || COALESCE(paid_amount::text,'') || '|' ||
    COALESCE(period_start::text,'') || '|' || COALESCE(period_end::text,'') || '|' ||
    COALESCE(sent_at::text,'') || '|' || COALESCE(paid_at::text,'') || '|' ||
    COALESCE(soll_betrag_cent::text,'') || '|' || COALESCE(ist_betrag_cent::text,'') || '|' ||
    COALESCE(kuerzung_cent::text,'') || '|' || COALESCE(version::text,'') || '|' ||
    COALESCE(frozen_at::text,'') || '|' || COALESCE(transmission_status,''),
    E'\n' ORDER BY id
  )) INTO v_actual_checksum FROM public.invoices;

  IF v_actual_checksum != v_expected_checksum THEN
    RAISE EXCEPTION 'Checksum-Guard FAILED: Erwartet %, gefunden %. Fachliche Daten wurden veraendert. Backfill abgebrochen.',
      v_expected_checksum, v_actual_checksum;
  END IF;

  -- 4. Items-Checksum-Guard
  SELECT md5(string_agg(
    id::text || '|' || invoice_id::text || '|' || COALESCE(amount::text,'') || '|' || COALESCE(description,''),
    E'\n' ORDER BY id
  )) INTO v_actual_items_md5 FROM public.invoice_items;

  IF v_actual_items_md5 != v_expected_items_md5 THEN
    RAISE EXCEPTION 'Items-Checksum-Guard FAILED: Erwartet %, gefunden %. Invoice-Items wurden veraendert. Backfill abgebrochen.',
      v_expected_items_md5, v_actual_items_md5;
  END IF;

  -- 5. Idempotenz-Check: Wie viele haben noch englische Status?
  SELECT COUNT(*) INTO v_actual_count
  FROM public.invoices
  WHERE id IN (v_id_1, v_id_2, v_id_3, v_id_4, v_id_5)
    AND status IN ('sent', 'paid', 'disputed', 'draft', 'partial', 'rejected');

  IF v_actual_count = 0 THEN
    RAISE NOTICE 'Idempotenz: Alle Rechnungen haben bereits deutsche Status. Backfill uebersprungen.';
    RETURN;
  END IF;

  -- ════════════════════════════════════════════════════════════════════════
  -- TRIGGER-MANAGEMENT
  -- ════════════════════════════════════════════════════════════════════════

  -- trg_invoices_no_finalized_edit DISABLE (Status-Aenderung bei festgeschriebenen Rechnungen)
  ALTER TABLE public.invoices DISABLE TRIGGER trg_invoices_no_finalized_edit;

  -- trg_validate_invoice_status DISABLE (EN→DE ist kein gueltiger Transition)
  -- Nur disablen wenn er existiert
  BEGIN
    ALTER TABLE public.invoices DISABLE TRIGGER trg_validate_invoice_status;
  EXCEPTION WHEN undefined_object THEN
    -- Trigger existiert nicht — kein Problem
    NULL;
  END;

  -- trg_audit_invoice_status bleibt ENABLED! (soll mitlaufen)

  -- ════════════════════════════════════════════════════════════════════════
  -- BACKFILL: Audit-Eintraege + Status-Update pro Rechnung
  -- ════════════════════════════════════════════════════════════════════════

  -- Pro Rechnung: Checksum berechnen, Audit-Eintrag, Status-Update
  FOR v_row IN
    SELECT id, invoice_number, status, total_amount, organization_id
    FROM public.invoices
    WHERE id IN (v_id_1, v_id_2, v_id_3, v_id_4, v_id_5)
      AND status IN ('sent', 'paid', 'disputed', 'draft', 'partial', 'rejected')
    ORDER BY id
  LOOP
    -- Checksum der fachlichen Felder (identisch zur Audit-Trigger-Logik)
    SELECT md5(
      COALESCE(i.id::text, '') || '|' ||
      COALESCE(i.invoice_number, '') || '|' ||
      COALESCE(i.total_amount::text, '') || '|' ||
      COALESCE(i.budget_amount::text, '') || '|' ||
      COALESCE(i.private_amount::text, '') || '|' ||
      COALESCE(i.period_start::text, '') || '|' ||
      COALESCE(i.period_end::text, '') || '|' ||
      COALESCE(i.client_id::text, '') || '|' ||
      COALESCE(i.organization_id::text, '') || '|' ||
      COALESCE(i.soll_betrag_cent::text, '') || '|' ||
      COALESCE(i.ist_betrag_cent::text, '') || '|' ||
      COALESCE(i.kuerzung_cent::text, '')
    ) INTO v_row_checksum
    FROM public.invoices i WHERE i.id = v_row.id;

    -- Manueller Audit-Eintrag (zusaetzlich zum Trigger)
    INSERT INTO public.billing_audit_trail (
      organization_id, entity_type, entity_id, action,
      previous_state, new_state, reason,
      actor_id, actor_role,
      migration_id, checksum_before, checksum_after
    ) VALUES (
      v_row.organization_id,
      'invoice',
      v_row.id,
      'status_change',
      jsonb_build_object(
        'status', v_row.status,
        'invoice_number', v_row.invoice_number,
        'total_amount', v_row.total_amount
      ),
      jsonb_build_object(
        'status', CASE v_row.status
          WHEN 'sent' THEN 'uebermittelt'
          WHEN 'paid' THEN 'bezahlt'
          WHEN 'disputed' THEN 'strittig'
          WHEN 'draft' THEN 'entwurf'
          WHEN 'partial' THEN 'teilweise_bezahlt'
          WHEN 'rejected' THEN 'abgelehnt'
        END,
        'invoice_number', v_row.invoice_number,
        'total_amount', v_row.total_amount
      ),
      'legacy_en_de_status_backfill',
      NULL, -- actor_id: Migration hat keinen auth-Kontext
      'service_role',
      v_migration_id,
      v_row_checksum,
      v_row_checksum -- before = after, da sich NUR Status aendert
    );
  END LOOP;

  -- Status-Updates (einzeln fuer Klarheit und Audit-Trail-Korrelation)
  UPDATE public.invoices SET status = 'uebermittelt' WHERE id = v_id_1 AND status = 'sent';
  UPDATE public.invoices SET status = 'strittig'     WHERE id = v_id_2 AND status = 'disputed';
  UPDATE public.invoices SET status = 'bezahlt'      WHERE id = v_id_3 AND status = 'paid';
  UPDATE public.invoices SET status = 'uebermittelt' WHERE id = v_id_4 AND status = 'sent';
  UPDATE public.invoices SET status = 'uebermittelt' WHERE id = v_id_5 AND status = 'sent';

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  -- Letztes UPDATE zaehlt nur 1; wir pruefen stattdessen die Gesamtzahl unten

  -- ════════════════════════════════════════════════════════════════════════
  -- TRIGGER WIEDERHERSTELLEN
  -- ════════════════════════════════════════════════════════════════════════

  ALTER TABLE public.invoices ENABLE TRIGGER trg_invoices_no_finalized_edit;

  BEGIN
    ALTER TABLE public.invoices ENABLE TRIGGER trg_validate_invoice_status;
  EXCEPTION WHEN undefined_object THEN
    NULL;
  END;

  -- ════════════════════════════════════════════════════════════════════════
  -- POST-VERIFICATION
  -- ════════════════════════════════════════════════════════════════════════

  -- V1: Keine englischen Status mehr
  SELECT COUNT(*) INTO v_post_en_count
  FROM public.invoices
  WHERE status IN ('draft', 'sent', 'paid', 'partial', 'rejected', 'disputed');
  IF v_post_en_count != 0 THEN
    RAISE EXCEPTION 'Post-Verification FAILED: Noch % Rechnungen mit englischem Status.',
      v_post_en_count;
  END IF;

  -- V2: Gesamtzahl unveraendert
  SELECT COUNT(*) INTO v_actual_count FROM public.invoices;
  IF v_actual_count != v_expected_count THEN
    RAISE EXCEPTION 'Post-Verification FAILED: Rechnungsanzahl veraendert (erwartet %, gefunden %).',
      v_expected_count, v_actual_count;
  END IF;

  -- V3: Fachliche Checksum unveraendert (Status ist NICHT in Checksum)
  SELECT md5(string_agg(
    id::text || '|' || COALESCE(invoice_number,'') || '|' ||
    COALESCE(total_amount::text,'') || '|' || COALESCE(budget_amount::text,'') || '|' ||
    COALESCE(private_amount::text,'') || '|' || COALESCE(paid_amount::text,'') || '|' ||
    COALESCE(period_start::text,'') || '|' || COALESCE(period_end::text,'') || '|' ||
    COALESCE(sent_at::text,'') || '|' || COALESCE(paid_at::text,'') || '|' ||
    COALESCE(soll_betrag_cent::text,'') || '|' || COALESCE(ist_betrag_cent::text,'') || '|' ||
    COALESCE(kuerzung_cent::text,'') || '|' || COALESCE(version::text,'') || '|' ||
    COALESCE(frozen_at::text,'') || '|' || COALESCE(transmission_status,''),
    E'\n' ORDER BY id
  )) INTO v_post_checksum FROM public.invoices;

  IF v_post_checksum != v_expected_checksum THEN
    RAISE EXCEPTION 'Post-Verification FAILED: Fachliche Checksum veraendert (erwartet %, gefunden %).',
      v_expected_checksum, v_post_checksum;
  END IF;

  -- V4: Items-Checksum unveraendert
  SELECT md5(string_agg(
    id::text || '|' || invoice_id::text || '|' || COALESCE(amount::text,'') || '|' || COALESCE(description,''),
    E'\n' ORDER BY id
  )) INTO v_post_items_md5 FROM public.invoice_items;

  IF v_post_items_md5 != v_expected_items_md5 THEN
    RAISE EXCEPTION 'Post-Verification FAILED: Items-Checksum veraendert (erwartet %, gefunden %).',
      v_expected_items_md5, v_post_items_md5;
  END IF;

  -- V5: Erwartete Status-Verteilung
  -- uebermittelt: 3, strittig: 1, bezahlt: 1
  SELECT COUNT(*) INTO v_actual_count
  FROM public.invoices WHERE status = 'uebermittelt';
  IF v_actual_count != 3 THEN
    RAISE EXCEPTION 'Post-Verification FAILED: Erwartet 3x uebermittelt, gefunden %.',
      v_actual_count;
  END IF;

  SELECT COUNT(*) INTO v_actual_count
  FROM public.invoices WHERE status = 'strittig';
  IF v_actual_count != 1 THEN
    RAISE EXCEPTION 'Post-Verification FAILED: Erwartet 1x strittig, gefunden %.',
      v_actual_count;
  END IF;

  SELECT COUNT(*) INTO v_actual_count
  FROM public.invoices WHERE status = 'bezahlt';
  IF v_actual_count != 1 THEN
    RAISE EXCEPTION 'Post-Verification FAILED: Erwartet 1x bezahlt, gefunden %.',
      v_actual_count;
  END IF;

  RAISE NOTICE 'Backfill erfolgreich: 5 Rechnungen EN→DE migriert, Checksums verifiziert, Audit-Trail geschrieben.';
END $$;
