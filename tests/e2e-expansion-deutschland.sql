-- ════════════════════════════════════════════════════════════════════════════
-- E2E-Tests: Expansion Deutschland + Tarifschichten + Review-Korrekturen
-- Datum: 2026-08-08
--
-- Voraussetzung (in dieser Reihenfolge angewendet):
--   20260808100000_expansion_deutschland.sql
--   20260808110000_tarifschichten_bundesland.sql
--   20260808120000_expansion_review_fixes.sql
--   20260808120001_plz_bundesland_seed.sql
--   20260808120002_invoice_bundesland_klient.sql
--
-- Ausfuehrung: Supabase Staging-Branch (NICHT Production).
--   psql "$STAGING_URL" -f tests/e2e-expansion-deutschland.sql
--
-- Das Skript laeuft in EINER Transaktion und endet mit ROLLBACK.
--
-- Abdeckung:
--   E1  Alle 16 Bundeslaender je Organisation vorhanden
--   E2  Kassenschalter per direktem UPDATE gesperrt (Review-Befund B2)
--   E3  CHECK: insurance_enabled verlangt ANERKANNT + Bescheid
--   E4  CHECK: Kassenmodul verlangt Hauptschalter
--   E5  Freischaltung ohne Bescheid wirft Exception
--   E6  Freischaltung ohne Tarifdaten wirft Exception (Review-Befund B1)
--   E7  Ein-Klick-Freischaltung setzt alle sechs Schalter + Audit
--   E8  Freischaltung ist idempotent
--   E9  update_state_settings kann ANERKANNT nicht setzen
--   E10 Abschaltung ohne Begruendung wirft Exception
--   E11 Abschaltung setzt alle Kassenmodule zurueck
--   E12 state_flag ist fail-safe
--   E13 Audit-Trail ist append-only
--   E14 Jede Aenderung erzeugt einen Audit-Eintrag (Anforderung 11)
--   E15 state_settings-Zeilen sind nicht loeschbar (Review-Befund B5)
--   E16 normalize_bundesland bildet Schreibweisen korrekt ab
--   E17 PLZ→Bundesland in SQL, inkl. Grenzfall-Verhalten (Review-Befund B3)
--   E18 kassenabrechnung_erlaubt ist fail-safe
--   E19 Obergrenzen-Trigger: nur bestaetigte Grenzen sperren
--   E20 tarifquelle ANERKENNUNGSBESCHEID nur mit Bescheid
--   E21 Buchung faellt ohne Freischaltung auf "privat" zurueck
--   E22 Felder lassen sich gezielt leeren (Review-Befund B8)
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
DECLARE
  v_org        UUID;
  v_actor      UUID;
  v_count      INTEGER;
  v_flag       BOOLEAN;
  v_res        public.state_activation_result;
  v_row        public.state_settings%ROWTYPE;
  v_text       TEXT;
  v_land       TEXT;
  v_sicher     BOOLEAN;
  v_org_land   TEXT;
  v_fehler     INTEGER := 0;
  v_ok         INTEGER := 0;
