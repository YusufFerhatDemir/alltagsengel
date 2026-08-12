-- ════════════════════════════════════════════════════════════════════════════
-- SICHERHEITSPRÜFUNG: Expansion Deutschland
-- Datum: 2026-08-08  ·  Staging-Abnahme Punkt 9
--
-- Ausfuehrung auf der Shadow-/Staging-DB (Seed 10_seed_two_orgs.sql noetig):
--   psql "$SHADOW_URL" -f tests/security-expansion.sql
--
-- WICHTIG: Die uebrigen E2E-Skripte laufen als Superuser und umgehen damit
-- RLS. Dieses Skript nimmt bewusst die ECHTEN Rollen an (anon, authenticated,
-- authenticated-als-Admin) und versucht, die Anerkennungssperre zu umgehen.
--
-- Geprueft wird:
--   S1  anon kann state_settings nicht lesen (Bescheid-Pfade, Notizen)
--   S2  anon kann state_settings nicht schreiben
--   S3  anon kann den Bundesland-Katalog nicht manipulieren
--   S4  anon kann die PLZ→Bundesland-Regeln nicht manipulieren
--   S5  anon kann die Billing-Kataloge nicht manipulieren (FK-Ziele!)
--   S6  anon kann keine Wartelisten-Eintraege faelschen
--   S7  anon kann die Freischaltungs-RPCs nicht aufrufen
--   S8  authenticated (Nicht-Admin) kann state_settings nicht schreiben
--   S9  Admin kann Kassenschalter NICHT per direktem UPDATE setzen
--   S10 Admin kann Status ANERKANNT NICHT per direktem UPDATE setzen
--   S11 Admin kann den Audit-Trail nicht faelschen
--   S12 Admin einer Organisation sieht die state_settings der anderen nicht
--   S13 Die oeffentliche View gibt keine Bescheid-Daten preis
--   S14 anon kann Kassentarife nicht anlegen
-- ════════════════════════════════════════════════════════════════════════════

\set ADMIN_A 'a0000000-0000-4000-8000-0000000000a1'
\set ADMIN_B 'b0000000-0000-4000-8000-0000000000b1'
\set KUNDE_A 'a0000000-0000-4000-8000-0000000000a2'

BEGIN;

CREATE TEMP TABLE sec_results (
  nr TEXT, bereich TEXT, test TEXT, ergebnis TEXT, status TEXT
) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.als_user(p_uid TEXT) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
END $$;

