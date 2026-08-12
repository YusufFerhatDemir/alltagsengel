-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  SECURITY-P0 — KOMBINIERTER APPLY-BLOCK FUER DEN SUPABASE-SQL-EDITOR      ║
-- ║  Projekt: nnwyktkqibdjxgimjyuq   Branch: staging/expansion-abnahme        ║
-- ║  Erstellt: 2026-08-09                                                    ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- Fasst vier Repo-Migrationen in EINER Transaktion zusammen, in dieser Reihenfolge:
--
--   TEIL 1  20260817010000  _run_sql / _sql_parts fuer anon schliessen
--   TEIL 2  20260817030000  SECURITY-DEFINER-RPCs (wf_*, next_billing_number)
--   TEIL 3  20260815010000  profiles: anon-Leseleck zu
--   TEIL 3b 20260817040000  bookings: transitive 42P17-Rekursion beseitigen
--   TEIL 4  20260817020000  billing_audit_trail: Probe-Zeile dokumentieren
--
-- STAND AM 09.08.2026, 12:05 (live nachgemessen): TEIL 1, TEIL 3 und TEIL 4
-- wurden waehrend der Analyse bereits eingespielt. Sie stehen hier weiterhin
-- drin, weil der Block idempotent ist — sie laufen als No-Op durch. Offen und
-- damit der eigentliche Zweck dieses Durchlaufs sind TEIL 2 und TEIL 3b.
--
-- SICHERHEITSEIGENSCHAFTEN DIESES BLOCKS
--   * EINE Transaktion. Schlaegt irgendein Schritt fehl, wird ALLES
--     zurueckgerollt — es gibt keinen halb angewendeten Zustand.
--   * TEIL 0 prueft ALLE Voraussetzungen, BEVOR die erste Aenderung passiert.
--     Stimmt etwas nicht, bricht der Block mit einer Klartextmeldung ab und
--     die Datenbank bleibt unveraendert.
--   * Kein DELETE, kein UPDATE, kein TRUNCATE auf Nutzdaten.
--   * Kein DROP TABLE, kein DROP FUNCTION, kein DROP TRIGGER.
--   * Der Immutabilitaetsschutz von billing_audit_trail wird NICHT angefasst.
--     TEIL 4 schreibt ausschliesslich einen Tabellenkommentar.
--   * Idempotent: mehrfaches Ausfuehren ist gefahrlos und aendert nichts mehr.
--
-- WAS GEZIELT NICHT PASSIERT
--   * public._run_sql wird NICHT geloescht. service_role behaelt EXECUTE —
--     scripts/apply-migration.mjs haengt daran. Der service_role-Key ist ein
--     reines Servergeheimnis; wer ihn hat, hat ohnehin Vollzugriff. Dadurch
--     entsteht keine zusaetzliche Angriffsflaeche.
--   * public._sql_parts wird NICHT geloescht, nur unerreichbar gemacht.
--
-- NACH DEM AUSFUEHREN: siehe Ergebnisabfrage ganz unten — sie laeuft
-- automatisch mit und zeigt in vier Tabellen, ob alles sitzt.

BEGIN;

-- ══════════════════════════════════════════════════════════════════════════
-- TEIL 0 — VORBEDINGUNGEN. Aendert nichts. Bricht bei Abweichung ab.
-- ══════════════════════════════════════════════════════════════════════════
DO $vor$
DECLARE
  fehler text[] := '{}';
  n_ziel integer;