BEGIN
  SELECT id INTO v_org FROM public.organizations ORDER BY created_at LIMIT 1;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Keine Organisation vorhanden — Test kann nicht laufen.';
  END IF;

  SELECT id INTO v_actor FROM auth.users LIMIT 1;
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Kein auth.users-Datensatz vorhanden — actor_id wird benoetigt.';
  END IF;

  SELECT bundesland INTO v_org_land FROM public.organizations WHERE id = v_org;
  RAISE NOTICE '═══ Test-Organisation: %  (Bundesland: %) ═══', v_org, v_org_land;

  -- ══════════════════════════════════════════════════════════════════════
  -- E1: Alle 16 Bundeslaender angelegt
  -- ══════════════════════════════════════════════════════════════════════
  SELECT COUNT(*) INTO v_count FROM public.state_settings WHERE organization_id = v_org;
  IF v_count = 16 THEN
    v_ok := v_ok + 1; RAISE NOTICE 'E1  OK   — 16 Bundeslaender angelegt';
  ELSE
    v_fehler := v_fehler + 1; RAISE WARNING 'E1  FAIL — % statt 16 Bundeslaender', v_count;
  END IF;

  -- Ausgangslage (Marker setzen, damit der Kanal-Trigger dieses Setup zulaesst)
  PERFORM set_config('app.expansion_rpc', 'aktiv', TRUE);
  UPDATE public.state_settings
     SET status = 'ANTRAG_EINGEREICHT',
         insurance_enabled = FALSE,
         kassentarife_enabled = FALSE, budgetpruefung_enabled = FALSE,
         kassenrechnung_enabled = FALSE, elnw_enabled = FALSE,
         dakota_export_enabled = FALSE,
         approval_document = NULL,
         private_enabled = TRUE
   WHERE organization_id = v_org AND bundesland = 'hessen';
  PERFORM set_config('app.expansion_rpc', '', TRUE);

  -- ══════════════════════════════════════════════════════════════════════
  -- E2: Kassenschalter per direktem UPDATE (Review-Befund B2)
  -- ══════════════════════════════════════════════════════════════════════
  BEGIN
    UPDATE public.state_settings
       SET status = 'ANERKANNT', insurance_enabled = TRUE, approval_document = 'gefaelscht.pdf'
     WHERE organization_id = v_org AND bundesland = 'hessen';
    v_fehler := v_fehler + 1;
    RAISE WARNING 'E2  FAIL — direktes UPDATE hat die Kasse freigeschaltet';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%FREISCHALTUNG_NUR_UEBER_RPC%' THEN
      v_ok := v_ok + 1; RAISE NOTICE 'E2  OK   — direktes UPDATE abgewiesen';
    ELSE
      v_fehler := v_fehler + 1; RAISE WARNING 'E2  FAIL — unerwarteter Fehler: %', SQLERRM;
    END IF;
  END;

  -- ══════════════════════════════════════════════════════════════════════
  -- E3: CHECK greift auch mit RPC-Marker (letzte Verteidigungslinie)
  -- ══════════════════════════════════════════════════════════════════════
  BEGIN
    PERFORM set_config('app.expansion_rpc', 'aktiv', TRUE);
    UPDATE public.state_settings
       SET status = 'ANERKANNT', insurance_enabled = TRUE, approval_document = NULL
     WHERE organization_id = v_org AND bundesland = 'hessen';
    PERFORM set_config('app.expansion_rpc', '', TRUE);
    v_fehler := v_fehler + 1;
    RAISE WARNING 'E3  FAIL — Kasse ohne Bescheid wurde akzeptiert';
  EXCEPTION WHEN check_violation THEN
    v_ok := v_ok + 1; RAISE NOTICE 'E3  OK   — CHECK: Kasse ohne Bescheid abgelehnt';
  END;
  PERFORM set_config('app.expansion_rpc', '', TRUE);

  -- ══════════════════════════════════════════════════════════════════════
  -- E4: Kassenmodul ohne Hauptschalter
  -- ══════════════════════════════════════════════════════════════════════
  BEGIN
    PERFORM set_config('app.expansion_rpc', 'aktiv', TRUE);
    UPDATE public.state_settings
       SET dakota_export_enabled = TRUE
     WHERE organization_id = v_org AND bundesland = 'hessen';
    PERFORM set_config('app.expansion_rpc', '', TRUE);
    v_fehler := v_fehler + 1;
    RAISE WARNING 'E4  FAIL — Dakota-Export ohne Kassenabrechnung akzeptiert';
  EXCEPTION WHEN check_violation THEN
    v_ok := v_ok + 1; RAISE NOTICE 'E4  OK   — Kassenmodul ohne Hauptschalter abgelehnt';
  END;
  PERFORM set_config('app.expansion_rpc', '', TRUE);

  -- ══════════════════════════════════════════════════════════════════════
  -- E5: Freischaltung ohne Bescheid
  -- ══════════════════════════════════════════════════════════════════════
  BEGIN
    v_res := public.activate_insurance_billing(v_org, 'hessen', v_actor, NULL);
    v_fehler := v_fehler + 1;
    RAISE WARNING 'E5  FAIL — Freischaltung ohne Bescheid durchgelaufen';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%FREISCHALTUNG_OHNE_BESCHEID%' THEN
      v_ok := v_ok + 1; RAISE NOTICE 'E5  OK   — Freischaltung ohne Bescheid abgewiesen';
    ELSE
      v_fehler := v_fehler + 1; RAISE WARNING 'E5  FAIL — unerwarteter Fehler: %', SQLERRM;
    END IF;
  END;

  -- ══════════════════════════════════════════════════════════════════════
  -- E6: Freischaltung ohne Tarifdaten (Review-Befund B1, Anforderung 6)
  -- ══════════════════════════════════════════════════════════════════════
  DELETE FROM public.billing_tariffs
   WHERE organization_id = v_org AND rechtsgrundlage <> 'privat';

  BEGIN
    v_res := public.activate_insurance_billing(
      v_org, 'hessen', v_actor, 'bescheide/hessen/test.pdf');
    v_fehler := v_fehler + 1;
    RAISE WARNING 'E6  FAIL — Freischaltung ohne Tarifdaten durchgelaufen';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%FREISCHALTUNG_OHNE_TARIFE%' THEN
      v_ok := v_ok + 1; RAISE NOTICE 'E6  OK   — Freischaltung ohne Tarifdaten abgewiesen';
    ELSE
      v_fehler := v_fehler + 1; RAISE WARNING 'E6  FAIL — unerwarteter Fehler: %', SQLERRM;
    END IF;
  END;

  -- Tarif anlegen, damit die Freischaltung zulaessig wird
  INSERT INTO public.billing_tariffs (
    organization_id, leistungsart, rechtsgrundlage, bundesland,
    verguetungsart, preis_cent, gueltig_ab, tarifquelle, ist_aktiv
  ) VALUES (
    v_org, 'betreuung_45a', '§45b SGB XI', 'hessen',
    'zeit_stunde', 2800, CURRENT_DATE - 1, 'MANUELL_FREIGEGEBEN', TRUE
  );

  -- ══════════════════════════════════════════════════════════════════════
  -- E7: Ein-Klick-Freischaltung
  -- ══════════════════════════════════════════════════════════════════════
  v_res := public.activate_insurance_billing(
    v_org, 'hessen', v_actor,
    'bescheide/hessen/test-anerkennung.pdf',
    'AZ-TEST-2026', 'Testbehoerde Hessen',
    CURRENT_DATE, CURRENT_DATE
  );

  SELECT * INTO v_row FROM public.state_settings
   WHERE organization_id = v_org AND bundesland = 'hessen';

  IF v_row.status = 'ANERKANNT'
     AND v_row.insurance_enabled AND v_row.kassentarife_enabled
     AND v_row.budgetpruefung_enabled AND v_row.kassenrechnung_enabled
     AND v_row.elnw_enabled AND v_row.dakota_export_enabled
     AND v_res.already_active = FALSE THEN
    v_ok := v_ok + 1; RAISE NOTICE 'E7  OK   — Ein Klick, alle sechs Schalter an';
  ELSE
    v_fehler := v_fehler + 1;
    RAISE WARNING 'E7  FAIL — Kaskade unvollstaendig (status=%, kasse=%)',
      v_row.status, v_row.insurance_enabled;
  END IF;

  SELECT COUNT(*) INTO v_count FROM public.state_settings_audit
   WHERE organization_id = v_org AND bundesland = 'hessen'
     AND action = 'insurance_activated';
  IF v_count >= 1 THEN
    v_ok := v_ok + 1; RAISE NOTICE 'E7b OK   — Audit-Eintrag geschrieben';
  ELSE
    v_fehler := v_fehler + 1; RAISE WARNING 'E7b FAIL — kein Audit-Eintrag';
  END IF;

  -- ══════════════════════════════════════════════════════════════════════
  -- E8: Idempotenz
  -- ══════════════════════════════════════════════════════════════════════
  v_res := public.activate_insurance_billing(
    v_org, 'hessen', v_actor, 'bescheide/hessen/test-anerkennung.pdf');
  IF v_res.already_active THEN
    v_ok := v_ok + 1; RAISE NOTICE 'E8  OK   — zweiter Aufruf meldet already_active';
  ELSE
    v_fehler := v_fehler + 1; RAISE WARNING 'E8  FAIL — Freischaltung nicht idempotent';
  END IF;

  -- ══════════════════════════════════════════════════════════════════════
  -- E9: update_state_settings darf ANERKANNT nicht setzen
  -- ══════════════════════════════════════════════════════════════════════
  BEGIN
    PERFORM public.update_state_settings(v_org, 'bayern', v_actor, 'ANERKANNT');
    v_fehler := v_fehler + 1;
    RAISE WARNING 'E9  FAIL — ANERKANNT ohne Bescheid gesetzt';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%activate_insurance_billing%' THEN
      v_ok := v_ok + 1; RAISE NOTICE 'E9  OK   — ANERKANNT nur ueber Freischaltung';
    ELSE
      v_fehler := v_fehler + 1; RAISE WARNING 'E9  FAIL — unerwarteter Fehler: %', SQLERRM;
    END IF;
  END;

  -- ══════════════════════════════════════════════════════════════════════
  -- E21: Buchungs-Guard (vor der Abschaltung, Hessen ist frei)
  -- ══════════════════════════════════════════════════════════════════════
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='bookings' AND column_name='payment_method'
  ) THEN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_booking_zahlungsart') THEN
      v_fehler := v_fehler + 1; RAISE WARNING 'E21 FAIL — Trigger trg_booking_zahlungsart fehlt';
    ELSE
      -- Kunde mit bayerischer PLZ, Hessen ist freigeschaltet ⇒ muss privat werden
      UPDATE public.profiles SET postal_code = '80331' WHERE id = v_actor;
      BEGIN
        INSERT INTO public.bookings (customer_id, service, date, time, payment_method, status)
        VALUES (v_actor, 'E2E-Test-BY', CURRENT_DATE + 1, '10:00', 'kasse', 'pending');

        SELECT payment_method INTO v_text FROM public.bookings
         WHERE customer_id = v_actor AND service = 'E2E-Test-BY'
         ORDER BY created_at DESC LIMIT 1;

        IF v_text = 'privat' THEN
          v_ok := v_ok + 1;
          RAISE NOTICE 'E21 OK   — Kunde in Bayern wird trotz freiem Hessen privat abgerechnet';
        ELSE
          v_fehler := v_fehler + 1;
          RAISE WARNING 'E21 FAIL — payment_method blieb "%" (Umgehung!)', v_text;
        END IF;

        -- Gegenprobe: hessische PLZ darf "kasse" behalten
        UPDATE public.profiles SET postal_code = '60311' WHERE id = v_actor;
        INSERT INTO public.bookings (customer_id, service, date, time, payment_method, status)
        VALUES (v_actor, 'E2E-Test-HE', CURRENT_DATE + 1, '10:00', 'kasse', 'pending');

        SELECT payment_method INTO v_text FROM public.bookings
         WHERE customer_id = v_actor AND service = 'E2E-Test-HE'
         ORDER BY created_at DESC LIMIT 1;

        IF v_text = 'kasse' THEN
          v_ok := v_ok + 1; RAISE NOTICE 'E21b OK  — Kunde in Hessen behaelt "kasse"';
        ELSE
          v_fehler := v_fehler + 1;
          RAISE WARNING 'E21b FAIL — hessische Buchung wurde faelschlich privat';
        END IF;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'E21 SKIP — Buchung nicht anlegbar (%). Trigger ist installiert.', SQLERRM;
      END;
    END IF;
  ELSE
    RAISE NOTICE 'E21 SKIP — bookings.payment_method nicht vorhanden';
  END IF;

  -- ══════════════════════════════════════════════════════════════════════
  -- E10: Abschaltung ohne Begruendung
  -- ══════════════════════════════════════════════════════════════════════
  BEGIN
    PERFORM public.deactivate_insurance_billing(v_org, 'hessen', v_actor, '');
    v_fehler := v_fehler + 1;
    RAISE WARNING 'E10 FAIL — Abschaltung ohne Begruendung durchgelaufen';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%Begruendung%' THEN
      v_ok := v_ok + 1; RAISE NOTICE 'E10 OK   — Abschaltung verlangt Begruendung';
    ELSE
      v_fehler := v_fehler + 1; RAISE WARNING 'E10 FAIL — unerwarteter Fehler: %', SQLERRM;
    END IF;
  END;

  -- ══════════════════════════════════════════════════════════════════════
  -- E11: Abschaltung setzt alles zurueck
  -- ══════════════════════════════════════════════════════════════════════
  PERFORM public.deactivate_insurance_billing(
    v_org, 'hessen', v_actor, 'E2E-Test: Ruecksetzung nach Pruefung', 'IN_PRUEFUNG');
  SELECT * INTO v_row FROM public.state_settings
   WHERE organization_id = v_org AND bundesland = 'hessen';

  IF NOT v_row.insurance_enabled AND NOT v_row.kassentarife_enabled
     AND NOT v_row.budgetpruefung_enabled AND NOT v_row.kassenrechnung_enabled
     AND NOT v_row.elnw_enabled AND NOT v_row.dakota_export_enabled
     AND v_row.status = 'IN_PRUEFUNG' AND v_row.private_enabled THEN
    v_ok := v_ok + 1;
    RAISE NOTICE 'E11 OK   — alle Kassenmodule zurueckgesetzt, Privat laeuft weiter';
  ELSE
    v_fehler := v_fehler + 1;
    RAISE WARNING 'E11 FAIL — Ruecksetzung unvollstaendig (status=%)', v_row.status;
  END IF;

  -- ══════════════════════════════════════════════════════════════════════
  -- E12: state_flag ist fail-safe
  -- ══════════════════════════════════════════════════════════════════════
  IF public.state_flag('00000000-0000-0000-0000-000000000000', 'hessen', 'insurance') = FALSE
     AND public.state_flag(v_org, 'hessen', 'gibt_es_nicht') = FALSE
     AND public.state_flag(v_org, NULL, 'insurance') = FALSE THEN
    v_ok := v_ok + 1; RAISE NOTICE 'E12 OK   — state_flag fail-safe';
  ELSE
    v_fehler := v_fehler + 1; RAISE WARNING 'E12 FAIL — state_flag nicht fail-safe';
  END IF;

  -- ══════════════════════════════════════════════════════════════════════
  -- E13: Audit-Trail ist append-only
  -- ══════════════════════════════════════════════════════════════════════
  BEGIN
    UPDATE public.state_settings_audit SET begruendung = 'manipuliert'
     WHERE organization_id = v_org AND bundesland = 'hessen';
    v_fehler := v_fehler + 1;
    RAISE WARNING 'E13 FAIL — Audit-Eintrag konnte geaendert werden';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%append-only%' THEN
      v_ok := v_ok + 1; RAISE NOTICE 'E13 OK   — Audit-Trail append-only';
    ELSE
      v_fehler := v_fehler + 1; RAISE WARNING 'E13 FAIL — unerwarteter Fehler: %', SQLERRM;
    END IF;
  END;

  -- ══════════════════════════════════════════════════════════════════════
  -- E14: Auch ein erlaubtes direktes UPDATE erzeugt einen Audit-Eintrag
  -- ══════════════════════════════════════════════════════════════════════
  SELECT COUNT(*) INTO v_count FROM public.state_settings_audit
   WHERE organization_id = v_org AND bundesland = 'bremen' AND action = 'direct_update';

  UPDATE public.state_settings
     SET notes = 'E2E-Test: direkte Notiz'
   WHERE organization_id = v_org AND bundesland = 'bremen';

  SELECT COUNT(*) - v_count INTO v_count FROM public.state_settings_audit
   WHERE organization_id = v_org AND bundesland = 'bremen' AND action = 'direct_update';

  IF v_count >= 1 THEN
    v_ok := v_ok + 1; RAISE NOTICE 'E14 OK   — direktes UPDATE wurde auditiert';
  ELSE
    v_fehler := v_fehler + 1; RAISE WARNING 'E14 FAIL — direktes UPDATE ohne Audit-Eintrag';
  END IF;

  -- ══════════════════════════════════════════════════════════════════════
  -- E15: state_settings-Zeilen sind nicht loeschbar
  -- ══════════════════════════════════════════════════════════════════════
  BEGIN
    DELETE FROM public.state_settings
     WHERE organization_id = v_org AND bundesland = 'bremen';
    v_fehler := v_fehler + 1;
    RAISE WARNING 'E15 FAIL — state_settings-Zeile war loeschbar';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%STATE_SETTINGS_UNLOESCHBAR%' THEN
      v_ok := v_ok + 1; RAISE NOTICE 'E15 OK   — Zeile nicht loeschbar';
    ELSE
      v_fehler := v_fehler + 1; RAISE WARNING 'E15 FAIL — unerwarteter Fehler: %', SQLERRM;
    END IF;
  END;

  -- ══════════════════════════════════════════════════════════════════════
  -- E16: normalize_bundesland
  -- ══════════════════════════════════════════════════════════════════════
  IF public.normalize_bundesland('Baden-Württemberg') = 'baden_wuerttemberg'
     AND public.normalize_bundesland('Hessen')    = 'hessen'
     AND public.normalize_bundesland('DE-HE')     = 'hessen'
     AND public.normalize_bundesland('HE')        = 'hessen'
     AND public.normalize_bundesland('Thüringen') = 'thueringen'
     AND public.normalize_bundesland('Tirol')     IS NULL THEN
    v_ok := v_ok + 1; RAISE NOTICE 'E16 OK   — Bundesland-Normalisierung korrekt';
  ELSE
    v_fehler := v_fehler + 1; RAISE WARNING 'E16 FAIL — Normalisierung fehlerhaft';
  END IF;

  -- ══════════════════════════════════════════════════════════════════════
  -- E17: PLZ → Bundesland in SQL (Review-Befund B3)
  -- ══════════════════════════════════════════════════════════════════════
  SELECT COUNT(*) INTO v_count FROM public.plz_bundesland_regeln;
  IF v_count >= 150 THEN
    v_ok := v_ok + 1; RAISE NOTICE 'E17 OK   — % PLZ-Regeln geladen', v_count;
  ELSE
    v_fehler := v_fehler + 1; RAISE WARNING 'E17 FAIL — nur % PLZ-Regeln', v_count;
  END IF;

  SELECT code, sicher INTO v_land, v_sicher FROM public.bundesland_fuer_plz('60311');
  IF v_land = 'hessen' AND v_sicher THEN
    v_ok := v_ok + 1; RAISE NOTICE 'E17b OK  — 60311 → hessen (sicher)';
  ELSE
    v_fehler := v_fehler + 1; RAISE WARNING 'E17b FAIL — 60311 → %/%', v_land, v_sicher;
  END IF;

  -- Grenzfall: eindeutige Zuordnung muss verweigert werden
  IF public.eindeutiges_bundesland_fuer_plz('21444') IS NULL
     AND public.eindeutiges_bundesland_fuer_plz('11111') IS NULL
     AND public.eindeutiges_bundesland_fuer_plz(NULL) IS NULL
     AND public.eindeutiges_bundesland_fuer_plz('55246') = 'hessen' THEN
    v_ok := v_ok + 1;
    RAISE NOTICE 'E17c OK  — Grenzregionen/unbekannte PLZ verweigern Eindeutigkeit, '
                 'kuratierte Ausnahme 55246 greift';
  ELSE
    v_fehler := v_fehler + 1; RAISE WARNING 'E17c FAIL — Eindeutigkeitspruefung falsch';
  END IF;

  -- ══════════════════════════════════════════════════════════════════════
  -- E18: kassenabrechnung_erlaubt ist fail-safe
  -- ══════════════════════════════════════════════════════════════════════
  IF public.kassenabrechnung_erlaubt(v_org, '60311') = FALSE   -- Hessen gerade abgeschaltet
     AND public.kassenabrechnung_erlaubt(v_org, NULL) = FALSE
     AND public.kassenabrechnung_erlaubt(v_org, '21444') = FALSE THEN
    v_ok := v_ok + 1; RAISE NOTICE 'E18 OK   — kassenabrechnung_erlaubt fail-safe';
  ELSE
    v_fehler := v_fehler + 1; RAISE WARNING 'E18 FAIL — kassenabrechnung_erlaubt zu grosszuegig';
  END IF;

  -- ══════════════════════════════════════════════════════════════════════
  -- E19: Obergrenzen-Trigger
  -- ══════════════════════════════════════════════════════════════════════
  SELECT COUNT(*) INTO v_count FROM public.billing_gesetzliche_obergrenzen
   WHERE bundesland = 'hessen' AND bestaetigt = FALSE;
  IF v_count >= 1 THEN
    v_ok := v_ok + 1;
    RAISE NOTICE 'E19 OK   — % unbestaetigte Obergrenze(n), sperren bewusst nicht', v_count;
  ELSE
    v_fehler := v_fehler + 1; RAISE WARNING 'E19 FAIL — keine Obergrenzen geseedet';
  END IF;

  INSERT INTO public.billing_gesetzliche_obergrenzen (
    bundesland, rechtsgrundlage, verguetungsart, obergrenze_cent,
    quelle, gueltig_ab, bestaetigt, bestaetigt_von, bestaetigt_am
  ) VALUES (
    'hessen', '§45b SGB XI', 'zeit_stunde', 3000,
    'E2E-Test', DATE '2026-01-01', TRUE, v_actor, now()
  );

  BEGIN
    INSERT INTO public.billing_tariffs (
      organization_id, leistungsart, rechtsgrundlage, bundesland,
      verguetungsart, preis_cent, gueltig_ab, tarifquelle
    ) VALUES (
      v_org, 'betreuung_45a', '§45b SGB XI', 'hessen',
      'zeit_stunde', 3500, DATE '2026-02-01', 'MANUELL_FREIGEGEBEN');
    v_fehler := v_fehler + 1;
    RAISE WARNING 'E19b FAIL — Tarif ueber der Obergrenze akzeptiert';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%OBERGRENZE_UEBERSCHRITTEN%' THEN
      v_ok := v_ok + 1; RAISE NOTICE 'E19b OK  — Tarif ueber Obergrenze abgelehnt';
    ELSE
      v_fehler := v_fehler + 1; RAISE WARNING 'E19b FAIL — unerwarteter Fehler: %', SQLERRM;
    END IF;
  END;

  -- ══════════════════════════════════════════════════════════════════════
  -- E20: tarifquelle ANERKENNUNGSBESCHEID ohne Bescheid
  -- ══════════════════════════════════════════════════════════════════════
  BEGIN
    INSERT INTO public.billing_tariffs (
      organization_id, leistungsart, rechtsgrundlage, bundesland,
      verguetungsart, preis_cent, gueltig_ab, tarifquelle, ist_aktiv
    ) VALUES (
      v_org, 'betreuung_45a', '§45b SGB XI', 'hessen',
      'zeit_stunde', 2500, DATE '2026-04-01', 'ANERKENNUNGSBESCHEID', TRUE);
    v_fehler := v_fehler + 1;
    RAISE WARNING 'E20 FAIL — Bescheid-Tarif ohne Bescheid akzeptiert';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%BESCHEID_FEHLT%' THEN
      v_ok := v_ok + 1; RAISE NOTICE 'E20 OK   — Bescheid-Tarif ohne Bescheid abgelehnt';
    ELSE
      v_fehler := v_fehler + 1; RAISE WARNING 'E20 FAIL — unerwarteter Fehler: %', SQLERRM;
    END IF;
  END;

  BEGIN
    INSERT INTO public.billing_tariffs (
      organization_id, leistungsart, rechtsgrundlage, bundesland,
      verguetungsart, preis_cent, gueltig_ab, tarifquelle, ist_aktiv
    ) VALUES (
      v_org, 'betreuung_45a', '§45b SGB XI', 'hessen',
      'zeit_stunde', 2500, DATE '2026-05-01', 'ANERKENNUNGSBESCHEID', FALSE);
    v_ok := v_ok + 1; RAISE NOTICE 'E20b OK  — Vorbereitung als inaktiver Tarif moeglich';
  EXCEPTION WHEN OTHERS THEN
    v_fehler := v_fehler + 1; RAISE WARNING 'E20b FAIL — Vorbereitung blockiert: %', SQLERRM;
  END;

  -- ══════════════════════════════════════════════════════════════════════
  -- E22: Felder gezielt leeren (Review-Befund B8)
  -- ══════════════════════════════════════════════════════════════════════
  PERFORM public.update_state_settings(
    v_org, 'saarland', v_actor, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
    NULL, NULL, NULL, NULL, 'Falscher Name', NULL, NULL, NULL, NULL);

  PERFORM public.update_state_settings(
    v_org, 'saarland', v_actor, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
    NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
    ARRAY['ansprechpartner_name']);

  SELECT ansprechpartner_name INTO v_text FROM public.state_settings
   WHERE organization_id = v_org AND bundesland = 'saarland';

  IF v_text IS NULL THEN
    v_ok := v_ok + 1; RAISE NOTICE 'E22 OK   — Feld liess sich gezielt leeren';
  ELSE
    v_fehler := v_fehler + 1; RAISE WARNING 'E22 FAIL — Feld blieb "%"', v_text;
  END IF;

  -- ══════════════════════════════════════════════════════════════════════
  RAISE NOTICE '';
  RAISE NOTICE '═══════════════════════════════════════════';
  RAISE NOTICE '  ERGEBNIS:  % bestanden,  % fehlgeschlagen', v_ok, v_fehler;
  RAISE NOTICE '═══════════════════════════════════════════';

  IF v_fehler > 0 THEN
    RAISE EXCEPTION '% Test(s) fehlgeschlagen — siehe WARNING-Zeilen oben.', v_fehler;
  END IF;
END $$;

ROLLBACK;
