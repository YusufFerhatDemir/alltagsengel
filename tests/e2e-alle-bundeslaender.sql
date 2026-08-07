-- ════════════════════════════════════════════════════════════════════════════
-- E2E-Test: Freischaltung über ALLE 16 Bundesländer
-- Datum: 2026-08-08  ·  Phase 2, Punkt 7
--
-- Voraussetzung (in dieser Reihenfolge angewendet):
--   20260808100000, 110000, 120000, 120001, 120002, 130000
--
-- Ausfuehrung: Supabase Staging-Branch (NICHT Production).
--   psql "$STAGING_URL" -f tests/e2e-alle-bundeslaender.sql
--
-- Das Skript laeuft in EINER Transaktion und endet mit ROLLBACK.
--
-- Fuer JEDES der 16 Bundeslaender wird geprueft:
--   1. Ausgangslage: vier unabhaengige Module an, Kasse aus
--   2. Freischaltung ohne Tarif scheitert
--   3. Tarif + Landesregel INAKTIV vorbereiten
--   4. Ein-Klick-Freischaltung setzt sechs Modulschalter
--   5. … und schaltet Tarif UND Landesregel automatisch scharf
--   6. kassenabrechnung_erlaubt() liefert fuer eine echte PLZ TRUE
--   7. Alle 15 anderen Bundeslaender bleiben unberuehrt (Unabhaengigkeit)
--   8. Abschaltung setzt Module, Tarif und Regel zurueck
--   9. Audit-Eintraege sind vorhanden
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
DECLARE
  -- Echte, eindeutig zuordenbare Postleitzahl je Bundesland.
  -- Muss zu lib/expansion/plz-bundesland.ts passen (Test:
  -- __tests__/expansion/alle-bundeslaender.test.ts).
  c_proben CONSTANT JSONB := '{
    "baden_wuerttemberg":     "70173",
    "bayern":                 "80331",
    "berlin":                 "10115",
    "brandenburg":            "14467",
    "bremen":                 "28195",
    "hamburg":                "20095",
    "hessen":                 "60311",
    "mecklenburg_vorpommern": "19053",
    "niedersachsen":          "30159",
    "nordrhein_westfalen":    "40213",
    "rheinland_pfalz":        "55116",
    "saarland":               "66111",
    "sachsen":                "01067",
    "sachsen_anhalt":         "39104",
    "schleswig_holstein":     "24103",
    "thueringen":             "99084"
  }'::JSONB;

  v_org      UUID;
  v_actor    UUID;
  v_land     TEXT;
  v_plz      TEXT;
  v_res      public.state_activation_result;
  v_row      public.state_settings%ROWTYPE;
  v_tarif_id UUID;
  v_regel_id UUID;
  v_count    INTEGER;
  v_aktiv    BOOLEAN;
  v_andere   INTEGER;
  v_fehler   INTEGER := 0;
  v_ok       INTEGER := 0;
  v_laender  INTEGER := 0;