BEGIN
  -- 0.1 Sind wir ueberhaupt in dieser Anwendung?
  IF to_regclass('public.profiles') IS NULL THEN
    fehler := fehler || 'public.profiles fehlt — falsche Datenbank?';
  END IF;
  IF to_regclass('public.billing_audit_trail') IS NULL THEN
    fehler := fehler || 'public.billing_audit_trail fehlt — falsche Datenbank?';
  END IF;

  -- 0.2 Der gesamte profiles-Fix haengt daran, dass is_admin() die Policies
  --     UMGEHT (SECURITY DEFINER). Waere sie das nicht, wuerde TEIL 3 die
  --     Rekursion nicht beseitigen, sondern nur verschieben.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'is_admin' AND p.prosecdef
  ) THEN
    fehler := fehler || 'public.is_admin() fehlt oder ist nicht SECURITY DEFINER — '
                     || 'TEIL 3 wuerde den Admin-Zugriff auf profiles kappen.';
  END IF;

  -- 0.3 Nach dem Drop der offenen Policies muessen die Ersatzpfade stehen.
  --     Sonst saehe niemand mehr sein eigenes Profil.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='profiles'
      AND policyname = 'profiles_select_own'
  ) THEN
    fehler := fehler || 'Policy profiles_select_own fehlt — Selbstlesepfad waere weg.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='profiles'
      AND policyname = 'Admins can manage all profiles'
  ) THEN
    fehler := fehler || 'Policy "Admins can manage all profiles" fehlt — Admin-Pfad waere weg.';
  END IF;

  -- 0.3b TEIL 3b entfernt die rekursive bookings-Alt-Policy. Der Ersatz
  --      bookings_admin (USING is_admin()) muss vorher stehen.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='bookings'
      AND policyname = 'bookings_admin'
  ) THEN
    fehler := fehler || 'Policy bookings_admin fehlt — TEIL 3b wuerde den '
                     || 'Admin-Zugriff auf bookings kappen.';
  END IF;

  -- 0.4 TEIL 2 muss auch wirklich etwas zu tun finden. Ein stiller No-Op
  --     waere schlimmer als ein Abbruch: er sieht aus wie Erfolg.
  SELECT count(*) INTO n_ziel
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname IN (
    'wf_emit_event','wf_process_event','wf_execute_queue_item',
    'wf_process_pending','wf_check_fristen','next_billing_number');
  IF n_ziel = 0 THEN
    fehler := fehler || 'Keine der sechs SECURITY-DEFINER-Zielfunktionen gefunden.';
  END IF;

  IF array_length(fehler, 1) > 0 THEN
    RAISE EXCEPTION E'ABBRUCH — Vorbedingungen nicht erfuellt. Es wurde NICHTS geaendert:\n  - %',
      array_to_string(fehler, E'\n  - ');
  END IF;

  RAISE NOTICE 'TEIL 0: Vorbedingungen erfuellt (% Zielfunktionen gefunden).', n_ziel;
END $vor$;


-- ══════════════════════════════════════════════════════════════════════════
-- TEIL 1 — SQL-Ausfuehrungs-RPC schliessen        (Migration 20260817010000)
--
-- Live nachgewiesen am 09.08.2026 mit dem OEFFENTLICHEN anon-Key:
--   POST /rest/v1/rpc/_run_sql {"p":"SELECT 1"}      -> HTTP 204
--   POST /rest/v1/rpc/_run_sql {"p":"SELEKT kaputt"} -> 400 / 42601 syntax error
--   GET  /rest/v1/_sql_parts?select=*                -> HTTP 200
-- Body der Funktion: BEGIN EXECUTE p; END  — also beliebiges SQL.
-- SECURITY INVOKER, nicht DEFINER: keine Superuser-Uebernahme, aber die
-- vollen anon-Rechte ohne den Umweg ueber PostgREST.
-- ══════════════════════════════════════════════════════════════════════════
DO $t1$
DECLARE sig text; n integer := 0;
BEGIN
  FOR sig IN
    SELECT p.oid::regprocedure::text
    FROM pg_proc p JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
    WHERE nsp.nspname = 'public' AND p.proname = '_run_sql'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', sig);
    -- service_role ausdruecklich behalten (Apply-Weg), unabhaengig von PUBLIC.
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', sig);
    EXECUTE format(
      $c$COMMENT ON FUNCTION %s IS
        'Fuehrt beliebiges SQL aus. NUR service_role. EXECUTE fuer anon und '
        'authenticated am 2026-08-17 entzogen (war live offen). Nicht wieder oeffnen.'$c$, sig);
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'TEIL 1: % Signatur(en) von _run_sql abgesichert.', n;
END $t1$;

