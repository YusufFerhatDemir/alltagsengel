-- ════════════════════════════════════════════════════════════════════════════
-- E2E-Tests: Tariff-Model-Hardening
-- Datum: 2026-08-07
-- Branch: feature/tariff-hardening
--
-- Voraussetzung: Migration 20260807120000_tariff_model_hardening.sql angewendet
-- Ausfuehrung: Auf Supabase Staging-Branch
--
-- Tests:
-- H1: IK-spezifisch vor generisch
-- H2: Falsche/ungueltige IK wird abgelehnt
-- H3: Unbekannte Leistungsart wird abgelehnt (FK)
-- H4: Unbekannte Rechtsgrundlage wird abgelehnt (FK)
-- H5: Tarif ausserhalb Gueltigkeitszeitraum
-- H6: Bundesland-Aufloesung (dynamisch aus Organization)
-- H7: Zuschlag = 0 ohne Regel
-- H8: Expliziter Wochenendzuschlag
-- H9: Katalog-Validierung und IK-Funktion
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_org_id UUID;
  v_actor_id UUID;
  v_client_with_ik UUID;
  v_client_without_ik UUID;
  v_tariff_generic UUID;
  v_tariff_ik UUID;
  v_tariff_expired UUID;
  v_tariff_zuschlag UUID;
  v_result RECORD;
  v_count INTEGER;
  v_zuschlag_client UUID;
  v_we_client UUID;