BEGIN
  SELECT id INTO v_org FROM public.organizations ORDER BY created_at LIMIT 1;
  SELECT id INTO v_actor FROM auth.users LIMIT 1;
  IF v_org IS NULL OR v_actor IS NULL THEN
    RAISE EXCEPTION 'Organisation oder auth.users fehlt — Test kann nicht laufen.';
  END IF;

  RAISE NOTICE '═══ Durchlauf über alle 16 Bundesländer (Org %) ═══', v_org;
  RAISE NOTICE '';

  -- Saubere Ausgangslage: alle Länder auf ANTRAG_EINGEREICHT, Kasse aus.
  PERFORM set_config('app.expansion_rpc', 'aktiv', TRUE);
  UPDATE public.state_settings
     SET status = 'ANTRAG_EINGEREICHT',
         marketing_enabled = TRUE, registration_enabled = TRUE,
         waitinglist_enabled = TRUE, private_enabled = TRUE,
         insurance_enabled = FALSE, kassentarife_enabled = FALSE,
         budgetpruefung_enabled = FALSE, kassenrechnung_enabled = FALSE,
         elnw_enabled = FALSE, dakota_export_enabled = FALSE,
         approval_document = NULL
   WHERE organization_id = v_org;
  PERFORM set_config('app.expansion_rpc', '', TRUE);

  DELETE FROM public.billing_tariffs
   WHERE organization_id = v_org AND leistungsart = 'betreuung_45a'
     AND vertrag_referenz IS NOT DISTINCT FROM NULL
     AND rechtsgrundlage <> 'privat';

  -- ══════════════════════════════════════════════════════════════════════
  FOR v_land IN
    SELECT code FROM public.bundeslaender ORDER BY sort_order
  LOOP
    v_laender := v_laender + 1;
    v_plz := c_proben ->> v_land;

    -- ── 1. Ausgangslage ────────────────────────────────────────────────
    SELECT * INTO v_row FROM public.state_settings
     WHERE organization_id = v_org AND bundesland = v_land;

    IF v_row.marketing_enabled AND v_row.registration_enabled
       AND v_row.waitinglist_enabled AND v_row.private_enabled
       AND NOT v_row.insurance_enabled THEN
      v_ok := v_ok + 1;
    ELSE
      v_fehler := v_fehler + 1;
      RAISE WARNING '% [1] FAIL — Ausgangslage falsch', v_land;
    END IF;

    -- ── 2. Freischaltung ohne Tarif muss scheitern ─────────────────────
    BEGIN
      v_res := public.activate_insurance_billing(
        v_org, v_land, v_actor, 'bescheide/' || v_land || '/test.pdf');
      v_fehler := v_fehler + 1;
      RAISE WARNING '% [2] FAIL — Freischaltung ohne Tarif durchgelaufen', v_land;
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM LIKE '%FREISCHALTUNG_OHNE_TARIFE%' THEN
        v_ok := v_ok + 1;
      ELSE
        v_fehler := v_fehler + 1;
        RAISE WARNING '% [2] FAIL — unerwarteter Fehler: %', v_land, SQLERRM;
      END IF;
    END;

    -- ── 3. Tarif und Landesregel INAKTIV vorbereiten ───────────────────
    INSERT INTO public.billing_tariffs (
      organization_id, leistungsart, rechtsgrundlage, bundesland,
      verguetungsart, preis_cent, gueltig_ab, tarifquelle, ist_aktiv
    ) VALUES (
      v_org, 'betreuung_45a', '§45b SGB XI', v_land,
      'zeit_stunde', 2000, CURRENT_DATE - 1, 'MANUELL_FREIGEGEBEN', FALSE
    ) RETURNING id INTO v_tarif_id;

    INSERT INTO public.billing_landesregeln (
      bundesland, regel_key, regel_wert, rechtsgrundlage,
      quelle, gueltig_ab, ist_aktiv, organization_id
    ) VALUES (
      v_land, 'min_einsatzdauer_minuten', '60'::JSONB, '§45b SGB XI',
      'E2E-Test', CURRENT_DATE - 1, FALSE, v_org
    ) RETURNING id INTO v_regel_id;

    -- Vor der Freischaltung darf die Kasse nicht erlaubt sein.
    IF public.kassenabrechnung_erlaubt(v_org, v_plz) = FALSE THEN
      v_ok := v_ok + 1;
    ELSE
      v_fehler := v_fehler + 1;
      RAISE WARNING '% [3] FAIL — Kasse vor Freischaltung erlaubt (PLZ %)', v_land, v_plz;
    END IF;

    -- ── 4. + 5. Ein-Klick-Freischaltung ────────────────────────────────
    v_res := public.activate_insurance_billing(
      v_org, v_land, v_actor,
      'bescheide/' || v_land || '/anerkennung.pdf',
      'AZ-' || upper(left(v_land, 3)), 'Landesbehoerde ' || v_land,
      CURRENT_DATE, CURRENT_DATE);

    SELECT * INTO v_row FROM public.state_settings
     WHERE organization_id = v_org AND bundesland = v_land;

    IF v_row.status = 'ANERKANNT'
       AND v_row.insurance_enabled AND v_row.kassentarife_enabled
       AND v_row.budgetpruefung_enabled AND v_row.kassenrechnung_enabled
       AND v_row.elnw_enabled AND v_row.dakota_export_enabled THEN
      v_ok := v_ok + 1;
    ELSE
      v_fehler := v_fehler + 1;
      RAISE WARNING '% [4] FAIL — Modulkaskade unvollstaendig', v_land;
    END IF;

    SELECT ist_aktiv INTO v_aktiv FROM public.billing_tariffs WHERE id = v_tarif_id;
    IF v_aktiv AND v_res.tarife_aktiviert >= 1 THEN
      v_ok := v_ok + 1;
    ELSE
      v_fehler := v_fehler + 1;
      RAISE WARNING '% [5a] FAIL — Tarif nicht automatisch aktiviert (ist_aktiv=%, gemeldet=%)',
        v_land, v_aktiv, v_res.tarife_aktiviert;
    END IF;

    SELECT ist_aktiv INTO v_aktiv FROM public.billing_landesregeln WHERE id = v_regel_id;
    IF v_aktiv AND v_res.regeln_aktiviert >= 1 THEN
      v_ok := v_ok + 1;
    ELSE
      v_fehler := v_fehler + 1;
      RAISE WARNING '% [5b] FAIL — Landesregel nicht automatisch aktiviert (ist_aktiv=%, gemeldet=%)',
        v_land, v_aktiv, v_res.regeln_aktiviert;
    END IF;

    -- ── 6. Kassenabrechnung fuer echte PLZ erlaubt ─────────────────────
    IF public.kassenabrechnung_erlaubt(v_org, v_plz) THEN
      v_ok := v_ok + 1;
    ELSE
      v_fehler := v_fehler + 1;
      RAISE WARNING '% [6] FAIL — PLZ % wird nicht als freigeschaltet erkannt', v_land, v_plz;
    END IF;

    -- ── 7. Unabhaengigkeit: kein anderes Land wurde mitgezogen ─────────
    SELECT COUNT(*) INTO v_andere
      FROM public.state_settings
     WHERE organization_id = v_org
       AND bundesland <> v_land
       AND insurance_enabled;
    IF v_andere = 0 THEN
      v_ok := v_ok + 1;
    ELSE
      v_fehler := v_fehler + 1;
      RAISE WARNING '% [7] FAIL — % andere Bundeslaender wurden mitfreigeschaltet',
        v_land, v_andere;
    END IF;

    -- ── 8. Abschaltung setzt alles zurueck ─────────────────────────────
    PERFORM public.deactivate_insurance_billing(
      v_org, v_land, v_actor, 'E2E-Durchlauf: Ruecksetzung', 'IN_PRUEFUNG');

    SELECT * INTO v_row FROM public.state_settings
     WHERE organization_id = v_org AND bundesland = v_land;
    SELECT ist_aktiv INTO v_aktiv FROM public.billing_tariffs WHERE id = v_tarif_id;

    IF NOT v_row.insurance_enabled AND NOT v_row.dakota_export_enabled
       AND v_row.status = 'IN_PRUEFUNG'
       AND v_row.private_enabled          -- Privat laeuft weiter
       AND v_row.registration_enabled     -- Registrierung laeuft weiter
       AND NOT v_aktiv THEN               -- Tarif wieder inaktiv
      v_ok := v_ok + 1;
    ELSE
      v_fehler := v_fehler + 1;
      RAISE WARNING '% [8] FAIL — Ruecksetzung unvollstaendig (status=%, tarif_aktiv=%)',
        v_land, v_row.status, v_aktiv;
    END IF;

    -- ── 9. Audit ───────────────────────────────────────────────────────
    SELECT COUNT(*) INTO v_count
      FROM public.state_settings_audit
     WHERE organization_id = v_org AND bundesland = v_land
       AND action IN ('insurance_activated', 'insurance_deactivated');
    IF v_count >= 2 THEN
      v_ok := v_ok + 1;
    ELSE
      v_fehler := v_fehler + 1;
      RAISE WARNING '% [9] FAIL — nur % Audit-Eintraege (erwartet >= 2)', v_land, v_count;
    END IF;

    -- Aufraeumen fuer den naechsten Durchlauf
    DELETE FROM public.billing_landesregeln WHERE id = v_regel_id;
    DELETE FROM public.billing_tariffs WHERE id = v_tarif_id;

    RAISE NOTICE '  ✓ % — 9 Pruefungen durchlaufen', v_land;
  END LOOP;

  -- ══════════════════════════════════════════════════════════════════════
  -- Abschluss: Mehrfachfreischaltung nebeneinander
  -- ══════════════════════════════════════════════════════════════════════
  RAISE NOTICE '';
  RAISE NOTICE '── Parallelbetrieb: Hessen und Bayern gleichzeitig ──';

  FOR v_land IN SELECT unnest(ARRAY['hessen', 'bayern']) LOOP
    INSERT INTO public.billing_tariffs (
      organization_id, leistungsart, rechtsgrundlage, bundesland,
      verguetungsart, preis_cent, gueltig_ab, tarifquelle, ist_aktiv
    ) VALUES (
      v_org, 'betreuung_45a', '§45b SGB XI', v_land,
      'zeit_stunde', 2000, CURRENT_DATE - 1, 'MANUELL_FREIGEGEBEN', FALSE
    );
    PERFORM public.activate_insurance_billing(
      v_org, v_land, v_actor, 'bescheide/' || v_land || '/parallel.pdf');
  END LOOP;

  SELECT COUNT(*) INTO v_count
    FROM public.state_settings
   WHERE organization_id = v_org AND insurance_enabled;

  IF v_count = 2
     AND public.kassenabrechnung_erlaubt(v_org, '60311')      -- Hessen
     AND public.kassenabrechnung_erlaubt(v_org, '80331')      -- Bayern
     AND NOT public.kassenabrechnung_erlaubt(v_org, '10115')  -- Berlin
     AND NOT public.kassenabrechnung_erlaubt(v_org, '01067')  -- Sachsen
  THEN
    v_ok := v_ok + 1;
    RAISE NOTICE '  ✓ Zwei Laender parallel frei, die uebrigen 14 gesperrt';
  ELSE
    v_fehler := v_fehler + 1;
    RAISE WARNING 'PARALLEL FAIL — % Laender frei, Erwartung 2', v_count;
  END IF;

  -- Grenzregion darf auch bei freigeschaltetem Land nicht durchgehen
  IF NOT public.kassenabrechnung_erlaubt(v_org, '21444') THEN
    v_ok := v_ok + 1;
    RAISE NOTICE '  ✓ Grenz-PLZ 21444 bleibt gesperrt';
  ELSE
    v_fehler := v_fehler + 1;
    RAISE WARNING 'GRENZFALL FAIL — 21444 wurde freigegeben';
  END IF;

  RAISE NOTICE '';
  RAISE NOTICE '═══════════════════════════════════════════════';
  RAISE NOTICE '  % Bundeslaender geprueft', v_laender;
  RAISE NOTICE '  ERGEBNIS:  % bestanden,  % fehlgeschlagen', v_ok, v_fehler;
  RAISE NOTICE '═══════════════════════════════════════════════';

  IF v_laender <> 16 THEN
    RAISE EXCEPTION 'Nur % statt 16 Bundeslaender durchlaufen.', v_laender;
  END IF;
  IF v_fehler > 0 THEN
    RAISE EXCEPTION '% Pruefung(en) fehlgeschlagen — siehe WARNING-Zeilen oben.', v_fehler;
  END IF;
END $$;

ROLLBACK;