-- Hilfstabelle: RLS an, Grants weg. KEIN DROP — die Tabelle bleibt stehen.
DO $t1b$
BEGIN
  IF to_regclass('public._sql_parts') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public._sql_parts ENABLE ROW LEVEL SECURITY';
    EXECUTE 'REVOKE ALL ON TABLE public._sql_parts FROM PUBLIC';
    EXECUTE 'REVOKE ALL ON TABLE public._sql_parts FROM anon';
    EXECUTE 'REVOKE ALL ON TABLE public._sql_parts FROM authenticated';
    EXECUTE $c$COMMENT ON TABLE public._sql_parts IS
      'Werkzeug-Rest eines frueheren SQL-Apply-Wegs. Kein Fachdatenbestand. '
      'Seit 2026-08-17 ohne Grants fuer anon/authenticated und mit RLS.'$c$;
    RAISE NOTICE 'TEIL 1: _sql_parts geschlossen (RLS an, Grants entzogen).';
  END IF;
END $t1b$;


-- ══════════════════════════════════════════════════════════════════════════
-- TEIL 2 — SECURITY-DEFINER-RPCs schliessen       (Migration 20260817030000)
--
-- Sechs Funktionen sind SECURITY DEFINER (laufen als postgres, umgehen JEDE
-- RLS), nehmen die Mandanten-ID als PARAMETER und pruefen im Body KEINE
-- Berechtigung — und anon darf sie ausfuehren. Live ueber
-- has_function_privilege('anon', ...) = true nachgewiesen.
--
--   next_billing_number(p_org_id,..)  zaehlt den Rechnungsnummernkreis eines
--       FREI WAEHLBAREN Mandanten hoch -> Luecken in der fortlaufenden
--       Nummer (§14 Abs. 4 UStG, GoBD-Vollstaendigkeit).
--   wf_emit_event(p_organization_id,..)  schreibt frei bestimmbare Zeilen in
--       wf_events UND wf_audit_log jedes Mandanten.
--   wf_process_pending()/wf_execute_queue_item()  arbeiten die Warteschlange
--       als postgres ab und legen dabei ops_aufgaben, ops_benachrichtigungen
--       und ops_wiedervorlagen mandantenweit an der RLS vorbei an.
--
-- URSACHE: 20260813010000_workflow_engine.sql enthaelt kein einziges GRANT.
-- Die Rechte kommen aus den Default-Privileges von Supabase, die im Schema
-- public EXECUTE an anon und authenticated erteilen.
--
-- GEFAHRLOS, weil alle Produktionsaufrufer service_role nutzen:
--   app/api/ops/workflow/events/route.ts       createAdminClient()
--   app/api/ops/workflow/processing/route.ts   createAdminClient()
--   lib/billing/core/invoice-engine.ts         nur aus __tests__ importiert,
--       zusaetzlich mit Fallback bei RPC-Fehler (Zeile 409-412)
--   Einziger Browser-RPC im Repo: get_emergency_info_with_pin — nicht betroffen.
-- ══════════════════════════════════════════════════════════════════════════
DO $t2$
DECLARE sig text; n integer := 0;
BEGIN
  FOR sig IN
    SELECT p.oid::regprocedure::text
    FROM pg_proc p JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
    WHERE nsp.nspname = 'public' AND p.proname IN (
      'wf_emit_event','wf_process_event','wf_execute_queue_item',
      'wf_process_pending','wf_check_fristen','next_billing_number')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', sig);
    EXECUTE format(
      $c$COMMENT ON FUNCTION %s IS
        'SECURITY DEFINER ohne Berechtigungspruefung im Body und mit '
        'Mandanten-ID als Parameter. Ausfuehrung NUR service_role. EXECUTE '
        'fuer anon/authenticated am 2026-08-17 entzogen. Nicht wieder oeffnen.'$c$, sig);
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'TEIL 2: % SECURITY-DEFINER-RPC(s) auf service_role beschraenkt.', n;
END $t2$;

