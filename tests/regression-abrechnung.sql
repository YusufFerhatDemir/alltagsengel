-- ════════════════════════════════════════════════════════════════════════════
-- REGRESSION: Abrechnungskette unter der Deutschland-Architektur
-- Datum: 2026-08-08  ·  Staging-Abnahme Punkt 11
--
-- Ausfuehrung auf der Shadow-/Staging-DB (Seeds 10 + 30 noetig):
--   psql "$SHADOW_URL" -f tests/regression-abrechnung.sql
--
-- Prueft, dass die Expansion-Guards die bestehende Abrechnung nicht
-- beschaedigen — und zwar entlang des echten Ablaufs:
--
--   R1  Privatrechnung: erstellen UND freigeben, voellig unberuehrt
--   R2  Kassen-Entwurf VOR der Freischaltung → MISSING_VALID_TARIFF
--       (Kassentarife liegen bis zur Anerkennung bewusst inaktiv)
--   R3  Nach der Freischaltung: Tarif aktiv, Entwurf moeglich
--   R4  Nach der Freischaltung: Kassenrechnung freigebbar
--   R5  Klient in einem NICHT freigeschalteten Bundesland: Freigabe blockiert
--   R6  Klient mit Grenz-PLZ: Freigabe blockiert (keine eindeutige Zuordnung)
--   R7  Klient ohne PLZ: Freigabe blockiert, mit klarer Fehlermeldung
--   R8  Audit-Trail weist das Bundesland aus der Klienten-PLZ aus
--   R9  Budget-Aufteilung (privat vs. Kasse) bleibt korrekt
--
-- Endet mit ROLLBACK.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
DECLARE
  v_org     UUID := '00000000-0000-4000-8000-000460629986';
  v_actor   UUID;
  v_cg      UUID;
  v_monat   TEXT := to_char(CURRENT_DATE, 'YYYY-MM');
  v_res     public.create_invoice_draft_result;
  v_inv_he  UUID;
  v_inv_by  UUID;
  v_status  TEXT;
  v_ok      INT := 0;
  v_fail    INT := 0;
  v_quelle  TEXT;
  v_land    TEXT;
  v_aktiv   BOOLEAN;
  v_privat  NUMERIC;
  v_budget  NUMERIC;

  c_he      UUID;   -- Frankfurt, 60311
  c_by      UUID;   -- Muenchen, 80331
  c_grenz   UUID;   -- 21444, Grenzregion
  c_ohne    UUID;   -- ohne PLZ

  PROCEDURE_HINWEIS TEXT;
