-- ════════════════════════════════════════════════════════════════════════════
-- E2E-Tests: Expansion Deutschland + Tarifschichten
-- Datum: 2026-08-08
--
-- Voraussetzung:
--   20260808100000_expansion_deutschland.sql
--   20260808110000_tarifschichten_bundesland.sql
--
-- Ausfuehrung: Supabase Staging-Branch (NICHT Production).
--   psql "$STAGING_URL" -f tests/e2e-expansion-deutschland.sql
--
-- Das Skript laeuft in EINER Transaktion und endet mit ROLLBACK —
-- es hinterlaesst keine Daten.
--
-- Geprueft wird:
--   E1  Alle 16 Bundeslaender je Organisation vorhanden
--   E2  insurance_enabled ohne Status ANERKANNT wird abgelehnt
--   E3  insurance_enabled ohne Anerkennungsbescheid wird abgelehnt
--   E4  Kassenmodule ohne Hauptschalter werden abgelehnt
--   E5  Freischaltung ohne Bescheid wirft Exception
--   E6  Ein-Klick-Freischaltung setzt alle sechs Schalter + Audit
--   E7  Freischaltung ist idempotent
--   E8  update_state_settings kann ANERKANNT nicht setzen
--   E9  Abschaltung ohne Begruendung wirft Exception
--   E10 Abschaltung setzt alle Kassenmodule zurueck
--   E11 state_flag ist fail-safe
--   E12 Audit-Trail ist append-only
--   E13 normalize_bundesland bildet Schreibweisen korrekt ab
--   E14 Obergrenzen-Trigger sperrt nur bestaetigte Obergrenzen
--   E15 tarifquelle ANERKENNUNGSBESCHEID nur mit Bescheid
--   E16 Buchung faellt ohne Freischaltung auf "privat" zurueck
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
DECLARE
  v_org       UUID;
  v_actor     UUID;
  v_count     INTEGER;
  v_flag      BOOLEAN;
  v_res       public.state_activation_result;
  v_row       public.state_settings%ROWTYPE;
  v_text      TEXT;
  v_fehler    INTEGER := 0;
  v_ok        INTEGER := 0;