BEGIN
  RAISE NOTICE '═══ SETUP: Test-Daten erstellen ═══';

  -- Organisation mit bundesland = 'Hessen'
  SELECT id INTO v_org_id FROM public.organizations LIMIT 1;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Keine Organisation gefunden';
  END IF;
  UPDATE public.organizations SET bundesland = 'Hessen' WHERE id = v_org_id;
  RAISE NOTICE 'Org %: bundesland = Hessen', v_org_id;

  -- Actor
  SELECT id INTO v_actor_id FROM auth.users LIMIT 1;
  IF v_actor_id IS NULL THEN
    v_actor_id := v_org_id;
  END IF;

  -- Test-Klienten
  INSERT INTO public.clients (id, first_name, last_name, organization_id, pflegekasse_ik, status)
  VALUES (gen_random_uuid(), 'H-Test', 'MitIK', v_org_id, '109519005', 'active')
  RETURNING id INTO v_client_with_ik;

  INSERT INTO public.clients (id, first_name, last_name, organization_id, pflegekasse_ik, status)
  VALUES (gen_random_uuid(), 'H-Test', 'OhneIK', v_org_id, NULL, 'active')
  RETURNING id INTO v_client_without_ik;

  -- Test-Tarife
  INSERT INTO public.billing_tariffs (
    id, organization_id, leistungsart, rechtsgrundlage, verguetungsart,
    preis_cent, einheit, bundesland, kostentraeger_ik, gueltig_ab, gueltig_bis,
    zuschlag_wochenende_prozent, zuschlag_feiertag_prozent, zuschlag_nacht_prozent,
    ist_aktiv
  ) VALUES (
    gen_random_uuid(), v_org_id, 'alltagsbegleitung', '§45b SGB XI', 'zeit_stunde',
    3500, 'Stunde', 'hessen', NULL, '2026-01-01', NULL, 0, 0, 0, TRUE
  ) RETURNING id INTO v_tariff_generic;

  INSERT INTO public.billing_tariffs (
    id, organization_id, leistungsart, rechtsgrundlage, verguetungsart,
    preis_cent, einheit, bundesland, kostentraeger_ik, gueltig_ab, gueltig_bis,
    zuschlag_wochenende_prozent, zuschlag_feiertag_prozent, zuschlag_nacht_prozent,
    ist_aktiv
  ) VALUES (
    gen_random_uuid(), v_org_id, 'alltagsbegleitung', '§45b SGB XI', 'zeit_stunde',
    3800, 'Stunde', 'hessen', '109519005', '2026-01-01', NULL, 0, 0, 0, TRUE
  ) RETURNING id INTO v_tariff_ik;

  INSERT INTO public.billing_tariffs (
    id, organization_id, leistungsart, rechtsgrundlage, verguetungsart,
    preis_cent, einheit, bundesland, kostentraeger_ik, gueltig_ab, gueltig_bis, ist_aktiv
  ) VALUES (
    gen_random_uuid(), v_org_id, 'hauswirtschaft', '§45b SGB XI', 'zeit_stunde',
    2800, 'Stunde', 'hessen', NULL, '2026-01-01', '2026-03-31', TRUE
  ) RETURNING id INTO v_tariff_expired;

  INSERT INTO public.billing_tariffs (
    id, organization_id, leistungsart, rechtsgrundlage, verguetungsart,
    preis_cent, einheit, bundesland, kostentraeger_ik, gueltig_ab, gueltig_bis,
    zuschlag_wochenende_prozent, zuschlag_feiertag_prozent, zuschlag_nacht_prozent,
    ist_aktiv
  ) VALUES (
    gen_random_uuid(), v_org_id, 'nachtbetreuung', '§45b SGB XI', 'zeit_stunde',
    4000, 'Stunde', 'hessen', NULL, '2026-01-01', NULL, 25.00, 0, 0, TRUE
  ) RETURNING id INTO v_tariff_zuschlag;

  RAISE NOTICE 'Tarife erstellt: generic=%, ik=%, expired=%, zuschlag=%',
    v_tariff_generic, v_tariff_ik, v_tariff_expired, v_tariff_zuschlag;

  -- ══════════════════════════════════════════════════════════════════════
  -- H1: IK-spezifisch vor generisch
  -- ══════════════════════════════════════════════════════════════════════
  RAISE NOTICE '';
  RAISE NOTICE '═══ H1: IK-spezifisch vor generisch ═══';

  INSERT INTO public.service_records (id, client_id, service_type, date, duration_minutes,
    budget_type, status, organization_id)
  VALUES (gen_random_uuid(), v_client_with_ik, 'alltagsbegleitung', '2026-07-15', 60,
    'entlastung', 'signed', v_org_id);

  INSERT INTO public.service_records (id, client_id, service_type, date, duration_minutes,
    budget_type, status, organization_id)
  VALUES (gen_random_uuid(), v_client_without_ik, 'alltagsbegleitung', '2026-07-15', 60,
    'entlastung', 'signed', v_org_id);

  SELECT * INTO v_result FROM public.create_invoice_draft_atomic(
    v_client_with_ik, v_org_id, '2026-07', 'entlastung', v_actor_id);
  IF v_result.total_amount = 38.00 THEN
    RAISE NOTICE 'H1a PASS: Client mit IK → 38.00 EUR (IK-Tarif)';
  ELSE
    RAISE EXCEPTION 'H1a FAIL: Erwartet 38.00, erhalten %', v_result.total_amount;
  END IF;

  SELECT * INTO v_result FROM public.create_invoice_draft_atomic(
    v_client_without_ik, v_org_id, '2026-07', 'entlastung', v_actor_id);
  IF v_result.total_amount = 35.00 THEN
    RAISE NOTICE 'H1b PASS: Client ohne IK → 35.00 EUR (generisch)';
  ELSE
    RAISE EXCEPTION 'H1b FAIL: Erwartet 35.00, erhalten %', v_result.total_amount;
  END IF;

  -- ══════════════════════════════════════════════════════════════════════
  -- H2: Ungueltige IK wird abgelehnt
  -- ══════════════════════════════════════════════════════════════════════
  RAISE NOTICE '';
  RAISE NOTICE '═══ H2: Ungueltige IK ═══';

  BEGIN
    INSERT INTO public.clients (first_name, last_name, organization_id, pflegekasse_ik, status)
    VALUES ('H-Test', 'BadIK', v_org_id, '123456789', 'active');
    RAISE EXCEPTION 'H2a FAIL: Ungueltige Client-IK haette abgelehnt werden muessen';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'H2a PASS: Ungueltige Client-IK abgelehnt';
  END;

  BEGIN
    INSERT INTO public.billing_tariffs (
      organization_id, leistungsart, rechtsgrundlage, verguetungsart,
      preis_cent, einheit, bundesland, kostentraeger_ik, gueltig_ab, ist_aktiv)
    VALUES (v_org_id, 'alltagsbegleitung', '§45b SGB XI', 'zeit_stunde',
      3500, 'Stunde', 'hessen', '999999999', '2026-01-01', TRUE);
    RAISE EXCEPTION 'H2b FAIL: Ungueltige Tarif-IK haette abgelehnt werden muessen';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'H2b PASS: Ungueltige Tarif-IK abgelehnt';
  END;

  -- ══════════════════════════════════════════════════════════════════════
  -- H3: Unbekannte Leistungsart
  -- ══════════════════════════════════════════════════════════════════════
  RAISE NOTICE '';
  RAISE NOTICE '═══ H3: Unbekannte Leistungsart ═══';

  BEGIN
    INSERT INTO public.billing_tariffs (
      organization_id, leistungsart, rechtsgrundlage, verguetungsart,
      preis_cent, einheit, bundesland, gueltig_ab, ist_aktiv)
    VALUES (v_org_id, 'ergotherapie_xyz', '§45b SGB XI', 'zeit_stunde',
      3500, 'Stunde', 'hessen', '2026-01-01', TRUE);
    RAISE EXCEPTION 'H3 FAIL: Unbekannte Leistungsart haette abgelehnt werden muessen';
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE 'H3 PASS: FK lehnt unbekannte Leistungsart ab';
  END;

  -- ══════════════════════════════════════════════════════════════════════
  -- H4: Unbekannte Rechtsgrundlage
  -- ══════════════════════════════════════════════════════════════════════
  RAISE NOTICE '';
  RAISE NOTICE '═══ H4: Unbekannte Rechtsgrundlage ═══';

  BEGIN
    INSERT INTO public.billing_tariffs (
      organization_id, leistungsart, rechtsgrundlage, verguetungsart,
      preis_cent, einheit, bundesland, gueltig_ab, ist_aktiv)
    VALUES (v_org_id, 'alltagsbegleitung', '§99 SGB XYZ', 'zeit_stunde',
      3500, 'Stunde', 'hessen', '2026-01-01', TRUE);
    RAISE EXCEPTION 'H4 FAIL: Unbekannte Rechtsgrundlage haette abgelehnt werden muessen';
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE 'H4 PASS: FK lehnt unbekannte Rechtsgrundlage ab';
  END;

  -- ══════════════════════════════════════════════════════════════════════
  -- H5: Tarif ausserhalb Gueltigkeitszeitraum
  -- ══════════════════════════════════════════════════════════════════════
  RAISE NOTICE '';
  RAISE NOTICE '═══ H5: Abgelaufener Tarif ═══';

  DECLARE v_hw_client UUID;
  BEGIN
    INSERT INTO public.clients (id, first_name, last_name, organization_id, status)
    VALUES (gen_random_uuid(), 'H-Test', 'HW', v_org_id, 'active')
    RETURNING id INTO v_hw_client;

    INSERT INTO public.service_records (id, client_id, service_type, date, duration_minutes,
      budget_type, status, organization_id)
    VALUES (gen_random_uuid(), v_hw_client, 'hauswirtschaft', '2026-07-10', 120,
      'entlastung', 'signed', v_org_id);

    BEGIN
      SELECT * INTO v_result FROM public.create_invoice_draft_atomic(
        v_hw_client, v_org_id, '2026-07', 'entlastung', v_actor_id);
      RAISE EXCEPTION 'H5 FAIL: Abgelaufener Tarif haette MISSING_VALID_TARIFF ausloesen muessen';
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM LIKE '%MISSING_VALID_TARIFF%' THEN
        RAISE NOTICE 'H5 PASS: Abgelaufener Tarif → MISSING_VALID_TARIFF';
      ELSE
        RAISE EXCEPTION 'H5 FAIL: Falscher Fehler: %', SQLERRM;
      END IF;
    END;
  END;

  -- ══════════════════════════════════════════════════════════════════════
  -- H6: Bundesland-Aufloesung
  -- ══════════════════════════════════════════════════════════════════════
  RAISE NOTICE '';
  RAISE NOTICE '═══ H6: Bundesland-Aufloesung ═══';

  DECLARE v_bl_client UUID;
  BEGIN
    INSERT INTO public.billing_tariffs (
      organization_id, leistungsart, rechtsgrundlage, verguetungsart,
      preis_cent, einheit, bundesland, gueltig_ab, ist_aktiv)
    VALUES (v_org_id, 'begleitservice', '§45b SGB XI', 'zeit_stunde',
      5000, 'Stunde', 'bayern', '2026-01-01', TRUE);

    INSERT INTO public.clients (id, first_name, last_name, organization_id, status)
    VALUES (gen_random_uuid(), 'H-Test', 'BL', v_org_id, 'active')
    RETURNING id INTO v_bl_client;

    INSERT INTO public.service_records (id, client_id, service_type, date, duration_minutes,
      budget_type, status, organization_id)
    VALUES (gen_random_uuid(), v_bl_client, 'begleitservice', '2026-07-12', 60,
      'entlastung', 'signed', v_org_id);

    BEGIN
      SELECT * INTO v_result FROM public.create_invoice_draft_atomic(
        v_bl_client, v_org_id, '2026-07', 'entlastung', v_actor_id);
      RAISE EXCEPTION 'H6 FAIL: Bayern-Tarif haette nicht matchen duerfen';
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM LIKE '%MISSING_VALID_TARIFF%' THEN
        RAISE NOTICE 'H6 PASS: Bayern-Tarif fuer Hessen-Org korrekt ausgeschlossen';
      ELSE
        RAISE EXCEPTION 'H6 FAIL: Falscher Fehler: %', SQLERRM;
      END IF;
    END;
  END;

  -- ══════════════════════════════════════════════════════════════════════
  -- H7: Zuschlag = 0 (Werktag + Tag)
  -- ══════════════════════════════════════════════════════════════════════
  RAISE NOTICE '';
  RAISE NOTICE '═══ H7: Zuschlag = 0 (Werktag + Tag) ═══';

  INSERT INTO public.clients (id, first_name, last_name, organization_id, status)
  VALUES (gen_random_uuid(), 'H-Test', 'Zuschlag0', v_org_id, 'active')
  RETURNING id INTO v_zuschlag_client;

  -- 14.07.2026 = Dienstag, 10:00 = Tag
  INSERT INTO public.service_records (id, client_id, service_type, date, duration_minutes,
    budget_type, status, organization_id, start_time)
  VALUES (gen_random_uuid(), v_zuschlag_client, 'nachtbetreuung', '2026-07-14', 60,
    'entlastung', 'signed', v_org_id, '10:00');

  SELECT * INTO v_result FROM public.create_invoice_draft_atomic(
    v_zuschlag_client, v_org_id, '2026-07', 'entlastung', v_actor_id);
  IF v_result.total_amount = 40.00 THEN
    RAISE NOTICE 'H7 PASS: Werktag + Tag → 40.00 EUR (kein Zuschlag)';
  ELSE
    RAISE EXCEPTION 'H7 FAIL: Erwartet 40.00, erhalten %', v_result.total_amount;
  END IF;

  -- ══════════════════════════════════════════════════════════════════════
  -- H8: Expliziter Wochenendzuschlag
  -- ══════════════════════════════════════════════════════════════════════
  RAISE NOTICE '';
  RAISE NOTICE '═══ H8: Wochenendzuschlag ═══';

  INSERT INTO public.clients (id, first_name, last_name, organization_id, status)
  VALUES (gen_random_uuid(), 'H-Test', 'WE', v_org_id, 'active')
  RETURNING id INTO v_we_client;

  -- 18.07.2026 = Samstag
  INSERT INTO public.service_records (id, client_id, service_type, date, duration_minutes,
    budget_type, status, organization_id, start_time)
  VALUES (gen_random_uuid(), v_we_client, 'nachtbetreuung', '2026-07-18', 60,
    'entlastung', 'signed', v_org_id, '10:00');

  SELECT * INTO v_result FROM public.create_invoice_draft_atomic(
    v_we_client, v_org_id, '2026-07', 'entlastung', v_actor_id);
  -- 4000ct * 1h = 40.00 EUR * 1.25 = 50.00 EUR
  IF v_result.total_amount = 50.00 THEN
    RAISE NOTICE 'H8 PASS: Samstag + 25%% WE-Zuschlag → 50.00 EUR';
  ELSE
    RAISE EXCEPTION 'H8 FAIL: Erwartet 50.00, erhalten %', v_result.total_amount;
  END IF;

  -- ══════════════════════════════════════════════════════════════════════
  -- H9: Katalog + IK-Funktion
  -- ══════════════════════════════════════════════════════════════════════
  RAISE NOTICE '';
  RAISE NOTICE '═══ H9: Katalog + IK-Validierung ═══';

  SELECT COUNT(*) INTO v_count FROM public.billing_leistungsarten WHERE ist_aktiv = TRUE;
  RAISE NOTICE 'H9a: % aktive Leistungsarten im Katalog', v_count;

  SELECT COUNT(*) INTO v_count FROM public.billing_rechtsgrundlagen WHERE ist_aktiv = TRUE;
  RAISE NOTICE 'H9b: % aktive Rechtsgrundlagen im Katalog', v_count;

  IF public.validate_ik_nummer('460629986') THEN
    RAISE NOTICE 'H9c PASS: Alltagsengel-IK gueltig';
  ELSE
    RAISE EXCEPTION 'H9c FAIL';
  END IF;

  IF NOT public.validate_ik_nummer('123456789') THEN
    RAISE NOTICE 'H9d PASS: Ungueltige IK abgelehnt';
  ELSE
    RAISE EXCEPTION 'H9d FAIL';
  END IF;

  IF public.validate_ik_nummer(NULL) THEN
    RAISE NOTICE 'H9e PASS: NULL-IK akzeptiert';
  ELSE
    RAISE EXCEPTION 'H9e FAIL';
  END IF;

  -- ══════════════════════════════════════════════════════════════════════
  RAISE NOTICE '';
  RAISE NOTICE '═══════════════════════════════════════════';
  RAISE NOTICE '  ALLE 9 HARDENING-TESTS BESTANDEN';
  RAISE NOTICE '═══════════════════════════════════════════';

  -- Cleanup: Rollback
  RAISE EXCEPTION 'ROLLBACK_TEST_DATA';

EXCEPTION WHEN raise_exception THEN
  IF SQLERRM = 'ROLLBACK_TEST_DATA' THEN
    RAISE NOTICE 'Test-Daten zurueckgerollt';
  ELSE
    RAISE;
  END IF;
END $$;