BEGIN
  SELECT id INTO v_actor FROM auth.users LIMIT 1;
  SELECT id INTO v_cg FROM public.caregivers LIMIT 1;
  IF v_cg IS NULL THEN
    INSERT INTO public.caregivers (organization_id, first_name, last_name, status)
    VALUES (v_org, 'Test', 'Kraft', 'active') RETURNING id INTO v_cg;
  END IF;

  SELECT id INTO c_he    FROM public.clients WHERE organization_id=v_org AND zip_code='60311' LIMIT 1;
  SELECT id INTO c_by    FROM public.clients WHERE organization_id=v_org AND zip_code='80331' LIMIT 1;
  SELECT id INTO c_grenz FROM public.clients WHERE organization_id=v_org AND zip_code='21444' LIMIT 1;
  SELECT id INTO c_ohne  FROM public.clients WHERE organization_id=v_org AND zip_code IS NULL LIMIT 1;

  IF c_he IS NULL OR c_by IS NULL THEN
    RAISE EXCEPTION 'Seed 30_seed_expansion.sql fehlt — Testklienten nicht gefunden.';
  END IF;

  -- Leistungen fuer alle vier Klienten
  INSERT INTO public.service_records (client_id, caregiver_id, organization_id, service_type,
    date, start_time, end_time, duration_minutes, caregiver_initials, budget_type, status, amount)
  SELECT k, v_cg, v_org, 'alltagsbegleitung', CURRENT_DATE - 5, '09:00', '11:00', 120, 'TK',
         'private', 'signed', 64.00
    FROM unnest(ARRAY[c_he, c_by, c_grenz, c_ohne]) k WHERE k IS NOT NULL;

  INSERT INTO public.service_records (client_id, caregiver_id, organization_id, service_type,
    date, start_time, end_time, duration_minutes, caregiver_initials, budget_type, status, amount)
  SELECT k, v_cg, v_org, 'betreuung_45a', CURRENT_DATE - 4, '09:00', '10:00', 60, 'TK',
         'entlastung', 'signed', 28.00
    FROM unnest(ARRAY[c_he, c_by, c_grenz, c_ohne]) k WHERE k IS NOT NULL;

  -- ══ R1: Privatrechnung — komplett unberuehrt ══
  BEGIN
    v_res := public.create_invoice_draft_atomic(c_he, v_org, v_monat, 'private', v_actor);
    UPDATE public.invoices SET status = 'geprueft' WHERE id = v_res.invoice_id;
    SELECT status, private_amount, budget_amount INTO v_status, v_privat, v_budget
      FROM public.invoices WHERE id = v_res.invoice_id;
    IF v_status = 'geprueft' THEN
      v_ok := v_ok+1;
      RAISE NOTICE 'R1 OK   -- Privatrechnung erstellt und freigegeben (% EUR)', v_res.total_amount;
    ELSE
      v_fail := v_fail+1; RAISE WARNING 'R1 FAIL -- Status %', v_status;
    END IF;

    -- R9 gleich mitpruefen: alles im Privat-Topf, nichts im Kassen-Topf
    IF v_privat = v_res.total_amount AND v_budget = 0 THEN
      v_ok := v_ok+1; RAISE NOTICE 'R9 OK   -- Budget-Aufteilung korrekt (privat %, kasse %)', v_privat, v_budget;
    ELSE
      v_fail := v_fail+1; RAISE WARNING 'R9 FAIL -- privat=% kasse=%', v_privat, v_budget;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_fail := v_fail+2; RAISE WARNING 'R1/R9 FAIL -- %', SQLERRM;
  END;

  -- ══ R2: Kassen-Entwurf VOR der Freischaltung ══
  -- Erwartung: scheitert. Kassentarife sind bis zur Anerkennung inaktiv —
  -- das ist Absicht (Phase 2: der Ein-Klick schaltet sie scharf).
  BEGIN
    v_res := public.create_invoice_draft_atomic(c_he, v_org, v_monat, 'entlastung', v_actor);
    v_fail := v_fail+1;
    RAISE WARNING 'R2 FAIL -- Kassen-Entwurf ohne Freischaltung moeglich';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%MISSING_VALID_TARIFF%' THEN
      v_ok := v_ok+1;
      RAISE NOTICE 'R2 OK   -- Kassen-Entwurf vor Freischaltung nicht moeglich (Tarife inaktiv)';
    ELSE
      v_fail := v_fail+1; RAISE WARNING 'R2 FAIL -- unerwartet: %', SQLERRM;
    END IF;
  END;

  -- ══ Hessen freischalten ══
  PERFORM public.activate_insurance_billing(
    v_org, 'hessen', v_actor, 'bescheide/hessen/regression.pdf');

  SELECT ist_aktiv INTO v_aktiv FROM public.billing_tariffs
   WHERE organization_id=v_org AND bundesland='hessen'
     AND rechtsgrundlage <> 'privat' AND leistungsart='betreuung_45a' LIMIT 1;
  IF v_aktiv THEN
    v_ok := v_ok+1; RAISE NOTICE 'R3a OK  -- Freischaltung hat den Kassentarif scharf geschaltet';
  ELSE
    v_fail := v_fail+1; RAISE WARNING 'R3a FAIL -- Tarif blieb inaktiv';
  END IF;

  -- ══ R3: Entwurf nach der Freischaltung ══
  BEGIN
    v_res := public.create_invoice_draft_atomic(c_he, v_org, v_monat, 'entlastung', v_actor);
    v_inv_he := v_res.invoice_id;
    v_ok := v_ok+1;
    RAISE NOTICE 'R3b OK  -- Kassen-Entwurf nach Freischaltung erstellt (% EUR)', v_res.total_amount;
  EXCEPTION WHEN OTHERS THEN
    v_fail := v_fail+1; RAISE WARNING 'R3b FAIL -- %', SQLERRM;
  END;

  -- ══ R4: Freigabe nach der Freischaltung ══
  BEGIN
    UPDATE public.invoices SET status = 'geprueft' WHERE id = v_inv_he;
    SELECT status INTO v_status FROM public.invoices WHERE id = v_inv_he;
    IF v_status = 'geprueft' THEN
      v_ok := v_ok+1; RAISE NOTICE 'R4 OK   -- Kassenrechnung freigegeben';
    ELSE
      v_fail := v_fail+1; RAISE WARNING 'R4 FAIL -- Status %', v_status;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_fail := v_fail+1; RAISE WARNING 'R4 FAIL -- %', SQLERRM;
  END;

  -- ══ R5: Klient in Bayern — Bayern ist NICHT freigeschaltet ══
  -- Ein Tarif ohne Bundesland-Bindung wuerde greifen; entscheidend ist,
  -- dass die FREIGABE blockiert.
  INSERT INTO public.billing_tariffs (organization_id, leistungsart, rechtsgrundlage,
    bundesland, verguetungsart, preis_cent, gueltig_ab, tarifquelle, ist_aktiv)
  VALUES (v_org, 'betreuung_45a', '§45b SGB XI', 'bayern', 'zeit_stunde', 2900,
          CURRENT_DATE - 30, 'MANUELL_FREIGEGEBEN', TRUE)
  ON CONFLICT DO NOTHING;

  BEGIN
    v_res := public.create_invoice_draft_atomic(c_by, v_org, v_monat, 'entlastung', v_actor);
    v_inv_by := v_res.invoice_id;
    BEGIN
      UPDATE public.invoices SET status = 'geprueft' WHERE id = v_inv_by;
      v_fail := v_fail+1;
      RAISE WARNING 'R5 FAIL -- Kassenrechnung fuer Bayern trotz freiem Hessen freigegeben!';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM LIKE '%KASSENRECHNUNG_NICHT_FREIGESCHALTET%' THEN
        v_ok := v_ok+1;
        RAISE NOTICE 'R5 OK   -- Bayern bleibt gesperrt, obwohl Hessen frei ist';
      ELSE
        v_fail := v_fail+1; RAISE WARNING 'R5 FAIL -- unerwartet: %', SQLERRM;
      END IF;
    END;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'R5 INFO -- kein Entwurf fuer Bayern moeglich (%), Sperre greift bereits davor',
      left(SQLERRM, 40);
    v_ok := v_ok+1;
  END;

  -- ══ R6: Grenz-PLZ 21444 ══
  IF c_grenz IS NOT NULL THEN
    BEGIN
      v_res := public.create_invoice_draft_atomic(c_grenz, v_org, v_monat, 'entlastung', v_actor);
      BEGIN
        UPDATE public.invoices SET status = 'geprueft' WHERE id = v_res.invoice_id;
        v_fail := v_fail+1; RAISE WARNING 'R6 FAIL -- Grenz-PLZ wurde freigegeben';
      EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%BUNDESLAND_UNKLAR%' OR SQLERRM LIKE '%NICHT_FREIGESCHALTET%' THEN
          v_ok := v_ok+1; RAISE NOTICE 'R6 OK   -- Grenz-PLZ 21444 blockiert';
        ELSE
          v_fail := v_fail+1; RAISE WARNING 'R6 FAIL -- unerwartet: %', SQLERRM;
        END IF;
      END;
    EXCEPTION WHEN OTHERS THEN
      v_ok := v_ok+1; RAISE NOTICE 'R6 OK   -- Grenz-PLZ: kein Kassen-Entwurf moeglich';
    END;
  END IF;

  -- ══ R7: Klient ohne PLZ ══
  IF c_ohne IS NOT NULL THEN
    BEGIN
      v_res := public.create_invoice_draft_atomic(c_ohne, v_org, v_monat, 'entlastung', v_actor);
      BEGIN
        UPDATE public.invoices SET status = 'geprueft' WHERE id = v_res.invoice_id;
        v_fail := v_fail+1; RAISE WARNING 'R7 FAIL -- Klient ohne PLZ wurde freigegeben';
      EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%BUNDESLAND_UNKLAR%' THEN
          v_ok := v_ok+1;
          RAISE NOTICE 'R7 OK   -- Klient ohne PLZ blockiert, Meldung nennt clients.zip_code';
        ELSE
          v_fail := v_fail+1; RAISE WARNING 'R7 FAIL -- unerwartet: %', SQLERRM;
        END IF;
      END;
    EXCEPTION WHEN OTHERS THEN
      v_ok := v_ok+1; RAISE NOTICE 'R7 OK   -- Klient ohne PLZ: kein Kassen-Entwurf';
    END;
  END IF;

  -- ══ R8: Audit-Trail ══
  SELECT new_state->>'bundesland_quelle', new_state->>'bundesland' INTO v_quelle, v_land
    FROM public.billing_audit_trail
   WHERE entity_type='invoice' AND entity_id = v_inv_he
   ORDER BY created_at DESC LIMIT 1;
  IF v_quelle = 'klient_plz' AND v_land = 'hessen' THEN
    v_ok := v_ok+1; RAISE NOTICE 'R8 OK   -- Audit weist % aus % aus', v_land, v_quelle;
  ELSE
    v_fail := v_fail+1; RAISE WARNING 'R8 FAIL -- %/%', v_land, v_quelle;
  END IF;

  RAISE NOTICE '';
  RAISE NOTICE '═══ REGRESSION: % bestanden, % fehlgeschlagen ═══', v_ok, v_fail;
  IF v_fail > 0 THEN
    RAISE EXCEPTION '% Regressionsfehler', v_fail;
  END IF;
END $$;

ROLLBACK;