-- Schreibt ein Ergebnis. SECURITY DEFINER, weil die Aufrufer als anon bzw.
-- authenticated laufen und auf die Ergebnistabelle sonst kein Schreibrecht haben.
CREATE OR REPLACE FUNCTION pg_temp.merke(
  p_nr TEXT, p_bereich TEXT, p_test TEXT, p_ergebnis TEXT, p_status TEXT
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO sec_results VALUES (p_nr, p_bereich, p_test, p_ergebnis, p_status);
END $$;

-- Fuehrt eine Anweisung aus und meldet, ob sie GEBLOCKT wurde.
-- Erwartung ist immer: geblockt. Alles andere ist ein Befund.
-- BEWUSST SECURITY INVOKER: die Pruefanweisung MUSS mit den Rechten der
-- aufrufenden Rolle laufen. Mit SECURITY DEFINER liefe sie als Eigentuemer
-- (postgres) und jeder Angriff waere scheinbar erfolgreich — der Test haette
-- genau das Gegenteil dessen gemessen, was er messen soll.
-- Nur das Protokollieren laeuft erhoeht, ueber pg_temp.merke().
CREATE OR REPLACE FUNCTION pg_temp.muss_scheitern(
  p_nr TEXT, p_bereich TEXT, p_test TEXT, p_sql TEXT
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE
  v_fehler TEXT;
  v_zeilen BIGINT;
BEGIN
  BEGIN
    EXECUTE p_sql;
    -- Ein UPDATE/DELETE, das durch RLS keine Zeile trifft, liefert KEINEN
    -- Fehler — es aendert nur nichts. Ohne diese Zeilenzaehlung haette der
    -- Test „durchgelaufen = ungeschuetzt" gemeldet, obwohl gar nichts
    -- passiert ist. Entscheidend ist die Wirkung, nicht der Rueckgabecode.
    GET DIAGNOSTICS v_zeilen = ROW_COUNT;
    IF v_zeilen = 0 THEN
      PERFORM pg_temp.merke(p_nr, p_bereich, p_test,
        'kein Fehler, aber 0 Zeilen betroffen (RLS filtert)', 'PASS');
    ELSE
      PERFORM pg_temp.merke(p_nr, p_bereich, p_test,
        v_zeilen || ' Zeile(n) veraendert — kein Schutz!', 'FAIL');
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_fehler := left(replace(SQLERRM, E'\n', ' '), 70);
    PERFORM pg_temp.merke(p_nr, p_bereich, p_test, v_fehler, 'PASS');
  END;
END $$;

-- Fuehrt ein SELECT aus und meldet die Zeilenzahl (oder 'verweigert').
-- Ebenfalls SECURITY INVOKER, gleicher Grund.
CREATE OR REPLACE FUNCTION pg_temp.zaehlt(
  p_nr TEXT, p_bereich TEXT, p_test TEXT, p_sql TEXT, p_erwartet BIGINT
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE v_n BIGINT;
BEGIN
  BEGIN
    EXECUTE p_sql INTO v_n;
    PERFORM pg_temp.merke(p_nr, p_bereich, p_test,
      v_n::TEXT || ' Zeile(n)',
      CASE WHEN v_n = p_erwartet THEN 'PASS' ELSE 'FAIL' END);
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.merke(p_nr, p_bereich, p_test,
      'verweigert: ' || left(SQLERRM, 50), 'PASS');
  END;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- Vorbereitung: Hessen der Org A freischalten, damit „Nachbarland darf nicht
-- mitprofitieren" ueberhaupt pruefbar ist.
-- ════════════════════════════════════════════════════════════════════════════
-- Nur anlegen, wenn noch kein passender Tarif existiert: 30_seed_expansion.sql
-- bringt fuer Hessen bereits einen mit, und der Overlap-Constraint
-- (no_overlapping_tariffs) laesst keinen zweiten im selben Zeitraum zu.
INSERT INTO public.billing_tariffs (
  organization_id, leistungsart, rechtsgrundlage, bundesland,
  verguetungsart, preis_cent, gueltig_ab, tarifquelle, ist_aktiv
)
SELECT o.id, 'betreuung_45a', '§45b SGB XI', 'hessen',
       'zeit_stunde', 2000, CURRENT_DATE - 1, 'MANUELL_FREIGEGEBEN', FALSE
  FROM public.organizations o
 WHERE o.id = '00000000-0000-4000-8000-000460629986'
   AND NOT EXISTS (
     SELECT 1 FROM public.billing_tariffs t
      WHERE t.organization_id = o.id
        AND t.bundesland = 'hessen'
        AND t.rechtsgrundlage <> 'privat'
        AND t.deleted_at IS NULL
   );

SELECT public.activate_insurance_billing(
  '00000000-0000-4000-8000-000460629986',
  'hessen',
  :'ADMIN_A'::uuid,
  'bescheide/hessen/security-test.pdf');

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLE: anon
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', NULL, TRUE);

SELECT pg_temp.zaehlt('S1', 'anon', 'state_settings nicht lesbar',
  'SELECT count(*) FROM public.state_settings', 0);

SELECT pg_temp.muss_scheitern('S2a', 'anon', 'state_settings UPDATE',
  $$UPDATE public.state_settings SET insurance_enabled = TRUE$$);

SELECT pg_temp.muss_scheitern('S2b', 'anon', 'state_settings INSERT',
  $$INSERT INTO public.state_settings (organization_id, bundesland)
    VALUES ('00000000-0000-4000-8000-000460629986', 'bayern')$$);

SELECT pg_temp.muss_scheitern('S3', 'anon', 'Bundesland-Katalog INSERT',
  $$INSERT INTO public.bundeslaender (code, bezeichnung, iso_code)
    VALUES ('phantasialand', 'Phantasialand', 'DE-XX')$$);

SELECT pg_temp.muss_scheitern('S4', 'anon', 'PLZ-Regeln manipulieren',
  $$UPDATE public.plz_bundesland_regeln SET bundesland = 'hessen' WHERE praefix = '80'$$);

SELECT pg_temp.muss_scheitern('S5a', 'anon', 'Rechtsgrundlagen-Katalog INSERT (FK-Ziel!)',
  $$INSERT INTO public.billing_rechtsgrundlagen (code, bezeichnung)
    VALUES ('§999 Fantasie', 'Erfundene Rechtsgrundlage')$$);

SELECT pg_temp.muss_scheitern('S5b', 'anon', 'Tarifquellen-Katalog INSERT (FK-Ziel!)',
  $$INSERT INTO public.billing_tarifquellen (code, bezeichnung)
    VALUES ('SELBST_ERFUNDEN', 'Selbst erfunden')$$);

SELECT pg_temp.muss_scheitern('S5c', 'anon', 'Leistungsarten-Katalog INSERT (FK-Ziel!)',
  $$INSERT INTO public.billing_leistungsarten (code, bezeichnung)
    VALUES ('phantasieleistung', 'Phantasieleistung')$$);

SELECT pg_temp.muss_scheitern('S6a', 'anon', 'Warteliste mit fremder user_id',
  $$INSERT INTO public.state_waitlist (organization_id, bundesland, email, user_id)
    VALUES ('00000000-0000-4000-8000-000460629986', 'bayern', 'angriff@test.de',
            'a0000000-0000-4000-8000-0000000000a1')$$);

SELECT pg_temp.muss_scheitern('S6b', 'anon', 'Warteliste mit gesetztem notified_at',
  $$INSERT INTO public.state_waitlist (organization_id, bundesland, email, notified_at)
    VALUES ('00000000-0000-4000-8000-000460629986', 'bayern', 'angriff2@test.de', now())$$);

SELECT pg_temp.zaehlt('S6c', 'anon', 'Warteliste nicht lesbar',
  'SELECT count(*) FROM public.state_waitlist', 0);

SELECT pg_temp.muss_scheitern('S7a', 'anon', 'activate_insurance_billing aufrufen',
  $$SELECT public.activate_insurance_billing(
      '00000000-0000-4000-8000-000460629986', 'bayern',
      'a0000000-0000-4000-8000-0000000000a1', 'gefaelscht.pdf')$$);

SELECT pg_temp.muss_scheitern('S7b', 'anon', 'update_state_settings aufrufen',
  $$SELECT public.update_state_settings(
      '00000000-0000-4000-8000-000460629986', 'bayern',
      'a0000000-0000-4000-8000-0000000000a1', 'IN_PRUEFUNG')$$);

SELECT pg_temp.muss_scheitern('S7c', 'anon', 'deactivate_insurance_billing aufrufen',
  $$SELECT public.deactivate_insurance_billing(
      '00000000-0000-4000-8000-000460629986', 'hessen',
      'a0000000-0000-4000-8000-0000000000a1', 'Sabotage')$$);

SELECT pg_temp.muss_scheitern('S14', 'anon', 'Kassentarif anlegen',
  $$INSERT INTO public.billing_tariffs (organization_id, leistungsart, rechtsgrundlage,
      bundesland, verguetungsart, preis_cent, gueltig_ab)
    VALUES ('00000000-0000-4000-8000-000460629986', 'betreuung_45a', '§45b SGB XI',
            'bayern', 'zeit_stunde', 9999, CURRENT_DATE)$$);

RESET ROLE;

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLE: authenticated, Nicht-Admin (Kunde)
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL ROLE authenticated;
SELECT pg_temp.als_user(:'KUNDE_A');

SELECT pg_temp.zaehlt('S8a', 'kunde', 'state_settings nicht lesbar',
  'SELECT count(*) FROM public.state_settings', 0);

SELECT pg_temp.muss_scheitern('S8b', 'kunde', 'state_settings UPDATE',
  $$UPDATE public.state_settings SET private_enabled = FALSE$$);

SELECT pg_temp.muss_scheitern('S8c', 'kunde', 'Kassentarif anlegen',
  $$INSERT INTO public.billing_tariffs (organization_id, leistungsart, rechtsgrundlage,
      bundesland, verguetungsart, preis_cent, gueltig_ab)
    VALUES ('00000000-0000-4000-8000-000460629986', 'betreuung_45a', '§45b SGB XI',
            'bayern', 'zeit_stunde', 9999, CURRENT_DATE)$$);

RESET ROLE;

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLE: authenticated als ADMIN — der interessante Fall.
-- Der Admin DARF state_settings bearbeiten, aber die Kassenschalter
-- ausschliesslich ueber die RPCs.
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL ROLE authenticated;
SELECT pg_temp.als_user(:'ADMIN_A');

SELECT pg_temp.zaehlt('S12a', 'admin', 'sieht die eigenen 16 Bundeslaender',
  'SELECT count(*) FROM public.state_settings', 16);

SELECT pg_temp.muss_scheitern('S9a', 'admin', 'insurance_enabled per UPDATE',
  $$UPDATE public.state_settings SET insurance_enabled = TRUE
     WHERE bundesland = 'bayern'$$);

SELECT pg_temp.muss_scheitern('S9b', 'admin', 'dakota_export_enabled per UPDATE',
  $$UPDATE public.state_settings SET dakota_export_enabled = TRUE
     WHERE bundesland = 'bayern'$$);

SELECT pg_temp.muss_scheitern('S9c', 'admin', 'alle Schalter in einem UPDATE',
  $$UPDATE public.state_settings
       SET status = 'ANERKANNT', approval_document = 'selbst-ausgestellt.pdf',
           insurance_enabled = TRUE, kassentarife_enabled = TRUE,
           budgetpruefung_enabled = TRUE, kassenrechnung_enabled = TRUE,
           elnw_enabled = TRUE, dakota_export_enabled = TRUE
     WHERE bundesland = 'bayern'$$);

SELECT pg_temp.muss_scheitern('S10', 'admin', 'Status ANERKANNT per UPDATE',
  $$UPDATE public.state_settings SET status = 'ANERKANNT'
     WHERE bundesland = 'bayern'$$);

-- S9d: Kann ein Admin die RPC-Markierung selbst setzen und den Guard damit
-- aushebeln? set_config() auf eine eigene GUC ist jeder Rolle erlaubt, also
-- ja — ABER nur mit direkter SQL-Verbindung. Ueber PostgREST ist jeder
-- Request eine eigene Transaktion und set_config kein aufrufbarer Endpunkt.
-- Der Test haelt beides fest: das Verhalten UND die Reichweite.
DO $s9d$
DECLARE v_geschafft BOOLEAN := FALSE;
BEGIN
  BEGIN
    PERFORM set_config('app.expansion_rpc', 'aktiv', TRUE);
    UPDATE public.state_settings SET insurance_enabled = TRUE
     WHERE bundesland = 'bayern';
    v_geschafft := TRUE;
  EXCEPTION WHEN OTHERS THEN
    v_geschafft := FALSE;
  END;
  PERFORM set_config('app.expansion_rpc', '', TRUE);

  PERFORM pg_temp.merke('S9d', 'admin',
    'Marker selbst setzen (nur mit direkter SQL-Verbindung moeglich)',
    CASE WHEN v_geschafft
         THEN 'Guard umgangen — erwartet, siehe Restrisiko R1'
         ELSE 'auch mit Marker geblockt' END,
    'INFO');
END
$s9d$;

SELECT pg_temp.muss_scheitern('S11a', 'admin', 'Audit-Eintrag aendern',
  $$UPDATE public.state_settings_audit SET begruendung = 'harmlos'$$);

SELECT pg_temp.muss_scheitern('S11b', 'admin', 'Audit-Eintrag loeschen',
  $$DELETE FROM public.state_settings_audit$$);

SELECT pg_temp.muss_scheitern('S15', 'admin', 'state_settings-Zeile loeschen',
  $$DELETE FROM public.state_settings WHERE bundesland = 'bremen'$$);

RESET ROLE;

-- ════════════════════════════════════════════════════════════════════════════
-- Mandantentrennung: Admin B darf Org A nicht sehen
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL ROLE authenticated;
SELECT pg_temp.als_user(:'ADMIN_B');

-- Stamm-Org als Literal: eine Unterabfrage auf organizations laeuft ebenfalls
-- unter RLS und lieferte fuer Admin B dessen EIGENE Org — der Test verglich
-- dadurch gegen die falsche Organisation und meldete einen Leak, der keiner war.
SELECT pg_temp.zaehlt('S12b', 'mandant', 'Admin B sieht keine Zeile der Stamm-Org',
  $$SELECT count(*) FROM public.state_settings
     WHERE organization_id = '00000000-0000-4000-8000-000460629986'$$, 0);

SELECT pg_temp.zaehlt('S12d', 'mandant', 'Admin B sieht keine Zeile von Testorg A',
  $$SELECT count(*) FROM public.state_settings
     WHERE organization_id = 'aaaaaaaa-0000-4000-8000-000000000001'$$, 0);

SELECT pg_temp.muss_scheitern('S12c', 'mandant', 'Admin B schaltet die Stamm-Org frei',
  $$SELECT public.activate_insurance_billing(
      '00000000-0000-4000-8000-000460629986',
      'bayern', 'b0000000-0000-4000-8000-0000000000b1', 'fremd.pdf')$$);

RESET ROLE;

-- ════════════════════════════════════════════════════════════════════════════
-- S13: Die oeffentliche View darf keine Bescheid-Daten enthalten
-- ════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE v_spalten TEXT[];
BEGIN
  SELECT array_agg(column_name::TEXT) INTO v_spalten
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'state_settings_public';

  IF v_spalten && ARRAY['approval_document','approval_reference','notes',
                        'approval_authority'] THEN
    PERFORM pg_temp.merke('S13', 'view',
      'state_settings_public ohne Bescheid-Felder',
      'Bescheid-/Notizfelder in der oeffentlichen View!', 'FAIL');
  ELSE
    PERFORM pg_temp.merke('S13', 'view',
      'state_settings_public ohne Bescheid-Felder',
      array_length(v_spalten, 1) || ' Spalten, keine Bescheid-Felder', 'PASS');
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- Ergebnis
-- ════════════════════════════════════════════════════════════════════════════
SELECT nr, bereich, test, status, ergebnis FROM sec_results ORDER BY nr;
SELECT status, count(*) FROM sec_results GROUP BY status ORDER BY status;

DO $$
DECLARE v_fail INTEGER;
BEGIN
  SELECT count(*) INTO v_fail FROM sec_results WHERE status = 'FAIL';
  IF v_fail > 0 THEN
    RAISE EXCEPTION '% Sicherheitspruefung(en) fehlgeschlagen.', v_fail;
  END IF;
  RAISE NOTICE 'Alle Sicherheitspruefungen bestanden.';
END $$;

ROLLBACK;