-- Zusatzhaertung: SECURITY-DEFINER-Funktionen ohne gesetztes search_path.
-- Nicht akut ausnutzbar (anon hat kein CREATE in public), aber Standardschutz
-- gegen search_path-Hijacking. Betrifft drei Triggerfunktionen.
DO $t2b$
DECLARE sig text; n integer := 0;
BEGIN
  FOR sig IN
    SELECT p.oid::regprocedure::text
    FROM pg_proc p JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
    WHERE nsp.nspname = 'public' AND p.prosecdef
      AND NOT EXISTS (
        SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) c WHERE c LIKE 'search_path=%')
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path TO public, pg_temp', sig);
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'TEIL 2: search_path bei % Funktion(en) nachgezogen.', n;
END $t2b$;


-- ══════════════════════════════════════════════════════════════════════════
-- TEIL 3 — profiles-RLS                           (Migration 20260815010000)
--
-- Zwei Befunde, die NUR GEMEINSAM behoben werden duerfen:
--
--   1) Totalblockade. Jeder Nicht-service_role-Zugriff auf profiles liefert
--      42P17 "infinite recursion detected in policy". Ursache ist die
--      Alt-Policy "Admin profilleri yönetebilir" (FOR ALL) mit einer
--      profiles-Subquery IN einer profiles-Policy.
--
--   2) Darunter liegt ein anon-Leseleck. Sobald (1) faellt, greifen zwei
--      permissive SELECT-Policies fuer die Rolle `public` (schliesst anon EIN):
--        "Herkes profilleri okuyabilir"    USING (true)
--        "Anyone can view public profiles" USING (deleted_at IS NULL)
--      Wirkung: unangemeldetes Lesen ALLER Profilzeilen inkl. email, phone,
--      postal_code, location. DSGVO Art. 5/32.
--
--   >>> Wer nur (1) behebt, OEFFNET das Leck. Wer nur (2) dropt, laesst die
--   >>> Blockade stehen. Deshalb beides hier, in derselben Transaktion.
--
-- Verbleibende Lesepfade nach dem Drop (alle live vorhanden):
--   profiles_select_own              auth.uid() = id
--   profiles_select_admin            is_admin()
--   profiles_select_engels           authenticated AND role='engel' AND nicht geloescht
--   profiles_select_booking_partner  Buchungs-/Krankenfahrt-Gegenpart
-- Anonyme verlieren jeden Lesezugriff — im Code existiert kein anon-Lesepfad
-- auf profiles. Login/Registrierung sind nicht betroffen: der Profil-Upsert
-- laeuft ueber profiles_insert WITH CHECK (auth.uid() = id), der Read nach
-- signIn ueber profiles_select_own — beides erst NACH Session-Aufbau.
--
-- KEINE Datenaenderung: es werden ausschliesslich Policies entfernt.
-- ══════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Admin profilleri yönetebilir"    ON public.profiles;  -- Rekursion
DROP POLICY IF EXISTS "Herkes profilleri okuyabilir"    ON public.profiles;  -- USING (true)
DROP POLICY IF EXISTS "Anyone can view public profiles" ON public.profiles;  -- anon-Leseleck

-- Sicherheitsnetz: die Ersatzpfade werden angelegt, falls sie wider Erwarten
-- fehlen. (TEIL 0 hat sie bereits geprueft — das hier faengt Nebenlaeufigkeit ab.)
DO $t3$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                  AND tablename='profiles' AND policyname='Admins can manage all profiles') THEN
    CREATE POLICY "Admins can manage all profiles" ON public.profiles
      FOR ALL USING (public.is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                  AND tablename='profiles' AND policyname='profiles_select_own') THEN
    CREATE POLICY profiles_select_own ON public.profiles
      FOR SELECT USING (auth.uid() = id);
  END IF;
  RAISE NOTICE 'TEIL 3: profiles-Policies bereinigt (anon-Leck).';