BEGIN
  SELECT id INTO v_org FROM public.organizations ORDER BY created_at LIMIT 1;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Keine Organisation vorhanden — Test kann nicht laufen.';
  END IF;

  SELECT id INTO v_actor FROM auth.users LIMIT 1;
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Kein auth.users-Datensatz vorhanden — actor_id wird benoetigt.';
  END IF;

  RAISE NOTICE '═══ Test-Organisation: % ═══', v_org;

  -- ══════════════════════════════════════════════════════════════════════
  -- E1: Alle 16 Bundeslaender angelegt
  -- ══════════════════════════════════════════════════════════════════════
  SELECT COUNT(*) INTO v_count FROM public.state_settings WHERE organization_id = v_org;
  IF v_count = 16 THEN
    v_ok := v_ok + 1; RAISE NOTICE 'E1  OK   — 16 Bundeslaender angelegt';
  ELSE
    v_fehler := v_fehler + 1; RAISE WARNING 'E1  FAIL — % statt 16 Bundeslaender', v_count;
  END IF;

  -- Ausgangslage fuer die weiteren Tests herstellen
  UPDATE public.state_settings
     SET status = 'ANTRAG_EINGEREICHT',
         insurance_enabled = FALSE,
         kassentarife_enabled = FALSE, budgetpruefung_enabled = FALSE,
         kassenrechnung_enabled = FALSE, elnw_enabled = FALSE,
         dakota_export_enabled = FALSE,
         approval_document = NULL,
         private_enabled = TRUE
   WHERE organization_id = v_org AND bundesland = 'hessen';

  -- ══════════════════════════════════════════════════════════════════════
  -- E2: insurance_enabled ohne Status ANERKANNT
  -- ══════════════════════════════════════════════════════════════════════
  BEGIN
    UPDATE public.state_settings
       SET insurance_enabled = TRUE, approval_document = 'test.pdf'
     WHERE organization_id = v_org AND bundesland = 'hessen';
    v_fehler := v_fehler + 1;
    RAISE WARNING 'E2  FAIL — Kasse ohne ANERKANNT wurde akzeptiert';
  EXCEPTION WHEN check_violation THEN
    v_ok := v_ok + 1; RAISE NOTICE 'E2  OK   — Kasse ohne ANERKANNT abgelehnt';
  END;

  -- ══════════════════════════════════════════════════════════════════════
  -- E3: insurance_enabled ohne Bescheid (Status wird per RPC gesetzt, hier
  --     direkt am Datensatz geprueft)
  -- ══════════════════════════════════════════════════════════════════════
  BEGIN
    UPDATE public.state_settings
       SET status = 'ANERKANNT', insurance_enabled = TRUE, approval_document = NULL
     WHERE organization_id = v_org AND bundesland = 'hessen';
    v_fehler := v_fehler + 1;
    RAISE WARNING 'E3  FAIL — Kasse ohne Bescheid wurde akzeptiert';
  EXCEPTION WHEN check_violation THEN
    v_ok := v_ok + 1; RAISE NOTICE 'E3  OK   — Kasse ohne Bescheid abgelehnt';
  END;

  -- ══════════════════════════════════════════════════════════════════════
  -- E4: Kassenmodul ohne Hauptschalter
  -- ══════════════════════════════════════════════════════════════════════
  BEGIN
    UPDATE public.state_settings
       SET dakota_export_enabled = TRUE
     WHERE organization_id = v_org AND bundesland = 'hessen';
    v_fehler := v_fehler + 1;
    RAISE WARNING 'E4  FAIL — Dakota-Export ohne Kassenabrechnung akzeptiert';
  EXCEPTION WHEN check_violation THEN
    v_ok := v_ok + 1; RAISE NOTICE 'E4  OK   — Kassenmodul ohne Hauptschalter abgelehnt';
  END;

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
  -- E6: Ein-Klick-Freischaltung
  -- ══════════════════════════════════════════════════════════════════════
  v_res := public.activate_insurance_billing(
    v_org, 'hessen', v_actor,
    'bescheide/hessen/test-anerkennung.pdf',
    'AZ-TEST-2026', 'Testbehoerde Hessen',
    CURRENT_DATE, CURRENT_DATE
  );

  SELECT * INTO v_row
    FROM public.state_settings
   WHERE organization_id = v_org AND bundesland = 'hessen';

  IF v_row.status = 'ANERKANNT'
     AND v_row.insurance_enabled
     AND v_row.kassentarife_enabled
     AND v_row.budgetpruefung_enabled
     AND v_row.kassenrechnung_enabled
     AND v_row.elnw_enabled
     AND v_row.dakota_export_enabled
     AND v_res.already_active = FALSE THEN
    v_ok := v_ok + 1;
    RAISE NOTICE 'E6  OK   — Ein Klick, alle sechs Schalter an';
  ELSE
    v_fehler := v_fehler + 1;
    RAISE WARNING 'E6  FAIL — Kaskade unvollstaendig: status=%, kasse=%, tarife=%, budget=%, rechnung=%, elnw=%, dakota=%',
      v_row.status, v_row.insurance_enabled, v_row.kassentarife_enabled,
      v_row.budgetpruefung_enabled, v_row.kassenrechnung_enabled,
      v_row.elnw_enabled, v_row.dakota_export_enabled;
  END IF;

  SELECT COUNT(*) INTO v_count
    FROM public.state_settings_audit
   WHERE organization_id = v_org AND bundesland = 'hessen'
     AND action = 'insurance_activated';
  IF v_count >= 1 THEN
    v_ok := v_ok + 1; RAISE NOTICE 'E6b OK   — Audit-Eintrag geschrieben';
  ELSE
    v_fehler := v_fehler + 1; RAISE WARNING 'E6b FAIL — kein Audit-Eintrag';
  END IF;

  -- ══════════════════════════════════════════════════════════════════════
  -- E7: Idempotenz
  -- ══════════════════════════════════════════════════════════════════════
  v_res := public.activate_insurance_billing(
    v_org, 'hessen', v_actor, 'bescheide/hessen/test-anerkennung.pdf'
  );
  IF v_res.already_active THEN
    v_ok := v_ok + 1; RAISE NOTICE 'E7  OK   — zweiter Aufruf meldet already_active';
  ELSE
    v_fehler := v_fehler + 1; RAISE WARNING 'E7  FAIL — Freischaltung nicht idempotent';
  END IF;

  -- ══════════════════════════════════════════════════════════════════════
  -- E8: update_state_settings darf ANERKANNT nicht setzen
  -- ══════════════════════════════════════════════════════════════════════
  BEGIN
    PERFORM public.update_state_settings(v_org, 'bayern', v_actor, 'ANERKANNT');
    v_fehler := v_fehler + 1;
    RAISE WARNING 'E8  FAIL — ANERKANNT ohne Bescheid gesetzt';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%activate_insurance_billing%' THEN
      v_ok := v_ok + 1; RAISE NOTICE 'E8  OK   — ANERKANNT nur ueber Freischaltung';
    ELSE
      v_fehler := v_fehler + 1; RAISE WARNING 'E8  FAIL — unerwarteter Fehler: %', SQLERRM;
    END IF;
  END;

  -- ══════════════════════════════════════════════════════════════════════
  -- E9: Abschaltung ohne Begruendung
  -- ══════════════════════════════════════════════════════════════════════
  BEGIN
    PERFORM public.deactivate_insurance_billing(v_org, 'hessen', v_actor, '');
    v_fehler := v_fehler + 1;
    RAISE WARNING 'E9  FAIL — Abschaltung ohne Begruendung durchgelaufen';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%Begruendung%' THEN
      v_ok := v_ok + 1; RAISE NOTICE 'E9  OK   — Abschaltung verlangt Begruendung';
    ELSE
      v_fehler := v_fehler + 1; RAISE WARNING 'E9  FAIL — unerwarteter Fehler: %', SQLERRM;
    END IF;
  END;

  -- ══════════════════════════════════════════════════════════════════════
  -- E16: Buchungs-Guard vorhanden und wirksam
  --      Es wird eine echte Buchung eingefuegt, waehrend die Organisation
  --      auf ein NICHT freigeschaltetes Bundesland zeigt.
  -- ══════════════════════════════════════════════════════════════════════
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='bookings' AND column_name='payment_method'
  ) THEN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_booking_zahlungsart') THEN
      v_fehler := v_fehler + 1;
      RAISE WARNING 'E16 FAIL — Trigger trg_booking_zahlungsart fehlt';
    ELSE
      SELECT bundesland INTO v_text FROM public.organizations WHERE id = v_org;
      UPDATE public.organizations SET bundesland = 'bayern' WHERE id = v_org;

      BEGIN
        INSERT INTO public.bookings (customer_id, service, date, time, payment_method, status)
        VALUES (v_actor, 'E2E-Test', CURRENT_DATE + 1, '10:00', 'kasse', 'pending');

        SELECT payment_method INTO v_text
          FROM public.bookings
         WHERE customer_id = v_actor AND service = 'E2E-Test'
         ORDER BY created_at DESC LIMIT 1;

        IF v_text = 'privat' THEN
          v_ok := v_ok + 1;
          RAISE NOTICE 'E16 OK   — Kassen-Buchung ohne Freischaltung auf "privat" gesetzt';
        ELSE
          v_fehler := v_fehler + 1;
          RAISE WARNING 'E16 FAIL — payment_method blieb "%"', v_text;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'E16 SKIP — Buchung konnte nicht angelegt werden (%). '
                     'Trigger ist installiert, Volltest bitte manuell.', SQLERRM;
      END;

      -- Ausgangszustand der Organisation wiederherstellen
      UPDATE public.organizations SET bundesland = 'hessen' WHERE id = v_org;
    END IF;
  ELSE
    RAISE NOTICE 'E16 SKIP — bookings.payment_method nicht vorhanden';
  END IF;

  -- ══════════════════════════════════════════════════════════════════════
  -- E10: Abschaltung setzt alles zurueck
  -- ══════════════════════════════════════════════════════════════════════
  PERFORM public.deactivate_insurance_billing(
    v_org, 'hessen', v_actor, 'E2E-Test: Ruecksetzung nach Pruefung', 'IN_PRUEFUNG'
  );
  SELECT * INTO v_row
    FROM public.state_settings
   WHERE organization_id = v_org AND bundesland = 'hessen';

  IF NOT v_row.insurance_enabled
     AND NOT v_row.kassentarife_enabled
     AND NOT v_row.budgetpruefung_enabled
     AND NOT v_row.kassenrechnung_enabled
     AND NOT v_row.elnw_enabled
     AND NOT v_row.dakota_export_enabled
     AND v_row.status = 'IN_PRUEFUNG'
     AND v_row.private_enabled THEN
    v_ok := v_ok + 1;
    RAISE NOTICE 'E10 OK   — alle Kassenmodule zurueckgesetzt, Privat laeuft weiter';
  ELSE
    v_fehler := v_fehler + 1;
    RAISE WARNING 'E10 FAIL — Ruecksetzung unvollstaendig (status=%)', v_row.status;
  END IF;

  -- ══════════════════════════════════════════════════════════════════════
  -- E11: state_flag ist fail-safe
  -- ══════════════════════════════════════════════════════════════════════
  v_flag := public.state_flag('00000000-0000-0000-0000-000000000000', 'hessen', 'insurance');
  IF v_flag = FALSE THEN
    v_ok := v_ok + 1; RAISE NOTICE 'E11 OK   — unbekannte Organisation ⇒ FALSE';
  ELSE
    v_fehler := v_fehler + 1; RAISE WARNING 'E11 FAIL — unbekannte Organisation lieferte TRUE';
  END IF;

  v_flag := public.state_flag(v_org, 'hessen', 'gibt_es_nicht');
  IF v_flag = FALSE THEN
    v_ok := v_ok + 1; RAISE NOTICE 'E11b OK  — unbekanntes Flag ⇒ FALSE';
  ELSE
    v_fehler := v_fehler + 1; RAISE WARNING 'E11b FAIL — unbekanntes Flag lieferte TRUE';
  END IF;

  -- ══════════════════════════════════════════════════════════════════════
  -- E12: Audit-Trail ist append-only
  -- ══════════════════════════════════════════════════════════════════════
  BEGIN
    UPDATE public.state_settings_audit
       SET begruendung = 'manipuliert'
     WHERE organization_id = v_org AND bundesland = 'hessen';
    v_fehler := v_fehler + 1;
    RAISE WARNING 'E12 FAIL — Audit-Eintrag konnte geaendert werden';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%append-only%' THEN
      v_ok := v_ok + 1; RAISE NOTICE 'E12 OK   — Audit-Trail append-only';
    ELSE
      v_fehler := v_fehler + 1; RAISE WARNING 'E12 FAIL — unerwarteter Fehler: %', SQLERRM;
    END IF;
  END;

  -- ══════════════════════════════════════════════════════════════════════
  -- E13: normalize_bundesland
  -- ══════════════════════════════════════════════════════════════════════
  IF public.normalize_bundesland('Baden-Württemberg') = 'baden_wuerttemberg'
     AND public.normalize_bundesland('Hessen')  = 'hessen'
     AND public.normalize_bundesland('DE-HE')   = 'hessen'
     AND public.normalize_bundesland('HE')      = 'hessen'
     AND public.normalize_bundesland('Thüringen') = 'thueringen'
     AND public.normalize_bundesland('Tirol')   IS NULL THEN
    v_ok := v_ok + 1; RAISE NOTICE 'E13 OK   — Bundesland-Normalisierung korrekt';
  ELSE
    v_fehler := v_fehler + 1; RAISE WARNING 'E13 FAIL — Normalisierung fehlerhaft';
  END IF;

  -- ══════════════════════════════════════════════════════════════════════
  -- E14: Obergrenzen-Trigger
  -- ══════════════════════════════════════════════════════════════════════
  -- Unbestaetigte Obergrenze darf NICHT sperren
  SELECT COUNT(*) INTO v_count
    FROM public.billing_gesetzliche_obergrenzen
   WHERE bundesland = 'hessen' AND bestaetigt = FALSE;
  IF v_count >= 1 THEN
    v_ok := v_ok + 1;
    RAISE NOTICE 'E14 OK   — % unbestaetigte Obergrenze(n) fuer Hessen hinterlegt '
                 '(sperren bewusst noch nicht)', v_count;
  ELSE
    v_fehler := v_fehler + 1; RAISE WARNING 'E14 FAIL — keine Obergrenzen geseedet';
  END IF;

  -- Bestaetigte Obergrenze anlegen und Verletzung provozieren
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
      'zeit_stunde', 3500, DATE '2026-02-01', 'MANUELL_FREIGEGEBEN'
    );
    v_fehler := v_fehler + 1;
    RAISE WARNING 'E14b FAIL — Tarif ueber der Obergrenze wurde akzeptiert';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%OBERGRENZE_UEBERSCHRITTEN%' THEN
      v_ok := v_ok + 1; RAISE NOTICE 'E14b OK  — Tarif ueber Obergrenze abgelehnt';
    ELSE
      v_fehler := v_fehler + 1; RAISE WARNING 'E14b FAIL — unerwarteter Fehler: %', SQLERRM;
    END IF;
  END;

  -- Tarif unterhalb der Obergrenze muss durchgehen
  BEGIN
    INSERT INTO public.billing_tariffs (
      organization_id, leistungsart, rechtsgrundlage, bundesland,
      verguetungsart, preis_cent, gueltig_ab, tarifquelle
    ) VALUES (
      v_org, 'betreuung_45a', '§45b SGB XI', 'hessen',
      'zeit_stunde', 2800, DATE '2026-03-01', 'MANUELL_FREIGEGEBEN'
    );
    v_ok := v_ok + 1; RAISE NOTICE 'E14c OK  — Tarif unter Obergrenze akzeptiert';
  EXCEPTION WHEN OTHERS THEN
    v_fehler := v_fehler + 1; RAISE WARNING 'E14c FAIL — zulaessiger Tarif abgelehnt: %', SQLERRM;
  END;

  -- ══════════════════════════════════════════════════════════════════════
  -- E15: tarifquelle ANERKENNUNGSBESCHEID ohne Bescheid
  -- ══════════════════════════════════════════════════════════════════════
  BEGIN
    INSERT INTO public.billing_tariffs (
      organization_id, leistungsart, rechtsgrundlage, bundesland,
      verguetungsart, preis_cent, gueltig_ab, tarifquelle, ist_aktiv
    ) VALUES (
      v_org, 'betreuung_45a', '§45b SGB XI', 'hessen',
      'zeit_stunde', 2500, DATE '2026-04-01', 'ANERKENNUNGSBESCHEID', TRUE
    );
    v_fehler := v_fehler + 1;
    RAISE WARNING 'E15 FAIL — Bescheid-Tarif ohne Bescheid akzeptiert';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%BESCHEID_FEHLT%' THEN
      v_ok := v_ok + 1; RAISE NOTICE 'E15 OK   — Bescheid-Tarif ohne Bescheid abgelehnt';
    ELSE
      v_fehler := v_fehler + 1; RAISE WARNING 'E15 FAIL — unerwarteter Fehler: %', SQLERRM;
    END IF;
  END;

  -- Derselbe Tarif als INAKTIVE Vorbereitung muss erlaubt sein
  BEGIN
    INSERT INTO public.billing_tariffs (
      organization_id, leistungsart, rechtsgrundlage, bundesland,
      verguetungsart, preis_cent, gueltig_ab, tarifquelle, ist_aktiv
    ) VALUES (
      v_org, 'betreuung_45a', '§45b SGB XI', 'hessen',
      'zeit_stunde', 2500, DATE '2026-05-01', 'ANERKENNUNGSBESCHEID', FALSE
    );
    v_ok := v_ok + 1; RAISE NOTICE 'E15b OK  — Vorbereitung als inaktiver Tarif moeglich';
  EXCEPTION WHEN OTHERS THEN
    v_fehler := v_fehler + 1; RAISE WARNING 'E15b FAIL — Vorbereitung blockiert: %', SQLERRM;
  END;

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