END $t3$;


-- ══════════════════════════════════════════════════════════════════════════
-- TEIL 3b — bookings: die TRANSITIVE 42P17-Rekursion  (Migr. 20260817040000)
--
-- Nach dem Apply von TEIL 3 liefert profiles fuer anon WEITER 42P17 — live
-- nachgemessen am 09.08.2026, 12:05. Die Diagnose in 20260815010000 war
-- unvollstaendig: der Zyklus laeuft nicht innerhalb von profiles, sondern
-- ueber eine zweite Tabelle.
--
--   profiles.profiles_select_booking_partner
--       USING (... EXISTS (SELECT 1 FROM bookings b
--                          WHERE b.customer_id = profiles.id ...))
--                                   │  loest die RLS von bookings aus
--                                   ▼
--   bookings."Admin bookingleri yönetebilir"  FOR ALL
--       USING (EXISTS (SELECT 1 FROM profiles
--                      WHERE profiles.id = auth.uid() AND role = 'admin'))
--                                   │  ruft die profiles-Policies erneut auf
--                                   ══> Rekursion
--
-- Exakt dieselbe Anti-Pattern wie die in TEIL 3 entfernte Policy
-- "Admin profilleri yönetebilir", nur eine Tabelle weiter.
--
-- Der Ersatz steht bereits und ist aktiv: bookings_admin USING (is_admin()).
-- is_admin() ist SECURITY DEFINER -> umgeht die Policies -> kein Zyklus.
-- Sie deckt MEHR ab als die Alt-Policy, nicht weniger:
--     Alt:  role = 'admin'
--     Neu:  role IN ('admin','superadmin') AND deleted_at IS NULL
--
-- SYSTEMISCH (hier bewusst NICHT mitbehoben): 74 Policies auf 70 Tabellen
-- enthalten eine profiles-Subquery. Jede ist eine schlafende Rekursionsquelle,
-- die zuendet, sobald eine profiles-Policy die Tabelle abfragt. Aktuell zuendet
-- nur bookings. Die restlichen 73 sind eine eigene Aenderung mit eigener
-- Testmatrix und gehoeren nicht in einen P0-Hotfix.
-- ══════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Admin bookingleri yönetebilir" ON public.bookings;

DO $t3b$
BEGIN
  RAISE NOTICE 'TEIL 3b: rekursive bookings-Alt-Policy entfernt.';
END $t3b$;


-- ══════════════════════════════════════════════════════════════════════════
-- TEIL 4 — Audit-Probe-Zeile dokumentieren        (Migration 20260817020000)
--
-- billing_audit_trail enthaelt GENAU EINE Zeile (live geprueft):
--   e9c8908f-8d54-4d15-9aba-22096eef5efb, action '__probe__', checksum 'probe',
--   entity_type 'dta_ruecklaeufer', created_at 2026-08-08T21:02:59Z
-- Herkunft: Kontrollversuch aus der Analyse zum CHECK-Constraint 23514
-- (Commit 9ce1c59). Kein Geschaeftsvorfall. Alle Lesepfade filtern sie heraus.
--
-- SIE WIRD BEWUSST NICHT GELOESCHT. trg_audit_trail_no_update und
-- trg_audit_trail_no_delete werfen bedingungslos eine Exception — ohne
-- Ausnahme fuer service_role. Ein DELETE waere nur moeglich, wenn man den
-- Immutabilitaetsschutz vorher abschaltet. Ein Audit-Trail, dessen Schutz
-- sich fuer eine unbequeme Zeile abschalten laesst, ist keiner mehr.
-- Der Schutz ist mehr wert als die Sauberkeit dieser einen Zeile.
--
-- Diese Migration aendert daher KEINE Zeile und KEINEN Trigger — nur einen
-- Kommentar, damit die Einordnung bei jeder kuenftigen Pruefung an der
-- Quelle steht.
-- ══════════════════════════════════════════════════════════════════════════
COMMENT ON TABLE public.billing_audit_trail IS
  'Revisionssicherer Abrechnungs-Audit-Trail. Append-only: '
  'trg_audit_trail_no_update / trg_audit_trail_no_delete blockieren jedes '
  'UPDATE und DELETE bedingungslos. '
  'BEKANNTES SYSTEMEREIGNIS: die Zeile '
  'e9c8908f-8d54-4d15-9aba-22096eef5efb (action = ''__probe__'', '
  'checksum = ''probe'', entity_id = 00000000-0000-4000-8000-000000000001, '
  'created_at 2026-08-08T21:02:59Z) ist kein Geschaeftsvorfall, sondern der '
  'Kontrollversuch aus der Fehleranalyse zum CHECK-Constraint 23514 '
  '(Commit 9ce1c59). Sie bleibt bewusst stehen, weil ihre Entfernung das '
  'Abschalten des Immutabilitaetsschutzes voraussetzen wuerde. '
  'Auswertungen erkennen sie an action = ''__probe__''.';

COMMIT;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  ERGEBNISABFRAGE — laeuft automatisch mit, aendert nichts                 ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- (1) Alle sensiblen Funktionen: anon und auth MUESSEN false sein, svc true.
SELECT
  p.proname                                              AS funktion,
  has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated,
  has_function_privilege('service_role',  p.oid, 'EXECUTE') AS service_role,
  CASE WHEN has_function_privilege('anon', p.oid, 'EXECUTE')
         OR has_function_privilege('authenticated', p.oid, 'EXECUTE')
       THEN '!!! OFFEN' ELSE 'ok' END                    AS befund
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname IN (
  '_run_sql','wf_emit_event','wf_process_event','wf_execute_queue_item',
  'wf_process_pending','wf_check_fristen','next_billing_number')
ORDER BY 1;

-- (2) _sql_parts: RLS muss an sein, anon darf nichts.
SELECT c.relname                                      AS tabelle,
       c.relrowsecurity                               AS rls_aktiv,
       has_table_privilege('anon', c.oid, 'SELECT')   AS anon_select,
       CASE WHEN c.relrowsecurity AND NOT has_table_privilege('anon', c.oid, 'SELECT')
            THEN 'ok' ELSE '!!! OFFEN' END            AS befund
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = '_sql_parts';

-- (3) Die vier Alt-Policies MUESSEN alle mit 'entfernt' dastehen.
SELECT t.tabelle, t.policy,
       CASE WHEN EXISTS (
              SELECT 1 FROM pg_policies p
              WHERE p.schemaname = 'public' AND p.tablename = t.tabelle
                AND p.policyname = t.policy)
            THEN '!!! STEHT NOCH' ELSE 'entfernt' END AS befund
FROM (VALUES
  ('profiles', 'Admin profilleri yönetebilir'),     -- Rekursion (direkt)
  ('profiles', 'Herkes profilleri okuyabilir'),     -- anon-Leseleck USING(true)
  ('profiles', 'Anyone can view public profiles'),  -- anon-Leseleck
  ('bookings', 'Admin bookingleri yönetebilir')     -- Rekursion (transitiv)
) AS t(tabelle, policy);

-- (4) Die Ersatzpfade MUESSEN alle mit 'vorhanden' dastehen.
SELECT t.tabelle, t.policy,
       CASE WHEN EXISTS (
              SELECT 1 FROM pg_policies p
              WHERE p.schemaname = 'public' AND p.tablename = t.tabelle
                AND p.policyname = t.policy)
            THEN 'vorhanden' ELSE '!!! FEHLT' END AS befund
FROM (VALUES
  ('profiles', 'profiles_select_own'),
  ('profiles', 'Admins can manage all profiles'),
  ('bookings', 'bookings_admin')
) AS t(tabelle, policy);
