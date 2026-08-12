-- ═══════════════════════════════════════════════════════════════════════════════
-- STAGING COMPLETE MIGRATION — Alltagsengel UG
-- Datum: 2026-08-10
-- Branch: staging/expansion-abnahme
-- Projekt: nnwyktkqibdjxgimjyuq
-- 
-- 20 Migrationen in 4 Phasen, alle idempotent.
-- Kann bei Fehler erneut ausgefuehrt werden.
-- ═══════════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════════
-- PHASE 1 — Security (5 Migrationen)
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── Migration 1/20: 20260817010000_sql_exec_rpc_absichern.sql ──────────────

-- ════════════════════════════════════════════════════════════════════════════
-- Migration: P0 — die SQL-Ausfuehrungs-RPC public._run_sql ist fuer die Rolle
--            `anon` ausfuehrbar. Der anon-Key steht in jedem Browser-Bundle.
-- Datum:     2026-08-17
-- Branch:    staging/expansion-abnahme
--
-- BEFUND (live gemessen gegen nnwyktkqibdjxgimjyuq am 09.08.2026)
--
--   In der Live-Datenbank existieren zwei Objekte, die in keiner Migration
--   dieses Repos stehen — Werkzeug-Reste eines frueheren Apply-Wegs:
--
--       public._run_sql(p text)            -- fuehrt beliebiges SQL aus
--       public._sql_parts(id int, part text)  -- Ablage fuer zerlegtes SQL
--
--   Beide sind oeffentlich erreichbar. Mit dem PUBLIC-Anon-Key gemessen:
--
--       POST /rest/v1/rpc/_run_sql  {"p":"SELECT 1"}      -> HTTP 204
--       POST /rest/v1/rpc/_run_sql  {"p":"SELEKT kaputt"} -> HTTP 400
--                {"code":"42601","message":"syntax error at or near \"SELEKT\""}
--       GET  /rest/v1/_sql_parts?select=*                 -> HTTP 200
--
--   Der Parser wird also erreicht: `anon` kann beliebiges SQL absetzen.
--
--   ENTWARNUNG ZUR TIEFE, KEINE ZUR SACHE: die Funktion laeuft als INVOKER,
--   nicht als DEFINER — gemessen an
--       POST ... {"p":"SELECT 1 FROM auth.users LIMIT 1"} -> HTTP 401
--                {"code":"42501","message":"permission denied for table users"}
--   Es ist also KEINE Superuser-Uebernahme. Ein anonymer Aufrufer bekommt
--   aber die vollen Rechte der Rolle `anon` OHNE den Umweg ueber PostgREST:
--     - beliebige SELECT/INSERT/UPDATE/DELETE, soweit Grants + RLS es zulassen
--     - Umgehung jeder Absicherung, die nur in der API-Schicht sitzt
--     - Fehlermeldungen als Lese-Orakel (Cast-Fehler geben Werte preis)
--     - pg_sleep / teure Queries als DoS gegen die Produktionsdatenbank
--
--   `public._sql_parts` hat zusaetzlich RLS AUS (einzige Tabelle im Schema
--   ohne RLS, gemessen ueber audit_rls_all_status: 201 Tabellen, 1 ohne RLS).
--
-- FIX — minimal und nicht zerstoerend:
--   Es wird NICHTS geloescht. Weder die Funktion noch die Tabelle noch eine
--   Zeile. Entzogen wird ausschliesslich der Zugriff der oeffentlichen Rollen.
--   `service_role` behaelt alles — dieser Schluessel hat ohnehin Vollzugriff,
--   ueber ihn entsteht keine zusaetzliche Angriffsflaeche.
--
-- Idempotent. Rollback: 20260817010001_rollback_sql_exec_rpc_absichern.sql
-- ════════════════════════════════════════════════════════════════════════════


-- ── 1) EXECUTE auf jeder Signatur von public._run_sql entziehen ─────────────
-- Ueber pg_proc, weil die Signatur nicht aus dem Repo bekannt ist (die
-- Funktion wurde ausserhalb der Migrationen angelegt) und es Overloads
-- geben kann.
DO $$
DECLARE
  sig text;
  FOR sig IN
    SELECT p.oid::regprocedure::text
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = '_run_sql'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', sig);
    RAISE NOTICE 'EXECUTE entzogen: %', sig;
  END LOOP;
END $$;

-- ── 2) public._sql_parts: RLS einschalten und Grants entziehen ──────────────
-- Kein DROP: die Tabelle bleibt bestehen (Vorgabe „keine Tabellen loeschen").
-- Ohne Policy und ohne Grant ist sie fuer anon/authenticated unerreichbar;
-- service_role umgeht RLS ohnehin.
DO $$
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = '_sql_parts' AND c.relkind = 'r'
  ) THEN
    EXECUTE 'ALTER TABLE public._sql_parts ENABLE ROW LEVEL SECURITY';
    EXECUTE 'REVOKE ALL ON TABLE public._sql_parts FROM PUBLIC';
    EXECUTE 'REVOKE ALL ON TABLE public._sql_parts FROM anon';
    EXECUTE 'REVOKE ALL ON TABLE public._sql_parts FROM authenticated';
    EXECUTE $c$COMMENT ON TABLE public._sql_parts IS
      'Werkzeug-Rest eines frueheren SQL-Apply-Wegs. Kein Fachdatenbestand. '
      'Seit 20260817010000 ohne Grants fuer anon/authenticated und mit RLS. '
      'Kann geloescht werden, sobald bestaetigt ist, dass kein Apply-Weg sie nutzt.'$c$;
  END IF;
END $$;

-- ── 3) Funktion als das kennzeichnen, was sie ist ───────────────────────────
DO $$
DECLARE
  sig text;
  FOR sig IN
    SELECT p.oid::regprocedure::text
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = '_run_sql'
  LOOP
    EXECUTE format(
      $c$COMMENT ON FUNCTION %s IS
        'Fuehrt beliebiges SQL aus. NUR service_role. EXECUTE fuer anon und '
        'authenticated wurde am 2026-08-17 entzogen (war live offen). '
        'Nicht wieder oeffnen.'$c$, sig);
  END LOOP;
END $$;


-- ── VERIFIKATION nach dem Apply ─────────────────────────────────────────────
-- a) anon darf nicht mehr:  POST /rest/v1/rpc/_run_sql  {"p":"SELECT 1"}
--    erwartet 404 (nicht mehr im Schema-Cache der Rolle) oder 401/403.
--    NICHT erwartet: 204.
-- b) anon-Tabellenzugriff:  GET /rest/v1/_sql_parts?select=*  -> 401/403/404
-- c) node scripts/verify-sql-exec-abgesichert.mjs


-- ─── Migration 2/20: 20260817020000_audit_probe_zeile_dokumentieren.sql ──────────────

-- ════════════════════════════════════════════════════════════════════════════
-- Migration: Die eine Probe-Zeile in billing_audit_trail dauerhaft als
--            Systemereignis kennzeichnen — OHNE den Audit-Trail anzufassen.
-- Datum:     2026-08-17
--
-- BEFUND (live gelesen am 09.08.2026, service_role)
--
--   billing_audit_trail enthaelt GENAU EINE Zeile:
--     id              e9c8908f-8d54-4d15-9aba-22096eef5efb
--     organization_id 00000000-0000-4000-8000-000460629986  (Stamm-Org)
--     entity_type     dta_ruecklaeufer
--     entity_id       00000000-0000-4000-8000-000000000001  (Sentinel, kein
--                     realer Ruecklaeufer — dta_ruecklaeufer hat 0 Zeilen)
--     action          __probe__
--     checksum        probe
--     actor_id/-role/-ip, previous_state, new_state, reason: alle NULL
--     created_at      2026-08-08 21:02:59.757743+00
--
--   Herkunft: die Zeile entstand am 08.08.2026 beim Live-Nachweis des
--   CHECK-Constraint-Fehlers 23514 auf billing_audit_trail.entity_type
--   (behoben in Commit 9ce1c59). Sie ist der geglueckte Kontrollversuch mit
--   einem gueltigen entity_type. Kein Geschaeftsvorfall.
--
-- FACHLICHE AUSWIRKUNG: keine. Jeder Lesepfad filtert sie heraus:
--   lib/abrechnung/readiness.ts:98  .in('action', ['preflight_ausgefuehrt',
--                                                 'dry_run_ausgefuehrt'])
--   app/admin/rechnungen/[id]/page.tsx:69  filtert auf die Rechnungs-entity_id
--   app/api/billing/audit/route.ts  liefert sie nur bei ausdruecklichem
--                                   Filter entity_type=dta_ruecklaeufer
--   Sie faelscht keine Summe, keine Frist und keinen Statuswechsel.
--
-- WARUM SIE BLEIBT — die Immutabilitaet ist genau so gewollt:
--   20260806600000_audit_security.sql legt auf billing_audit_trail
--       trg_audit_trail_no_update  BEFORE UPDATE  FOR EACH ROW
--       trg_audit_trail_no_delete  BEFORE DELETE  FOR EACH ROW
--   auf public.prevent_audit_trail_mutation(), die bedingungslos
--   RAISE EXCEPTION wirft — ohne Ausnahme fuer service_role oder Superuser.
--   Ein DELETE dieser Zeile ist folglich NUR moeglich, wenn man den
--   Immutabilitaetsschutz vorher abschaltet. Genau das darf nicht passieren:
--   ein Audit-Trail, dessen Schutz sich fuer eine unbequeme Zeile abschalten
--   laesst, ist kein revisionssicherer Audit-Trail mehr. Der Schutz ist
--   wertvoller als die Sauberkeit dieser einen Zeile.
--
-- Diese Migration aendert deshalb KEINE Zeile, KEINEN Trigger und KEINE
-- Policy. Sie schreibt die Einordnung als Tabellenkommentar in die Datenbank,
-- damit sie bei jeder kuenftigen Pruefung an der Quelle steht.
-- ════════════════════════════════════════════════════════════════════════════

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

-- Kein COMMIT-Block noetig: ein einzelnes COMMENT ist atomar.
-- Rollback: 20260817020001_rollback_audit_probe_zeile_dokumentieren.sql


-- ─── Migration 3/20: 20260817030000_secdef_rpc_haertung.sql ──────────────

-- ════════════════════════════════════════════════════════════════════════════
-- Migration: P0 — SECURITY-DEFINER-RPCs der Workflow-Engine und der
--            Rechnungsnummern-Vergabe sind fuer `anon` aufrufbar.
-- Datum:     2026-08-17
-- Branch:    staging/expansion-abnahme
--
-- BEFUND (live gemessen gegen nnwyktkqibdjxgimjyuq am 09.08.2026, ueber
--         pg_proc/has_function_privilege — Katalogwahrheit, keine Vermutung)
--
--   Sechs Funktionen sind SECURITY DEFINER (laufen also als `postgres` und
--   umgehen JEDE RLS-Policy), nehmen die Mandanten-ID als PARAMETER entgegen
--   und pruefen KEINE Berechtigung im Body. Gleichzeitig darf `anon` sie
--   ausfuehren — der anon-Key steht in jedem Browser-Bundle:
--
--     has_function_privilege('anon', ..., 'EXECUTE') = true fuer
--       public.wf_emit_event(uuid,text,text,text,uuid,jsonb,text,text,uuid)
--       public.wf_process_event(uuid)
--       public.wf_execute_queue_item(uuid)
--       public.wf_process_pending(integer)
--       public.wf_check_fristen()
--       public.next_billing_number(uuid,text,integer)
--
--   Konkrete Wirkung ohne jede Anmeldung:
--
--   a) next_billing_number(p_org_id) macht ein INSERT .. ON CONFLICT DO
--      UPDATE last_number = last_number + 1 auf billing_number_sequences —
--      fuer eine FREI WAEHLBARE organization_id. Ein anonymer Aufrufer kann
--      den Rechnungsnummernkreis eines beliebigen Mandanten hochzaehlen.
--      Folge: Luecken in der fortlaufenden Rechnungsnummer (§14 Abs. 4 UStG,
--      GoBD-Grundsatz der Vollstaendigkeit).
--
--   b) wf_emit_event(p_organization_id, ...) schreibt frei bestimmbare Zeilen
--      nach wf_events UND nach wf_audit_log — in JEDEN Mandanten. Das ist
--      Fremdbeschreibung des Audit-Logs durch einen Unangemeldeten.
--
--   c) wf_process_pending()/wf_execute_queue_item() arbeiten die Warte-
--      schlange ab und legen dabei als `postgres` Zeilen in ops_aufgaben,
--      ops_benachrichtigungen und ops_wiedervorlagen an — mandantenweit,
--      an der RLS vorbei. In Kombination mit (b): Event einschleusen,
--      Verarbeitung anstossen, Schreibvorgang im fremden Mandanten ausloesen.
--
--   URSACHE — kein Einzelfehler, sondern eine Luecke im Standardverhalten:
--   20260813010000_workflow_engine.sql enthaelt KEIN einziges GRANT. Die
--   Rechte stammen aus den Default-Privileges von Supabase, die im Schema
--   `public` EXECUTE an anon und authenticated erteilen. Jede Funktion, die
--   nicht ausdruecklich zurueckgenommen wird, ist damit oeffentlich.
--   Die neueren Funktionen machen es richtig und dienen hier als Referenz:
--       update_state_settings, claim_waitlist_batch,
--       activate_insurance_billing, deactivate_insurance_billing
--           -> anon=false, authenticated=false  (live geprueft)
--
-- WARUM DER ENTZUG GEFAHRLOS IST — alle Produktionsaufrufer laufen ueber
-- service_role, nicht ueber anon/authenticated (im Code nachgewiesen):
--     app/api/ops/workflow/events/route.ts:10,30      createAdminClient()
--     app/api/ops/workflow/processing/route.ts:9      createAdminClient()
--         -> lib/workflow/events.ts:53   rpc('wf_emit_event')
--         -> lib/workflow/processing.ts:20,28  rpc('wf_process_pending'),
--                                              rpc('wf_check_fristen')
--     lib/billing/core/invoice-engine.ts:402  rpc('next_billing_number')
--         invoice-engine wird ausserhalb von __tests__ nirgends importiert;
--         zusaetzlich faengt generateInvoiceNumber() einen RPC-Fehler ab und
--         weicht auf generateInvoiceNumberFallback() aus (Zeile 409-412).
--         Selbst ein uebersehener Pfad bricht also nicht, sondern degradiert.
--     Browserseitig existiert genau EIN .rpc()-Aufruf im gesamten Repo:
--         app/notfall/[id]/page.tsx:84  get_emergency_info_with_pin
--     — der ist absichtlich anon-faehig (PIN-gated) und wird NICHT angefasst.
--
-- FIX: Rechteentzug fuer die oeffentlichen Rollen, expliziter GRANT an
--      service_role. Es wird KEINE Funktion geloescht, KEIN Body geaendert,
--      KEINE Zeile angefasst.
--
-- ZUSATZ: drei SECURITY-DEFINER-Triggerfunktionen laufen ohne gesetztes
--      search_path (check_aufgabe_eskalation, create_recurring_aufgabe,
--      log_arbeitszeit_korrektur). Das ist nicht akut ausnutzbar — anon hat
--      kein CREATE im Schema public — aber es ist der Standardschutz gegen
--      search_path-Hijacking und wird hier nachgezogen.
--
-- Idempotent. Rollback: 20260817030001_rollback_secdef_rpc_haertung.sql
-- ════════════════════════════════════════════════════════════════════════════


-- ── 1) Oeffentliche Ausfuehrungsrechte auf den sechs RPCs entziehen ─────────
-- Ueber pg_proc statt fester Signaturen: haelt auch, wenn eine Funktion
-- ueberladen ist oder die Signatur sich aendert.
DO $$
DECLARE
  sig text;
  n   integer := 0;
  FOR sig IN
    SELECT p.oid::regprocedure::text
    FROM pg_proc p
    JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
    WHERE nsp.nspname = 'public'
      AND p.proname IN (
        'wf_emit_event',
        'wf_process_event',
        'wf_execute_queue_item',
        'wf_process_pending',
        'wf_check_fristen',
        'next_billing_number'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', sig);
    -- service_role ausdruecklich behalten: der Grant darf nicht davon
    -- abhaengen, dass PUBLIC das Recht hat (PUBLIC wird oben entzogen).
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', sig);
    n := n + 1;
    RAISE NOTICE 'abgesichert: %', sig;
  END LOOP;

  IF n = 0 THEN
    RAISE EXCEPTION 'Keine der sechs Zielfunktionen gefunden — falsche '
                    'Datenbank oder Schema? Abbruch statt stiller No-Op.';
  END IF;
  RAISE NOTICE '% Funktion(en) abgesichert', n;
END $$;

-- ── 2) search_path bei SECURITY-DEFINER-Triggerfunktionen nachziehen ────────
DO $$
DECLARE
  sig text;
  FOR sig IN
    SELECT p.oid::regprocedure::text
    FROM pg_proc p
    JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
    WHERE nsp.nspname = 'public'
      AND p.prosecdef
      AND NOT EXISTS (
        SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) c
        WHERE c LIKE 'search_path=%'
      )
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path TO public, pg_temp', sig);
    RAISE NOTICE 'search_path gesetzt: %', sig;
  END LOOP;
END $$;

-- ── 3) Absicht dokumentieren, damit der naechste Apply-Weg es nicht kippt ───
DO $$
DECLARE
  sig text;
  FOR sig IN
    SELECT p.oid::regprocedure::text
    FROM pg_proc p
    JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
    WHERE nsp.nspname = 'public'
      AND p.proname IN (
        'wf_emit_event', 'wf_process_event', 'wf_execute_queue_item',
        'wf_process_pending', 'wf_check_fristen', 'next_billing_number'
      )
  LOOP
    EXECUTE format(
      $c$COMMENT ON FUNCTION %s IS
        'SECURITY DEFINER ohne Berechtigungspruefung im Body und mit '
        'Mandanten-ID als Parameter. Ausfuehrung deshalb NUR service_role. '
        'EXECUTE fuer anon/authenticated am 2026-08-17 entzogen '
        '(Migration 20260817030000). Nicht wieder oeffnen — der Aufruf '
        'gehoert hinter requireOpsAdmin() in einer API-Route.'$c$, sig);
  END LOOP;
END $$;


-- ── VERIFIKATION nach dem Apply ─────────────────────────────────────────────
-- SELECT p.proname,
--        has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon,
--        has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth,
--        has_function_privilege('service_role',  p.oid, 'EXECUTE') AS svc
-- FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public'
--   AND p.proname IN ('wf_emit_event','wf_process_event','wf_execute_queue_item',
--                     'wf_process_pending','wf_check_fristen','next_billing_number');
-- Erwartet: anon = false, auth = false, svc = true fuer alle sechs.
--
-- node scripts/verify-secdef-rpc-haertung.mjs


-- ─── Migration 4/20: 20260817030002_zusaetzliche_secdef_haertung.sql ──────────────

-- ════════════════════════════════════════════════════════════════════════════
-- Migration: Zusätzliche Härtung — kassenabrechnung_erlaubt und
--            bundesland_fuer_plz: EXECUTE für anon entziehen.
-- Datum:     2026-08-09
-- Branch:    staging/expansion-abnahme
--
-- BEFUND (live gemessen gegen nnwyktkqibdjxgimjyuq am 09.08.2026)
--
--   Beide Funktionen sind SECURITY DEFINER und waren für anon aufrufbar.
--   Keine der beiden wird in RLS-Policies referenziert.
--
--   kassenabrechnung_erlaubt(uuid, text):
--     Prüft ob Kassenabrechnung für eine Organisation erlaubt ist.
--     SECURITY DEFINER mit Mandanten-ID als Parameter — anon könnte
--     Abrechnungsstatus beliebiger Organisationen abfragen.
--
--   bundesland_fuer_plz(text):
--     PLZ-Lookup, gibt Bundesland zurück. Öffentliche Referenzdaten,
--     aber als SECURITY DEFINER unnötig privilegiert für anon.
--     eindeutiges_bundesland_fuer_plz(text) existiert als INVOKER-Alternative.
--
-- FIX: REVOKE für anon, GRANT für authenticated + service_role.
-- Idempotent. Auf Production am 09.08.2026 bereits live angewendet.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  sig text;
  n   integer := 0;
BEGIN
  FOR sig IN
    SELECT p.oid::regprocedure::text
    FROM pg_proc p
    JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
    WHERE nsp.nspname = 'public'
      AND p.proname IN ('kassenabrechnung_erlaubt', 'bundesland_fuer_plz')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', sig);
    n := n + 1;
    RAISE NOTICE 'abgesichert: %', sig;
  END LOOP;

  IF n = 0 THEN
    RAISE EXCEPTION 'Keine der zwei Zielfunktionen gefunden — Abbruch.';
  END IF;
  RAISE NOTICE '% Funktion(en) abgesichert', n;
END $$;

-- Rollback: GRANT EXECUTE ON FUNCTION kassenabrechnung_erlaubt(uuid,text) TO anon;
--           GRANT EXECUTE ON FUNCTION bundesland_fuer_plz(text) TO anon;


-- ─── Migration 5/20: 20260817040000_bookings_policy_rekursion.sql ──────────────

-- ════════════════════════════════════════════════════════════════════════════
-- Migration: profiles bleibt trotz 20260815010000 unlesbar (42P17) — die
--            Rekursion laeuft TRANSITIV ueber bookings.
-- Datum:     2026-08-17
-- Branch:    staging/expansion-abnahme
--
-- BEFUND (live gemessen am 09.08.2026, NACH dem Apply von 20260815010000)
--
--   20260815010000 hat die drei profiles-Alt-Policies entfernt — live
--   bestaetigt, sie sind weg. Trotzdem liefert jeder Nicht-service_role-
--   Zugriff weiterhin:
--       GET /rest/v1/profiles?select=id,email
--       -> 500 {"code":"42P17","message":"infinite recursion detected in
--                policy for relation \"profiles\""}
--
--   Die Diagnose in 20260815010000 war unvollstaendig. Der Zyklus laeuft
--   nicht innerhalb von profiles, sondern ueber eine zweite Tabelle:
--
--       profiles.profiles_select_booking_partner
--           USING (... EXISTS (SELECT 1 FROM bookings b
--                              WHERE b.customer_id = profiles.id ...))
--                                       │
--                                       ▼  loest die RLS von bookings aus
--       bookings."Admin bookingleri yönetebilir"   FOR ALL
--           USING (EXISTS (SELECT 1 FROM profiles
--                          WHERE profiles.id = auth.uid()
--                            AND profiles.role = 'admin'))
--                                       │
--                                       ▼  ruft die profiles-Policies erneut auf
--                                  ══> Rekursion
--
--   Es ist exakt dieselbe Anti-Pattern wie die in 20260815010000 entfernte
--   Policy "Admin profilleri yönetebilir" — nur eine Tabelle weiter. Weil
--   sie FOR ALL gilt, trifft sie jedes SELECT auf bookings und damit jeden
--   profiles-Zugriff, der ueber profiles_select_booking_partner laeuft.
--
-- DER ERSATZ IST BEREITS DA UND AKTIV (live geprueft):
--       bookings.bookings_admin   FOR ALL   USING (is_admin())
--   is_admin() ist SECURITY DEFINER und umgeht die Policies -> kein Zyklus.
--   is_admin() deckt mehr ab als die Alt-Policy, nicht weniger:
--       Alt:  role = 'admin'
--       Neu:  role IN ('admin','superadmin') AND deleted_at IS NULL
--   Es geht also kein Admin-Zugriff verloren; geloeschte Admins verlieren ihn
--   zusaetzlich — das ist beabsichtigt.
--   Die Alt-Policy ist damit reine Altlast und wird entfernt.
--
-- SYSTEMISCHER BEFUND — hier NICHT mitbehoben, bewusst:
--   74 Policies auf 70 Tabellen im Schema public enthalten eine
--   profiles-Subquery (`FROM profiles`). Jede davon ist eine schlafende
--   Rekursionsquelle: sie zuendet in dem Moment, in dem eine profiles-Policy
--   die betroffene Tabelle abfragt. Aktuell zuendet nur bookings, weil nur
--   bookings von profiles_select_booking_partner aus erreicht wird
--   (krankenfahrten und krankenfahrt_providers haben keine solche Policy —
--   live geprueft).
--   Diese 73 restlichen Policies umzuschreiben ist eine eigene, groessere
--   Aenderung mit eigener Testmatrix und gehoert nicht in einen P0-Hotfix.
--   Regel fuer neue Policies: NIE `SELECT ... FROM profiles` in einer Policy,
--   immer is_admin() / is_org_member() / has_org_role() verwenden.
--
-- KEINE Datenaenderung: es wird genau eine redundante Policy entfernt.
-- Idempotent. Rollback: 20260817040001_rollback_bookings_policy_rekursion.sql
-- ════════════════════════════════════════════════════════════════════════════


-- ── Vorbedingung: der nicht-rekursive Ersatz MUSS stehen ────────────────────
-- Ohne ihn wuerde der Drop den Admin-Vollzugriff auf bookings kappen.
DO $$
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'bookings'
      AND policyname = 'bookings_admin'
  ) THEN
    RAISE EXCEPTION 'ABBRUCH: Policy bookings_admin (USING is_admin()) fehlt. '
                    'Ohne sie wuerde der Drop den Admin-Zugriff auf bookings '
                    'entfernen. Es wurde nichts geaendert.';
  END IF;
END $$;

-- ── Die rekursive Alt-Policy entfernen ──────────────────────────────────────
DROP POLICY IF EXISTS "Admin bookingleri yönetebilir" ON public.bookings;


-- ── VERIFIKATION nach dem Apply ─────────────────────────────────────────────
-- a) Rekursion weg — muss Zeilen liefern statt 42P17:
--      curl "$URL/rest/v1/profiles?select=id&limit=1" -H "apikey: $ANON" ...
--      erwartet: []  (leer, weil anon keine SELECT-Policy mehr hat)
--      NICHT erwartet: 42P17
-- b) Eingeloggter Nutzer sieht sein eigenes Profil (profiles_select_own).
-- c) Admin sieht weiterhin alle Buchungen (bookings_admin).
-- d) node scripts/verify-security-p0.mjs


-- ═══════════════════════════════════════════════════════════════════════════════
-- PHASE 2 — Module (8 Migrationen)
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── Migration 6/20: 20260818010000_sis_strukturierte_informationssammlung.sql ──────────────

-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: SIS — Strukturierte Informationssammlung
--            (Assessments + 6 Themenfelder + Risikomatrix)
-- Datum:     2026-08-18
-- Projekt:   Alltagsengel UG
-- ═══════════════════════════════════════════════════════════════════════════
-- IDEMPOTENT: Alle Statements mit IF NOT EXISTS / IF EXISTS Guards.
-- BESTEHENDE DATEN: Keine Löschung, nur neue Tabellen.
-- RLS: is_admin() (KEINE profiles-Subqueries — 42P17-Vorgeschichte),
--      org_fence RESTRICTIVE über current_org_id(), Engel-SELECT über
--      aktive assignments. anon erhält keinerlei Grants.
-- Trigger-Funktionen: LANGUAGE plpgsql, SET search_path, KEIN SECURITY DEFINER.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- TEIL 1: sis_assessments — Kopfsatz je Informationssammlung
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS sis_assessments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT current_org_id(),
  client_id       uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  assessment_datum date NOT NULL DEFAULT CURRENT_DATE,
  assessment_typ   text NOT NULL DEFAULT 'erstgespraech',
  versorgungsform  text NOT NULL DEFAULT 'ambulant',
  erhoben_von      uuid NOT NULL REFERENCES auth.users(id),

  -- Einstieg aus Sicht der pflegebedürftigen Person
  -- („Was bewegt Sie im Augenblick? Was brauchen Sie? …")
  eingangsfrage    text,

  status           text NOT NULL DEFAULT 'entwurf',
  abgeschlossen_am timestamptz,
  abgeschlossen_von uuid REFERENCES auth.users(id),
  gesperrt         boolean NOT NULL DEFAULT false,
  bemerkung        text,

  erstellt_von  uuid NOT NULL REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT sis_assessments_typ_check
    CHECK (assessment_typ IN ('erstgespraech','folgegespraech','wiederaufnahme','anlassbezogen')),
  CONSTRAINT sis_assessments_versorgungsform_check
    CHECK (versorgungsform IN ('ambulant','stationaer','tagespflege')),
  CONSTRAINT sis_assessments_status_check
    CHECK (status IN ('entwurf','abgeschlossen','gesperrt'))
);

CREATE INDEX IF NOT EXISTS idx_sis_assessments_client ON sis_assessments(client_id);
CREATE INDEX IF NOT EXISTS idx_sis_assessments_org    ON sis_assessments(organization_id);
CREATE INDEX IF NOT EXISTS idx_sis_assessments_status ON sis_assessments(status);

-- ═══════════════════════════════════════════════════════════════════════════
-- TEIL 2: sis_themenfelder — je Assessment max. 6 Themenfelder
--   1 Kognitive und kommunikative Fähigkeiten
--   2 Mobilität und Beweglichkeit
--   3 Krankheitsbezogene Anforderungen und Belastungen
--   4 Selbstversorgung
--   5 Leben in sozialen Beziehungen
--   6 Haushaltsführung (nur ambulant)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS sis_themenfelder (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT current_org_id(),
  assessment_id   uuid NOT NULL REFERENCES sis_assessments(id) ON DELETE CASCADE,

  feld_nr              integer NOT NULL,
  sicht_klient         text,   -- Wahrnehmung der pflegebedürftigen Person
  einschaetzung_pflege text,   -- fachliche Einschätzung der Pflegefachkraft
  handlungsbedarf      boolean,
  bemerkung            text,

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT sis_themenfelder_feld_nr_check CHECK (feld_nr BETWEEN 1 AND 6),
  CONSTRAINT sis_themenfelder_unique UNIQUE (assessment_id, feld_nr)
);

CREATE INDEX IF NOT EXISTS idx_sis_themenfelder_assessment ON sis_themenfelder(assessment_id);
CREATE INDEX IF NOT EXISTS idx_sis_themenfelder_org        ON sis_themenfelder(organization_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- TEIL 3: sis_risikomatrix — je Assessment 5 pflegesensitive Risiken
--   dekubitus, sturz, inkontinenz, schmerz, ernaehrung
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS sis_risikomatrix (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT current_org_id(),
  assessment_id   uuid NOT NULL REFERENCES sis_assessments(id) ON DELETE CASCADE,

  risiko                text NOT NULL,
  risiko_vorhanden      text NOT NULL DEFAULT 'unklar',  -- fachliche Ersteinschätzung
  weitere_einschaetzung boolean NOT NULL DEFAULT false,  -- vertieftes Assessment notwendig?
  bemerkung             text,

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT sis_risikomatrix_risiko_check
    CHECK (risiko IN ('dekubitus','sturz','inkontinenz','schmerz','ernaehrung')),
  CONSTRAINT sis_risikomatrix_vorhanden_check
    CHECK (risiko_vorhanden IN ('ja','nein','unklar')),
  CONSTRAINT sis_risikomatrix_unique UNIQUE (assessment_id, risiko)
);

CREATE INDEX IF NOT EXISTS idx_sis_risikomatrix_assessment ON sis_risikomatrix(assessment_id);
CREATE INDEX IF NOT EXISTS idx_sis_risikomatrix_org        ON sis_risikomatrix(organization_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- TEIL 4: updated_at-Trigger (Funktion set_updated_at() existiert bereits)
-- ═══════════════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_updated_at_sis_assessments ON sis_assessments;
CREATE TRIGGER trg_updated_at_sis_assessments BEFORE UPDATE ON sis_assessments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_updated_at_sis_themenfelder ON sis_themenfelder;
CREATE TRIGGER trg_updated_at_sis_themenfelder BEFORE UPDATE ON sis_themenfelder
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_updated_at_sis_risikomatrix ON sis_risikomatrix;
CREATE TRIGGER trg_updated_at_sis_risikomatrix BEFORE UPDATE ON sis_risikomatrix
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- TEIL 5: Sperr-Schutz — gesperrte SIS ist unveränderlich, inkl. Kindzeilen
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION prevent_locked_sis_edit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.gesperrt = true AND NEW.gesperrt = true THEN
    RAISE EXCEPTION 'Gesperrte Informationssammlung kann nicht bearbeitet werden.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_locked_sis ON sis_assessments;
CREATE TRIGGER trg_locked_sis BEFORE UPDATE ON sis_assessments
  FOR EACH ROW EXECUTE FUNCTION prevent_locked_sis_edit();

-- Kindzeilen (Themenfelder/Risikomatrix): Schreibschutz, wenn Kopfsatz gesperrt
CREATE OR REPLACE FUNCTION prevent_locked_sis_child_edit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_assessment_id uuid;
  v_gesperrt boolean;
BEGIN
  v_assessment_id := COALESCE(NEW.assessment_id, OLD.assessment_id);
  SELECT gesperrt INTO v_gesperrt FROM sis_assessments WHERE id = v_assessment_id;
  IF v_gesperrt = true THEN
    RAISE EXCEPTION 'Informationssammlung ist gesperrt — Änderung nicht möglich.';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_locked_sis_themenfelder ON sis_themenfelder;
CREATE TRIGGER trg_locked_sis_themenfelder
  BEFORE INSERT OR UPDATE OR DELETE ON sis_themenfelder
  FOR EACH ROW EXECUTE FUNCTION prevent_locked_sis_child_edit();

DROP TRIGGER IF EXISTS trg_locked_sis_risikomatrix ON sis_risikomatrix;
CREATE TRIGGER trg_locked_sis_risikomatrix
  BEFORE INSERT OR UPDATE OR DELETE ON sis_risikomatrix
  FOR EACH ROW EXECUTE FUNCTION prevent_locked_sis_child_edit();

-- ═══════════════════════════════════════════════════════════════════════════
-- TEIL 6: RLS
-- ═══════════════════════════════════════════════════════════════════════════
-- Der Engel-Zugriff läuft über einen SECURITY-DEFINER-Helper statt über eine
-- assignments-Subquery in der Policy: die assignments-Policies enthalten
-- profiles-Subqueries, und jede Policy, die assignments direkt subqueryt,
-- läuft in die bekannte 42P17-Rekursion (in der Shadow-DB reproduziert).
-- DEFINER umgeht die RLS der nachgeschlagenen Tabellen und bricht den Zyklus.

CREATE OR REPLACE FUNCTION public.engel_hat_aktiven_klienten(p_client_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM assignments a
    JOIN caregivers cg ON cg.id = a.caregiver_id
    WHERE a.client_id = p_client_id
      AND cg.user_id = auth.uid()
      AND a.status IN ('active','GEPLANT','BESTAETIGT','UNTERWEGS','GESTARTET')
  );
$$;

REVOKE ALL ON FUNCTION public.engel_hat_aktiven_klienten(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.engel_hat_aktiven_klienten(uuid) TO authenticated, service_role;

ALTER TABLE sis_assessments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE sis_themenfelder ENABLE ROW LEVEL SECURITY;
ALTER TABLE sis_risikomatrix ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  -- Admin: voller Zugriff (is_admin() statt profiles-Subquery, s. Kopfkommentar)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sis_assessments' AND policyname = 'admin_sis_assessments') THEN
    CREATE POLICY admin_sis_assessments ON sis_assessments FOR ALL
      USING (is_admin()) WITH CHECK (is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sis_themenfelder' AND policyname = 'admin_sis_themenfelder') THEN
    CREATE POLICY admin_sis_themenfelder ON sis_themenfelder FOR ALL
      USING (is_admin()) WITH CHECK (is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sis_risikomatrix' AND policyname = 'admin_sis_risikomatrix') THEN
    CREATE POLICY admin_sis_risikomatrix ON sis_risikomatrix FOR ALL
      USING (is_admin()) WITH CHECK (is_admin());
  END IF;

  -- Mandanten-Zaun (RESTRICTIVE): schneidet jede permissive Policy auf die Org
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sis_assessments' AND policyname = 'org_fence_sis_assessments') THEN
    CREATE POLICY org_fence_sis_assessments ON sis_assessments AS RESTRICTIVE FOR ALL
      USING (organization_id = current_org_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sis_themenfelder' AND policyname = 'org_fence_sis_themenfelder') THEN
    CREATE POLICY org_fence_sis_themenfelder ON sis_themenfelder AS RESTRICTIVE FOR ALL
      USING (organization_id = current_org_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sis_risikomatrix' AND policyname = 'org_fence_sis_risikomatrix') THEN
    CREATE POLICY org_fence_sis_risikomatrix ON sis_risikomatrix AS RESTRICTIVE FOR ALL
      USING (organization_id = current_org_id());
  END IF;

  -- Engel: Lesezugriff auf SIS ihrer aktiv zugewiesenen Kunden.
  -- DROP+CREATE statt IF-NOT-EXISTS: ersetzt bewusst frühere Fassungen
  -- dieser Policies (Subquery-Variante → 42P17, s. Kopfkommentar TEIL 6).
  DROP POLICY IF EXISTS engel_sis_assessments_select ON sis_assessments;
  CREATE POLICY engel_sis_assessments_select ON sis_assessments FOR SELECT
    USING (engel_hat_aktiven_klienten(client_id));

  DROP POLICY IF EXISTS engel_sis_themenfelder_select ON sis_themenfelder;
  CREATE POLICY engel_sis_themenfelder_select ON sis_themenfelder FOR SELECT
    USING (EXISTS (
      SELECT 1 FROM sis_assessments s
      WHERE s.id = assessment_id AND engel_hat_aktiven_klienten(s.client_id)
    ));

  DROP POLICY IF EXISTS engel_sis_risikomatrix_select ON sis_risikomatrix;
  CREATE POLICY engel_sis_risikomatrix_select ON sis_risikomatrix FOR SELECT
    USING (EXISTS (
      SELECT 1 FROM sis_assessments s
      WHERE s.id = assessment_id AND engel_hat_aktiven_klienten(s.client_id)
    ));
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- TEIL 7: Grants — anon hat auf SIS-Tabellen NICHTS verloren
-- (Supabase-Default-Privileges würden anon sonst Tabellenrechte geben;
--  RLS würde zwar auf 0 Zeilen schneiden, wir entziehen trotzdem hart.)
-- ═══════════════════════════════════════════════════════════════════════════

REVOKE ALL ON sis_assessments  FROM anon;
REVOKE ALL ON sis_themenfelder FROM anon;
REVOKE ALL ON sis_risikomatrix FROM anon;

-- Trigger-Funktionen nicht über PostgREST-RPC aufrufbar machen
REVOKE ALL ON FUNCTION prevent_locked_sis_edit() FROM anon, authenticated;
REVOKE ALL ON FUNCTION prevent_locked_sis_child_edit() FROM anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- TEIL 8: Dokumentation
-- ═══════════════════════════════════════════════════════════════════════════

COMMENT ON TABLE sis_assessments  IS 'SIS — Strukturierte Informationssammlung: Kopfsatz je Assessment (Eingangsfrage, Status, Sperre).';
COMMENT ON TABLE sis_themenfelder IS 'SIS-Themenfelder 1-6 (6 = Haushaltsführung nur ambulant): Sicht der Person + fachliche Einschätzung.';
COMMENT ON TABLE sis_risikomatrix IS 'SIS-Risikomatrix: Ersteinschätzung Dekubitus/Sturz/Inkontinenz/Schmerz/Ernährung + Bedarf an vertiefter Einschätzung.';


-- ─── Migration 7/20: 20260818010000_vitalwerte.sql ──────────────

-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Vitalwerte-Modul — vital_signs + vital_sign_thresholds
-- Datum:     2026-08-18
-- Projekt:   Alltagsengel UG
-- ═══════════════════════════════════════════════════════════════════════════
-- IDEMPOTENT: Alle Statements mit IF NOT EXISTS / IF EXISTS Guards.
-- BESTEHENDE DATEN: Keine Löschung, nur neue Tabellen.
-- org_fence: current_org_id() RESTRICTIVE (Konvention aus Phase 3).
-- RLS: bewusst KEINE profiles-Subqueries (42P17-Rekursionsfalle) —
--      Admin-Zugriff läuft über is_admin(), Engel über assignments.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- TEIL 1: vital_signs — Einzelmessungen
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS vital_signs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL DEFAULT current_org_id(),
  client_id        uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  -- Messung
  type             text NOT NULL,
  value            numeric(8,2) NOT NULL,
  -- Nur Blutdruck: value = systolisch, value_secondary = diastolisch
  value_secondary  numeric(8,2),
  unit             text NOT NULL,
  measured_at      timestamptz NOT NULL DEFAULT now(),
  measured_by      uuid NOT NULL REFERENCES auth.users(id),
  measured_by_name text,
  measured_by_role text,
  notes            text,

  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT vital_signs_type_check CHECK (type IN (
    'blutdruck','puls','temperatur','blutzucker','spo2',
    'gewicht','atemfrequenz','schmerz','trinkmenge','ausscheidung'
  )),
  CONSTRAINT vital_signs_value_check CHECK (value >= 0),
  -- Blutdruck braucht beide Werte; alle anderen Typen haben keinen Zweitwert
  CONSTRAINT vital_signs_secondary_required_check CHECK (type <> 'blutdruck' OR value_secondary IS NOT NULL),
  CONSTRAINT vital_signs_secondary_only_bp_check CHECK (value_secondary IS NULL OR type = 'blutdruck'),
  CONSTRAINT vital_signs_secondary_value_check CHECK (value_secondary IS NULL OR value_secondary >= 0)
);

CREATE INDEX IF NOT EXISTS idx_vital_signs_client_type_time ON vital_signs(client_id, type, measured_at DESC);
CREATE INDEX IF NOT EXISTS idx_vital_signs_org_time ON vital_signs(organization_id, measured_at DESC);

ALTER TABLE vital_signs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'vital_signs' AND policyname = 'admin_vital_signs') THEN
    CREATE POLICY admin_vital_signs ON vital_signs FOR ALL
      USING (is_admin()) WITH CHECK (is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'vital_signs' AND policyname = 'org_fence_vital_signs') THEN
    CREATE POLICY org_fence_vital_signs ON vital_signs AS RESTRICTIVE FOR ALL
      USING (organization_id = current_org_id());
  END IF;
  -- Engel sehen/erfassen Vitalwerte nur für aktiv zugewiesene Klienten.
  -- WICHTIG: eigene_caregiver_ids() (SECURITY DEFINER) statt caregivers-Join —
  -- caregivers hat für Engel KEINE Lesepolicy (nur Admin + org_fence), ein
  -- direkter Join liefert unter RLS 0 Zeilen und würde jede Engel-Erfassung
  -- blockieren. assignments ist per assignments_engel_read lesbar.
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'vital_signs' AND policyname = 'engel_vital_signs_select') THEN
    CREATE POLICY engel_vital_signs_select ON vital_signs FOR SELECT
      USING (client_id IN (
        SELECT a.client_id FROM assignments a
        WHERE a.caregiver_id IN (SELECT eigene_caregiver_ids())
          AND a.status IN ('active','GEPLANT','BESTAETIGT','UNTERWEGS','GESTARTET')
      ));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'vital_signs' AND policyname = 'engel_vital_signs_insert') THEN
    CREATE POLICY engel_vital_signs_insert ON vital_signs FOR INSERT
      WITH CHECK (measured_by = auth.uid() AND client_id IN (
        SELECT a.client_id FROM assignments a
        WHERE a.caregiver_id IN (SELECT eigene_caregiver_ids())
          AND a.status IN ('active','GEPLANT','BESTAETIGT','UNTERWEGS','GESTARTET')
      ));
  END IF;
  -- BEWUSST KEINE Kunden-Lesepolicy: vital_signs.notes kann interne
  -- Pflegevermerke enthalten, und es gibt keine kundengerichtete UI. Least
  -- Privilege — eine Kundensicht braucht erst ein Sichtbarkeitsmodell (analog
  -- pflege_verlauf.sichtbarkeit), dann eine gezielte Policy ohne notes.
END $$;

DROP TRIGGER IF EXISTS trg_updated_at_vital_signs ON vital_signs;
CREATE TRIGGER trg_updated_at_vital_signs BEFORE UPDATE ON vital_signs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ═══════════════════════════════════════════════════════════════════════════
-- TEIL 2: vital_sign_thresholds — Grenzwerte pro Klient & Vitaltyp
-- ═══════════════════════════════════════════════════════════════════════════
-- Zwei Stufen: Warnung (warn) und Kritisch (critical). Kritisch liegt immer
-- außerhalb der Warnstufe. Für Blutdruck gelten die *_secondary-Spalten
-- zusätzlich für den diastolischen Wert.

CREATE TABLE IF NOT EXISTS vital_sign_thresholds (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL DEFAULT current_org_id(),
  client_id        uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  type             text NOT NULL,

  min_warn              numeric(8,2),
  max_warn              numeric(8,2),
  min_critical          numeric(8,2),
  max_critical          numeric(8,2),
  min_warn_secondary     numeric(8,2),
  max_warn_secondary     numeric(8,2),
  min_critical_secondary numeric(8,2),
  max_critical_secondary numeric(8,2),

  enabled          boolean NOT NULL DEFAULT true,
  notes            text,
  created_by       uuid REFERENCES auth.users(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT vital_sign_thresholds_type_check CHECK (type IN (
    'blutdruck','puls','temperatur','blutzucker','spo2',
    'gewicht','atemfrequenz','schmerz','trinkmenge','ausscheidung'
  )),
  -- Pro Klient und Vitaltyp genau ein Grenzwert-Satz
  CONSTRAINT vital_sign_thresholds_client_type_unique UNIQUE (client_id, type),
  -- Konsistenz: min < max und kritisch außerhalb von warn (nur wenn beide gesetzt)
  CONSTRAINT vital_sign_thresholds_warn_order_check
    CHECK (min_warn IS NULL OR max_warn IS NULL OR min_warn < max_warn),
  CONSTRAINT vital_sign_thresholds_critical_order_check
    CHECK (min_critical IS NULL OR max_critical IS NULL OR min_critical < max_critical),
  CONSTRAINT vital_sign_thresholds_min_nesting_check
    CHECK (min_critical IS NULL OR min_warn IS NULL OR min_critical <= min_warn),
  CONSTRAINT vital_sign_thresholds_max_nesting_check
    CHECK (max_critical IS NULL OR max_warn IS NULL OR max_critical >= max_warn),
  CONSTRAINT vital_sign_thresholds_secondary_only_bp_check CHECK (
    type = 'blutdruck' OR (
      min_warn_secondary IS NULL AND max_warn_secondary IS NULL
      AND min_critical_secondary IS NULL AND max_critical_secondary IS NULL
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_vital_sign_thresholds_client ON vital_sign_thresholds(client_id);
CREATE INDEX IF NOT EXISTS idx_vital_sign_thresholds_org ON vital_sign_thresholds(organization_id);

ALTER TABLE vital_sign_thresholds ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'vital_sign_thresholds' AND policyname = 'admin_vital_sign_thresholds') THEN
    CREATE POLICY admin_vital_sign_thresholds ON vital_sign_thresholds FOR ALL
      USING (is_admin()) WITH CHECK (is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'vital_sign_thresholds' AND policyname = 'org_fence_vital_sign_thresholds') THEN
    CREATE POLICY org_fence_vital_sign_thresholds ON vital_sign_thresholds AS RESTRICTIVE FOR ALL
      USING (organization_id = current_org_id());
  END IF;
  -- Engel lesen Grenzwerte ihrer zugewiesenen Klienten (für die Alarm-Anzeige).
  -- eigene_caregiver_ids() statt caregivers-Join (s. Begründung bei vital_signs).
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'vital_sign_thresholds' AND policyname = 'engel_vital_sign_thresholds_select') THEN
    CREATE POLICY engel_vital_sign_thresholds_select ON vital_sign_thresholds FOR SELECT
      USING (client_id IN (
        SELECT a.client_id FROM assignments a
        WHERE a.caregiver_id IN (SELECT eigene_caregiver_ids())
          AND a.status IN ('active','GEPLANT','BESTAETIGT','UNTERWEGS','GESTARTET')
      ));
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_updated_at_vital_sign_thresholds ON vital_sign_thresholds;
CREATE TRIGGER trg_updated_at_vital_sign_thresholds BEFORE UPDATE ON vital_sign_thresholds
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ─── Migration 8/20: 20260818030000_wunddokumentation.sql ──────────────

-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Wunddokumentation (Expertenstandard "Pflege von Menschen mit
--            chronischen Wunden") — wounds, wound_assessments,
--            wound_treatments, wound_photos + privater Storage-Bucket
-- Datum:     2026-08-18
-- Projekt:   Alltagsengel UG
-- ═══════════════════════════════════════════════════════════════════════════
-- IDEMPOTENT: Alle Statements mit IF NOT EXISTS / IF EXISTS Guards.
-- BESTEHENDE DATEN: Keine Löschung, nur Erweiterung.
-- RLS:       is_admin() (SECURITY DEFINER, KEINE profiles-Subquery — 42P17!)
--            + org_fence current_org_id() RESTRICTIVE
--            + Engel-SELECT über aktive assignments.
-- Rollback:  20260818010001_rollback_wunddokumentation.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- TEIL 0: Engel-Zugriffs-Helper (SECURITY DEFINER)
-- ═══════════════════════════════════════════════════════════════════════════
-- Identisch zur Definition in 20260818010000_sis_* — CREATE OR REPLACE macht
-- die Apply-Reihenfolge egal. SECURITY DEFINER ist hier PFLICHT: eine rohe
-- assignments/caregivers-Subquery in der Policy löst deren eigene Policies
-- aus und endet in 42P17 (auf der Shadow-DB nachgewiesen).

CREATE OR REPLACE FUNCTION public.engel_hat_aktiven_klienten(p_client_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM assignments a
    JOIN caregivers cg ON cg.id = a.caregiver_id
    WHERE a.client_id = p_client_id
      AND cg.user_id = auth.uid()
      AND a.status IN ('active','GEPLANT','BESTAETIGT','UNTERWEGS','GESTARTET')
  );
$$;

REVOKE ALL ON FUNCTION public.engel_hat_aktiven_klienten(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.engel_hat_aktiven_klienten(uuid) TO authenticated, service_role;


-- ═══════════════════════════════════════════════════════════════════════════
-- TEIL 1: wounds — Wund-Stammdaten
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS wounds (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT current_org_id(),
  client_id       uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  -- Klassifikation
  wund_typ        text NOT NULL,
  dekubitus_grad  integer,

  -- Lokalisation (Körperschema)
  lokalisation        text NOT NULL,
  koerperstelle_code  text,
  koerperseite        text,

  -- Verlauf
  entstanden_am        date,
  erstdokumentation_am date NOT NULL DEFAULT CURRENT_DATE,
  status               text NOT NULL DEFAULT 'aktiv',
  abgeheilt_am         date,

  bemerkung     text,

  -- Audit
  erstellt_von  uuid NOT NULL REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT wounds_wund_typ_check CHECK (wund_typ IN (
    'dekubitus','ulcus_cruris','diabetisches_fusssyndrom','op_wunde','traumatische_wunde','sonstige'
  )),
  CONSTRAINT wounds_dekubitus_grad_check CHECK (
    dekubitus_grad IS NULL OR (dekubitus_grad BETWEEN 1 AND 4)
  ),
  -- Dekubitus-Grad nur bei Dekubitus
  CONSTRAINT wounds_grad_nur_dekubitus_check CHECK (
    dekubitus_grad IS NULL OR wund_typ = 'dekubitus'
  ),
  CONSTRAINT wounds_koerperseite_check CHECK (
    koerperseite IS NULL OR koerperseite IN ('links','rechts','mittig')
  ),
  CONSTRAINT wounds_status_check CHECK (status IN (
    'aktiv','in_abheilung','stagnierend','verschlechtert','abgeheilt'
  )),
  -- Abheilungsdatum genau dann, wenn Status abgeheilt
  CONSTRAINT wounds_abgeheilt_konsistenz_check CHECK (
    (status = 'abgeheilt') = (abgeheilt_am IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_wounds_org     ON wounds(organization_id);
CREATE INDEX IF NOT EXISTS idx_wounds_client  ON wounds(client_id);
CREATE INDEX IF NOT EXISTS idx_wounds_status  ON wounds(status);

ALTER TABLE wounds ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'wounds' AND policyname = 'admin_wounds') THEN
    CREATE POLICY admin_wounds ON wounds FOR ALL
      USING (is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'wounds' AND policyname = 'org_fence_wounds') THEN
    CREATE POLICY org_fence_wounds ON wounds AS RESTRICTIVE FOR ALL
      USING (organization_id = current_org_id());
  END IF;
  -- DROP+CREATE statt IF NOT EXISTS: ersetzt eine evtl. vorhandene Fassung
  -- mit roher assignments-Subquery (42P17-Gefahr) durch den SECDEF-Helper.
  DROP POLICY IF EXISTS engel_wounds_select ON wounds;
  CREATE POLICY engel_wounds_select ON wounds FOR SELECT
    USING (engel_hat_aktiven_klienten(client_id));
END $$;

DROP TRIGGER IF EXISTS trg_updated_at_wounds ON wounds;
CREATE TRIGGER trg_updated_at_wounds BEFORE UPDATE ON wounds
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ═══════════════════════════════════════════════════════════════════════════
-- TEIL 2: wound_assessments — Wundassessment (Einzelerhebung)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS wound_assessments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT current_org_id(),
  wound_id        uuid NOT NULL REFERENCES wounds(id) ON DELETE CASCADE,

  erhoben_am  timestamptz NOT NULL DEFAULT now(),
  erhoben_von uuid NOT NULL REFERENCES auth.users(id),

  -- Größe (cm)
  laenge_cm numeric(5,1),
  breite_cm numeric(5,1),
  tiefe_cm  numeric(5,1),

  -- Wundgrund (Anteile in %)
  wundgrund_granulation_pct integer,
  wundgrund_fibrin_pct      integer,
  wundgrund_nekrose_pct     integer,
  wundgrund_epithel_pct     integer,

  -- Wundrand / Umgebung
  wundrand       text,
  umgebungshaut  text,

  -- Exsudat
  exsudat_menge text,
  exsudat_art   text,

  geruch              text,
  schmerz_nrs         integer,
  infektionszeichen   boolean NOT NULL DEFAULT false,

  -- PUSH-Tool (0-17): Fläche 0-10, Exsudat 0-3, Gewebetyp 0-4
  push_flaeche_punkte integer,
  push_exsudat_punkte integer,
  push_gewebe_punkte  integer,
  push_gesamt         integer,

  bemerkung  text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT wa_laenge_check CHECK (laenge_cm IS NULL OR laenge_cm >= 0),
  CONSTRAINT wa_breite_check CHECK (breite_cm IS NULL OR breite_cm >= 0),
  CONSTRAINT wa_tiefe_check  CHECK (tiefe_cm  IS NULL OR tiefe_cm  >= 0),
  CONSTRAINT wa_granulation_pct_check CHECK (wundgrund_granulation_pct IS NULL OR wundgrund_granulation_pct BETWEEN 0 AND 100),
  CONSTRAINT wa_fibrin_pct_check      CHECK (wundgrund_fibrin_pct      IS NULL OR wundgrund_fibrin_pct      BETWEEN 0 AND 100),
  CONSTRAINT wa_nekrose_pct_check     CHECK (wundgrund_nekrose_pct     IS NULL OR wundgrund_nekrose_pct     BETWEEN 0 AND 100),
  CONSTRAINT wa_epithel_pct_check     CHECK (wundgrund_epithel_pct     IS NULL OR wundgrund_epithel_pct     BETWEEN 0 AND 100),
  CONSTRAINT wa_wundgrund_summe_check CHECK (
    COALESCE(wundgrund_granulation_pct,0) + COALESCE(wundgrund_fibrin_pct,0)
    + COALESCE(wundgrund_nekrose_pct,0) + COALESCE(wundgrund_epithel_pct,0) <= 100
  ),
  CONSTRAINT wa_exsudat_menge_check CHECK (exsudat_menge IS NULL OR exsudat_menge IN ('keine','wenig','maessig','viel')),
  CONSTRAINT wa_exsudat_art_check   CHECK (exsudat_art   IS NULL OR exsudat_art   IN ('seroes','blutig','seroes_blutig','eitrig','sonstige')),
  CONSTRAINT wa_geruch_check        CHECK (geruch        IS NULL OR geruch        IN ('kein','leicht','stark')),
  CONSTRAINT wa_schmerz_nrs_check   CHECK (schmerz_nrs   IS NULL OR schmerz_nrs BETWEEN 0 AND 10),
  CONSTRAINT wa_push_flaeche_check  CHECK (push_flaeche_punkte IS NULL OR push_flaeche_punkte BETWEEN 0 AND 10),
  CONSTRAINT wa_push_exsudat_check  CHECK (push_exsudat_punkte IS NULL OR push_exsudat_punkte BETWEEN 0 AND 3),
  CONSTRAINT wa_push_gewebe_check   CHECK (push_gewebe_punkte  IS NULL OR push_gewebe_punkte  BETWEEN 0 AND 4),
  CONSTRAINT wa_push_gesamt_check   CHECK (push_gesamt         IS NULL OR push_gesamt         BETWEEN 0 AND 17)
);

CREATE INDEX IF NOT EXISTS idx_wound_assessments_org   ON wound_assessments(organization_id);
CREATE INDEX IF NOT EXISTS idx_wound_assessments_wound ON wound_assessments(wound_id, erhoben_am);

ALTER TABLE wound_assessments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'wound_assessments' AND policyname = 'admin_wound_assessments') THEN
    CREATE POLICY admin_wound_assessments ON wound_assessments FOR ALL
      USING (is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'wound_assessments' AND policyname = 'org_fence_wound_assessments') THEN
    CREATE POLICY org_fence_wound_assessments ON wound_assessments AS RESTRICTIVE FOR ALL
      USING (organization_id = current_org_id());
  END IF;
  DROP POLICY IF EXISTS engel_wound_assessments_select ON wound_assessments;
  CREATE POLICY engel_wound_assessments_select ON wound_assessments FOR SELECT
    USING (EXISTS (
      SELECT 1 FROM wounds w
      WHERE w.id = wound_id AND engel_hat_aktiven_klienten(w.client_id)
    ));
END $$;

DROP TRIGGER IF EXISTS trg_updated_at_wound_assessments ON wound_assessments;
CREATE TRIGGER trg_updated_at_wound_assessments BEFORE UPDATE ON wound_assessments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ═══════════════════════════════════════════════════════════════════════════
-- TEIL 3: wound_treatments — Wundversorgung / Verbandwechsel-Protokoll
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS wound_treatments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT current_org_id(),
  wound_id        uuid NOT NULL REFERENCES wounds(id) ON DELETE CASCADE,

  durchgefuehrt_am  timestamptz NOT NULL DEFAULT now(),
  durchgefuehrt_von uuid NOT NULL REFERENCES auth.users(id),

  massnahme         text NOT NULL,
  wundreinigung     text,
  -- Verwendete Materialien: [{"name": "...", "menge": "..."}]
  materialien       jsonb NOT NULL DEFAULT '[]'::jsonb,
  schmerzmittel_gegeben boolean NOT NULL DEFAULT false,
  besonderheiten    text,

  naechster_vw_am   date,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT wt_materialien_array_check CHECK (jsonb_typeof(materialien) = 'array')
);

CREATE INDEX IF NOT EXISTS idx_wound_treatments_org   ON wound_treatments(organization_id);
CREATE INDEX IF NOT EXISTS idx_wound_treatments_wound ON wound_treatments(wound_id, durchgefuehrt_am);
CREATE INDEX IF NOT EXISTS idx_wound_treatments_vw    ON wound_treatments(naechster_vw_am);

ALTER TABLE wound_treatments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'wound_treatments' AND policyname = 'admin_wound_treatments') THEN
    CREATE POLICY admin_wound_treatments ON wound_treatments FOR ALL
      USING (is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'wound_treatments' AND policyname = 'org_fence_wound_treatments') THEN
    CREATE POLICY org_fence_wound_treatments ON wound_treatments AS RESTRICTIVE FOR ALL
      USING (organization_id = current_org_id());
  END IF;
  DROP POLICY IF EXISTS engel_wound_treatments_select ON wound_treatments;
  CREATE POLICY engel_wound_treatments_select ON wound_treatments FOR SELECT
    USING (EXISTS (
      SELECT 1 FROM wounds w
      WHERE w.id = wound_id AND engel_hat_aktiven_klienten(w.client_id)
    ));
END $$;

DROP TRIGGER IF EXISTS trg_updated_at_wound_treatments ON wound_treatments;
CREATE TRIGGER trg_updated_at_wound_treatments BEFORE UPDATE ON wound_treatments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ═══════════════════════════════════════════════════════════════════════════
-- TEIL 4: wound_photos — Fotodokumentation (Metadaten; Binärdaten im Bucket)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS wound_photos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT current_org_id(),
  wound_id        uuid NOT NULL REFERENCES wounds(id) ON DELETE CASCADE,
  assessment_id   uuid REFERENCES wound_assessments(id) ON DELETE SET NULL,

  bucket             text NOT NULL DEFAULT 'wound-photos',
  dateipfad          text NOT NULL,
  dateiname          text NOT NULL,
  mime_type          text NOT NULL,
  dateigroesse_bytes bigint,

  aufgenommen_am  timestamptz NOT NULL DEFAULT now(),
  aufgenommen_von uuid NOT NULL REFERENCES auth.users(id),
  bemerkung       text,

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT wp_dateipfad_unique UNIQUE (bucket, dateipfad)
);

CREATE INDEX IF NOT EXISTS idx_wound_photos_org   ON wound_photos(organization_id);
CREATE INDEX IF NOT EXISTS idx_wound_photos_wound ON wound_photos(wound_id, aufgenommen_am);

ALTER TABLE wound_photos ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'wound_photos' AND policyname = 'admin_wound_photos') THEN
    CREATE POLICY admin_wound_photos ON wound_photos FOR ALL
      USING (is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'wound_photos' AND policyname = 'org_fence_wound_photos') THEN
    CREATE POLICY org_fence_wound_photos ON wound_photos AS RESTRICTIVE FOR ALL
      USING (organization_id = current_org_id());
  END IF;
  DROP POLICY IF EXISTS engel_wound_photos_select ON wound_photos;
  CREATE POLICY engel_wound_photos_select ON wound_photos FOR SELECT
    USING (EXISTS (
      SELECT 1 FROM wounds w
      WHERE w.id = wound_id AND engel_hat_aktiven_klienten(w.client_id)
    ));
END $$;


-- ═══════════════════════════════════════════════════════════════════════════
-- TEIL 5: Storage-Bucket wound-photos (PRIVATE)
-- ═══════════════════════════════════════════════════════════════════════════
-- Zugriff ausschließlich serverseitig (service_role) + kurzlebige Signed URLs —
-- wie vertraege/kunden-dokumente. Keine storage.objects-Policies für
-- anon/authenticated: privater Bucket ohne Policies = kein direkter Zugriff.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('wound-photos', 'wound-photos', false, 10485760,
        ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
ON CONFLICT (id) DO NOTHING;


-- ─── Migration 9/20: 20260819010000_pflegecoach_dipa_modul.sql ──────────────

-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Digitaler PflegeCoach (DiPA-Modul) — Datenmodell coach_*
-- Datum:     2026-08-18 (sequenziell), erstellt 2026-08-09
-- Projekt:   Alltagsengel UG — DiPA nach § 40a SGB XI (Erprobungspfad § 78a Abs. 6a)
-- ═══════════════════════════════════════════════════════════════════════════
-- IDEMPOTENT: Alle Statements mit IF NOT EXISTS / DO-Guards.
-- BESTEHENDE DATEN: Keine Änderung an bestehenden Tabellen. Nur neue Objekte.
--
-- PRODUKTGRENZE (bewusste Abweichung vom übrigen Schema):
--   * KEIN organization_id / org_fence: DiPA-Daten sind NUTZER-eigene
--     Gesundheitsdaten (Art. 9 DSGVO), keine Mandanten-Betriebsdaten.
--   * KEINE is_admin()-Policies: Betriebs-Admins der Alltagsengel-Plattform
--     haben KEINEN Zugriff auf PflegeCoach-Daten (DiPAV-Trennungsgebot,
--     keine Nutzung für Werbung/Cross-Selling).
--   * Zugriff ausschließlich: der Nutzer selbst + von ihm per coach_shares
--     freigegebene Personen (Angehörige/Pflegedienst), widerruflich.
--   * anon: sämtliche Grants entzogen (Supabase-Default-Privileges!).
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- TEIL 0: updated_at-Trigger-Funktion (SECURITY INVOKER, kein anon-Exec)
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION coach_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- Default-Privileges machen jede public-Funktion für anon ausführbar → entziehen.
REVOKE ALL ON FUNCTION coach_set_updated_at() FROM PUBLIC, anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- TEIL 1: coach_users — Produktnutzer (3 Rollen) + Barrierefreiheits-Prefs
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS coach_users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  rolle         text NOT NULL CHECK (rolle IN ('pflegebeduerftig','angehoerig','pflegedienst')),
  anzeigename   text,
  pflegegrad    integer CHECK (pflegegrad BETWEEN 1 AND 5),
  geburtsjahr   integer CHECK (geburtsjahr BETWEEN 1900 AND 2030),

  -- Barrierefreiheit (WCAG 2.1 AA / BFSG): Nutzer-Einstellungen serverseitig,
  -- damit sie geräteübergreifend gelten.
  a11y_schriftgrad text NOT NULL DEFAULT 'normal' CHECK (a11y_schriftgrad IN ('normal','gross','sehr_gross')),
  a11y_kontrast    boolean NOT NULL DEFAULT false,

  onboarding_abgeschlossen boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE coach_users IS
  'DiPA "Digitaler PflegeCoach": Produktnutzer. Strikt getrennt von profiles/Betriebsdaten. Kein Admin-Zugriff (DiPAV-Produktgrenze).';

-- ───────────────────────────────────────────────────────────────────────────
-- TEIL 2: coach_consents — versionierter Einwilligungs-Record (Art. 9 DSGVO)
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS coach_consents (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_user_id  uuid NOT NULL REFERENCES coach_users(id) ON DELETE CASCADE,
  consent_typ    text NOT NULL CHECK (consent_typ IN (
                   'gesundheitsdaten_art9',        -- Verarbeitung von Pflege-/Gesundheitsdaten
                   'wissenschaftliche_auswertung', -- pseudonymisierte Evaluationsdaten (Pilot)
                   'datenfreigabe'                 -- geteilte Nutzung mit Angehörigen/Pflegedienst
                 )),
  text_version   text NOT NULL,      -- Version des Einwilligungstexts (z.B. "2026-08-v1")
  erteilt        boolean NOT NULL,
  erteilt_am     timestamptz NOT NULL DEFAULT now(),
  widerrufen_am  timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE coach_consents IS
  'Serverseitig versionierte Einwilligungen (Art. 7 Abs. 1 / Art. 9 Abs. 2 lit. a DSGVO). Append-only: kein UPDATE außer Widerruf, kein DELETE.';

CREATE INDEX IF NOT EXISTS idx_coach_consents_user ON coach_consents(coach_user_id, consent_typ);

-- ───────────────────────────────────────────────────────────────────────────
-- TEIL 3: coach_shares — einwilligungsbasierte Freigabe (Rollen-Interaktion)
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS coach_shares (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_coach_user_id  uuid NOT NULL REFERENCES coach_users(id) ON DELETE CASCADE,
  grantee_user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  empfaenger_rolle     text NOT NULL CHECK (empfaenger_rolle IN ('angehoerig','pflegedienst')),
  erstellt_am          timestamptz NOT NULL DEFAULT now(),
  widerrufen_am        timestamptz,
  UNIQUE (owner_coach_user_id, grantee_user_id)
);

COMMENT ON TABLE coach_shares IS
  'Lesefreigabe der PflegeCoach-Daten an Angehörige/Pflegedienst. Jederzeit widerruflich (widerrufen_am). Grundlage: coach_consents datenfreigabe.';

CREATE INDEX IF NOT EXISTS idx_coach_shares_grantee ON coach_shares(grantee_user_id) WHERE widerrufen_am IS NULL;

-- ───────────────────────────────────────────────────────────────────────────
-- TEIL 4: coach_assessments — strukturiertes Pflegeassessment
-- ───────────────────────────────────────────────────────────────────────────
-- Selbsteinschätzung 0–4 je Lebensbereich (0 = selbständig, 4 = auf
-- umfassende Unterstützung angewiesen). KEINE diagnostische Auswertung —
-- reine Selbstauskunft als Organisationsgrundlage (MDR-Negativabgrenzung).

CREATE TABLE IF NOT EXISTS coach_assessments (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_user_id      uuid NOT NULL REFERENCES coach_users(id) ON DELETE CASCADE,
  assessment_typ     text NOT NULL DEFAULT 'erstassessment' CHECK (assessment_typ IN ('erstassessment','verlaufsassessment')),

  mobilitaet         integer CHECK (mobilitaet BETWEEN 0 AND 4),
  selbstversorgung   integer CHECK (selbstversorgung BETWEEN 0 AND 4),
  alltagsgestaltung  integer CHECK (alltagsgestaltung BETWEEN 0 AND 4),
  soziale_teilhabe   integer CHECK (soziale_teilhabe BETWEEN 0 AND 4),
  kognition          integer CHECK (kognition BETWEEN 0 AND 4),

  hilfsmittel        text,
  wohnsituation      text,
  notizen            text,

  erhoben_am         date NOT NULL DEFAULT CURRENT_DATE,
  erhoben_von        uuid REFERENCES auth.users(id),
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coach_assessments_user ON coach_assessments(coach_user_id, erhoben_am DESC);

-- ───────────────────────────────────────────────────────────────────────────
-- TEIL 5: coach_goals — individuelle SMART-Pflegeziele
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS coach_goals (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_user_id   uuid NOT NULL REFERENCES coach_users(id) ON DELETE CASCADE,
  titel           text NOT NULL,
  beschreibung    text,
  bereich         text NOT NULL CHECK (bereich IN (
                    'mobilitaet','selbstversorgung','alltagsgestaltung',
                    'soziale_teilhabe','entlastung_angehoerige')),

  -- SMART: Messgröße + Start-/Ziel-/Ist-Wert + Termin
  messgroesse     text,             -- z.B. "Spaziergänge pro Woche"
  startwert       numeric,
  zielwert        numeric,
  aktueller_wert  numeric,
  start_am        date NOT NULL DEFAULT CURRENT_DATE,
  ziel_bis        date,

  status          text NOT NULL DEFAULT 'aktiv' CHECK (status IN ('aktiv','erreicht','angepasst','pausiert','beendet')),
  anpassungs_notiz text,            -- dokumentiert Maßnahmen-Anpassungen (nachvollziehbar)

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coach_goals_user ON coach_goals(coach_user_id, status);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_coach_goals_updated_at') THEN
    CREATE TRIGGER trg_coach_goals_updated_at BEFORE UPDATE ON coach_goals
      FOR EACH ROW EXECUTE FUNCTION coach_set_updated_at();
  END IF;
END $$;

-- ───────────────────────────────────────────────────────────────────────────
-- TEIL 6: coach_activities — Tages-/Wochenstruktur (Aktivitätenplanung)
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS coach_activities (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_user_id   uuid NOT NULL REFERENCES coach_users(id) ON DELETE CASCADE,
  titel           text NOT NULL,
  beschreibung    text,
  kategorie       text NOT NULL CHECK (kategorie IN (
                    'mobilitaet','selbstversorgung','alltagsgestaltung',
                    'soziale_teilhabe','entlastung','erinnerung')),

  wochentage      smallint[] NOT NULL DEFAULT '{}',  -- 1=Mo … 7=So
  uhrzeit         time,
  dauer_minuten   integer CHECK (dauer_minuten IS NULL OR dauer_minuten BETWEEN 1 AND 480),
  goal_id         uuid REFERENCES coach_goals(id) ON DELETE SET NULL,
  aktiv           boolean NOT NULL DEFAULT true,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coach_activities_user ON coach_activities(coach_user_id) WHERE aktiv;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_coach_activities_updated_at') THEN
    CREATE TRIGGER trg_coach_activities_updated_at BEFORE UPDATE ON coach_activities
      FOR EACH ROW EXECUTE FUNCTION coach_set_updated_at();
  END IF;
END $$;

-- ───────────────────────────────────────────────────────────────────────────
-- TEIL 7: coach_activity_log — Erledigungen (Adhärenz, Verlaufsbasis)
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS coach_activity_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id     uuid NOT NULL REFERENCES coach_activities(id) ON DELETE CASCADE,
  coach_user_id   uuid NOT NULL REFERENCES coach_users(id) ON DELETE CASCADE,
  datum           date NOT NULL DEFAULT CURRENT_DATE,
  status          text NOT NULL DEFAULT 'erledigt' CHECK (status IN ('erledigt','teilweise','ausgelassen')),
  notiz           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (activity_id, datum)
);

CREATE INDEX IF NOT EXISTS idx_coach_activity_log_user ON coach_activity_log(coach_user_id, datum DESC);

-- ───────────────────────────────────────────────────────────────────────────
-- TEIL 8: coach_measurements — Verlaufsmessung (Baseline + Outcome)
-- ───────────────────────────────────────────────────────────────────────────
-- Instrumente gem. Pilotkonzept: FES-I Kurzform (Sturzangst), BSFC-s
-- (Belastung pflegender Angehöriger, "Häusliche-Pflege-Skala Kurzform"),
-- SUS (Usability), Selbsteinschätzung Selbständigkeit, Sturzereignis
-- (Selbstbericht). Rohantworten in `antworten` (jsonb), Summenwert separat.
-- KEINE automatische klinische Interpretation (MDR-Negativabgrenzung).

CREATE TABLE IF NOT EXISTS coach_measurements (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_user_id   uuid NOT NULL REFERENCES coach_users(id) ON DELETE CASCADE,
  instrument      text NOT NULL CHECK (instrument IN (
                    'fes_i_k','bsfc_s','sus','belastung_kurz',
                    'selbsteinschaetzung_selbststaendigkeit','sturzereignis','befinden')),
  messzeitpunkt   text NOT NULL DEFAULT 'laufend' CHECK (messzeitpunkt IN ('t0','t1','t2','t3','laufend')),
  antworten       jsonb NOT NULL DEFAULT '{}'::jsonb,
  summenwert      numeric,
  erhoben_am      timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coach_measurements_user
  ON coach_measurements(coach_user_id, instrument, erhoben_am DESC);

-- ───────────────────────────────────────────────────────────────────────────
-- TEIL 9: coach_reports — exportierbare Verlaufsberichte (unveränderlich)
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS coach_reports (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_user_id   uuid NOT NULL REFERENCES coach_users(id) ON DELETE CASCADE,
  report_typ      text NOT NULL DEFAULT 'verlaufsbericht' CHECK (report_typ IN ('verlaufsbericht','datenexport')),
  zeitraum_von    date,
  zeitraum_bis    date,
  inhalt          jsonb NOT NULL,   -- Snapshot: nachvollziehbar, maschinenlesbar (DiPAV-Export)
  erstellt_am     timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE coach_reports IS
  'Generierte Berichte/Exporte als unveränderlicher Snapshot (kein UPDATE/DELETE per RLS). Löschung nur über Konto-Löschung (CASCADE).';

CREATE INDEX IF NOT EXISTS idx_coach_reports_user ON coach_reports(coach_user_id, erstellt_am DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- TEIL 10: RLS — Nutzer-eigen + Freigabe-Lesezugriff, KEIN Admin-Zugriff
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE coach_users        ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_consents     ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_shares       ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_assessments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_goals        ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_activities   ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_measurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_reports      ENABLE ROW LEVEL SECURITY;

-- coach_users: nur der Nutzer selbst (kein Fremdzugriff, auch nicht lesend)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'coach_users' AND policyname = 'coach_users_self') THEN
    CREATE POLICY coach_users_self ON coach_users FOR ALL TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

-- coach_consents: eigene lesen + anlegen; UPDATE nur für Widerruf; kein DELETE
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'coach_consents' AND policyname = 'coach_consents_select_self') THEN
    CREATE POLICY coach_consents_select_self ON coach_consents FOR SELECT TO authenticated
      USING (coach_user_id IN (SELECT cu.id FROM coach_users cu WHERE cu.user_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'coach_consents' AND policyname = 'coach_consents_insert_self') THEN
    CREATE POLICY coach_consents_insert_self ON coach_consents FOR INSERT TO authenticated
      WITH CHECK (coach_user_id IN (SELECT cu.id FROM coach_users cu WHERE cu.user_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'coach_consents' AND policyname = 'coach_consents_update_self') THEN
    CREATE POLICY coach_consents_update_self ON coach_consents FOR UPDATE TO authenticated
      USING (coach_user_id IN (SELECT cu.id FROM coach_users cu WHERE cu.user_id = auth.uid()))
      WITH CHECK (coach_user_id IN (SELECT cu.id FROM coach_users cu WHERE cu.user_id = auth.uid()));
  END IF;
END $$;

-- coach_shares: Eigentümer verwaltet; Empfänger sieht die eigene Freigabe
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'coach_shares' AND policyname = 'coach_shares_owner_all') THEN
    CREATE POLICY coach_shares_owner_all ON coach_shares FOR ALL TO authenticated
      USING (owner_coach_user_id IN (SELECT cu.id FROM coach_users cu WHERE cu.user_id = auth.uid()))
      WITH CHECK (owner_coach_user_id IN (SELECT cu.id FROM coach_users cu WHERE cu.user_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'coach_shares' AND policyname = 'coach_shares_grantee_select') THEN
    CREATE POLICY coach_shares_grantee_select ON coach_shares FOR SELECT TO authenticated
      USING (grantee_user_id = auth.uid());
  END IF;
END $$;

-- Datentabellen: Eigentümer voll, Freigabe-Empfänger lesend.
-- (Muster identisch für assessments/goals/activities/activity_log/measurements.)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['coach_assessments','coach_goals','coach_activities','coach_activity_log','coach_measurements'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = t || '_owner_all') THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR ALL TO authenticated
           USING (coach_user_id IN (SELECT cu.id FROM coach_users cu WHERE cu.user_id = auth.uid()))
           WITH CHECK (coach_user_id IN (SELECT cu.id FROM coach_users cu WHERE cu.user_id = auth.uid()))',
        t || '_owner_all', t);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = t || '_share_select') THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR SELECT TO authenticated
           USING (coach_user_id IN (
             SELECT s.owner_coach_user_id FROM coach_shares s
             WHERE s.grantee_user_id = auth.uid() AND s.widerrufen_am IS NULL))',
        t || '_share_select', t);
    END IF;
  END LOOP;
END $$;

-- coach_reports: Eigentümer SELECT+INSERT, Freigabe SELECT — kein UPDATE/DELETE
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'coach_reports' AND policyname = 'coach_reports_select_self') THEN
    CREATE POLICY coach_reports_select_self ON coach_reports FOR SELECT TO authenticated
      USING (coach_user_id IN (SELECT cu.id FROM coach_users cu WHERE cu.user_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'coach_reports' AND policyname = 'coach_reports_insert_self') THEN
    CREATE POLICY coach_reports_insert_self ON coach_reports FOR INSERT TO authenticated
      WITH CHECK (coach_user_id IN (SELECT cu.id FROM coach_users cu WHERE cu.user_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'coach_reports' AND policyname = 'coach_reports_share_select') THEN
    CREATE POLICY coach_reports_share_select ON coach_reports FOR SELECT TO authenticated
      USING (coach_user_id IN (
        SELECT s.owner_coach_user_id FROM coach_shares s
        WHERE s.grantee_user_id = auth.uid() AND s.widerrufen_am IS NULL));
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- TEIL 11: Grants härten — anon komplett raus (Default-Privileges-Falle)
-- ═══════════════════════════════════════════════════════════════════════════

REVOKE ALL ON coach_users, coach_consents, coach_shares, coach_assessments,
              coach_goals, coach_activities, coach_activity_log,
              coach_measurements, coach_reports
  FROM anon;

-- coach_consents/coach_reports: DELETE bzw. UPDATE/DELETE auch auf Grant-Ebene
-- entziehen (Defense-in-Depth zusätzlich zur fehlenden Policy).
REVOKE DELETE ON coach_consents FROM authenticated;
REVOKE UPDATE, DELETE ON coach_reports FROM authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- TEIL 12: coach_audit_log — Auditierbarkeit (DiPAV/GoBD-Anlehnung)
-- ═══════════════════════════════════════════════════════════════════════════
-- Append-only Protokoll aller Schreibzugriffe auf coach_*-Tabellen.
-- DATENMINIMIERUNG: Es werden KEINE Inhalte/Werte protokolliert (sonst
-- Zweitkopie von Gesundheitsdaten), nur Tabelle, Aktion, Zeilen-ID,
-- geänderte Feldnamen, Akteur, Zeitpunkt.

CREATE TABLE IF NOT EXISTS coach_audit_log (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  coach_user_id   uuid,             -- Daten-Eigentümer (NULL bei gelöschtem Profil)
  actor_user_id   uuid,             -- auth.uid() des Handelnden (NULL = Systemkontext)
  tabelle         text NOT NULL,
  aktion          text NOT NULL CHECK (aktion IN ('INSERT','UPDATE','DELETE')),
  zeilen_id       uuid,
  geaenderte_felder text[],         -- nur bei UPDATE: Feldnamen, keine Werte
  created_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE coach_audit_log IS
  'Append-only Audit des PflegeCoach (DiPA). Keine Datenwerte (Datenminimierung), nur Metadaten. Schreibzugriff ausschließlich über Trigger.';

CREATE INDEX IF NOT EXISTS idx_coach_audit_log_user ON coach_audit_log(coach_user_id, created_at DESC);

-- Trigger-Funktion: SECURITY DEFINER, damit der Eintrag unabhängig von den
-- RLS-/Grant-Beschränkungen der schreibenden Rolle gelingt.
CREATE OR REPLACE FUNCTION coach_audit_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row jsonb;
  v_owner uuid;
  v_zeile uuid;
  v_felder text[];
BEGIN
  v_row := to_jsonb(COALESCE(NEW, OLD));
  -- Eigentümer: coach_users selbst → id; shares → owner_coach_user_id; sonst coach_user_id
  v_owner := COALESCE(
    (v_row->>'coach_user_id')::uuid,
    (v_row->>'owner_coach_user_id')::uuid,
    CASE WHEN TG_TABLE_NAME = 'coach_users' THEN (v_row->>'id')::uuid END
  );
  v_zeile := (v_row->>'id')::uuid;
  IF TG_OP = 'UPDATE' THEN
    SELECT array_agg(key) INTO v_felder
    FROM jsonb_each(to_jsonb(NEW)) n
    JOIN jsonb_each(to_jsonb(OLD)) o USING (key)
    WHERE n.value IS DISTINCT FROM o.value AND key <> 'updated_at';
  END IF;
  INSERT INTO coach_audit_log (coach_user_id, actor_user_id, tabelle, aktion, zeilen_id, geaenderte_felder)
  VALUES (v_owner, auth.uid(), TG_TABLE_NAME, TG_OP, v_zeile, v_felder);
  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION coach_audit_trigger() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'coach_users','coach_consents','coach_shares','coach_assessments',
    'coach_goals','coach_activities','coach_activity_log',
    'coach_measurements','coach_reports'
  ] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_audit_' || t) THEN
      EXECUTE format(
        'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON %I
           FOR EACH ROW EXECUTE FUNCTION coach_audit_trigger()',
        'trg_audit_' || t, t);
    END IF;
  END LOOP;
END $$;

-- RLS: Nutzer liest NUR die eigenen Audit-Einträge; niemand außer dem
-- Trigger (DEFINER) schreibt; kein UPDATE/DELETE für irgendwen außer Owner-Rolle.
ALTER TABLE coach_audit_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'coach_audit_log' AND policyname = 'coach_audit_log_select_self') THEN
    CREATE POLICY coach_audit_log_select_self ON coach_audit_log FOR SELECT TO authenticated
      USING (coach_user_id IN (SELECT cu.id FROM coach_users cu WHERE cu.user_id = auth.uid()));
  END IF;
END $$;

REVOKE ALL ON coach_audit_log FROM anon;
REVOKE INSERT, UPDATE, DELETE ON coach_audit_log FROM authenticated;


-- ─── Migration 10/20: 20260819020000_billing_org_fence_haertung.sql ──────────────

-- ════════════════════════════════════════════════════════════════════════════
-- Migration: Billing Org-Fence Haertung (F1 Audit-Fix)
-- Datum: 2026-08-09
-- Branch: staging/expansion-abnahme
--
-- BEFUND F1 (HIGH): invoices und invoice_items brauchen explizite
-- org_fence RESTRICTIVE Policies. Phase-3 hat diese dynamisch erstellt,
-- aber spaetere Migrationen koennten sie ueberschrieben haben.
-- Diese Migration stellt sicher, dass:
--   1. RESTRICTIVE org_fence auf invoices und invoice_items existiert
--   2. Anon-Zugriff explizit gesperrt ist
--   3. Service-role-Bypass dokumentiert ist (SECURITY DEFINER RPCs only)
--
-- KEINE Produktionsdaten veraendert. KEINE erfundenen Preise.
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- 1. invoices: RESTRICTIVE org_fence (idempotent, DROP IF EXISTS)
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invoices_org_fence" ON public.invoices;
CREATE POLICY "invoices_org_fence" ON public.invoices
  AS RESTRICTIVE FOR ALL TO authenticated
  USING  (organization_id = public.current_org_id())
  WITH CHECK (organization_id = public.current_org_id());

-- ────────────────────────────────────────────────────────────────────────────
-- 2. invoice_items: RESTRICTIVE org_fence (idempotent)
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invoice_items_org_fence" ON public.invoice_items;
CREATE POLICY "invoice_items_org_fence" ON public.invoice_items
  AS RESTRICTIVE FOR ALL TO authenticated
  USING  (organization_id = public.current_org_id())
  WITH CHECK (organization_id = public.current_org_id());

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Sicherstellen: Kein anon-Zugriff (Defense-in-Depth)
-- ────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "invoices_anon_deny" ON public.invoices;
CREATE POLICY "invoices_anon_deny" ON public.invoices
  AS RESTRICTIVE FOR ALL TO anon
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS "invoice_items_anon_deny" ON public.invoice_items;
CREATE POLICY "invoice_items_anon_deny" ON public.invoice_items
  AS RESTRICTIVE FOR ALL TO anon
  USING (false)
  WITH CHECK (false);

-- ────────────────────────────────────────────────────────────────────────────
-- 4. invoice_disputes: gleiche Behandlung
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.invoice_disputes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invoice_disputes_org_fence" ON public.invoice_disputes;
CREATE POLICY "invoice_disputes_org_fence" ON public.invoice_disputes
  AS RESTRICTIVE FOR ALL TO authenticated
  USING  (organization_id = public.current_org_id())
  WITH CHECK (organization_id = public.current_org_id());

-- ════════════════════════════════════════════════════════════════════════════
-- VERIFIKATION (nach Apply):
--   SELECT policyname, permissive, roles, cmd
--   FROM pg_policies WHERE tablename IN ('invoices','invoice_items')
--   ORDER BY tablename, policyname;
--   -- Erwartung: je Tabelle mind. invoices_org_fence (RESTRICTIVE)
--   --           + invoices_admin_all (PERMISSIVE)
-- ════════════════════════════════════════════════════════════════════════════


-- ─── Migration 11/20: 20260820010000_medikamentenmanagement.sql ──────────────

-- ═══════════════════════════════════════════════════════════════
-- Medikamentenmanagement — erweiterte Tabellen
-- Ersetzt die alte B2C-Tabelle medikamentenplan durch eine
-- vollständige Medikamentenverwaltung mit Verabreichungs-Log.
-- ═══════════════════════════════════════════════════════════════


-- ── 1. Neue Tabelle: medikamente (ersetzt medikamentenplan) ─────

CREATE TABLE IF NOT EXISTS public.medikamente (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id     uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  medikament_name text NOT NULL,
  wirkstoff     text,
  pzn           text CHECK (pzn IS NULL OR pzn ~ '^\d{7,8}$'),
  kategorie     text NOT NULL DEFAULT 'sonstige'
                CHECK (kategorie IN (
                  'herz_kreislauf','schmerz','psychopharmaka','antibiotika',
                  'diabetes','atemwege','magen_darm','hormone',
                  'blutgerinnung','sonstige'
                )),
  darreichungsform text,
  dosierung     text NOT NULL,
  einheit       text NOT NULL DEFAULT 'mg',
  einnahme_morgens  boolean NOT NULL DEFAULT false,
  einnahme_mittags  boolean NOT NULL DEFAULT false,
  einnahme_abends   boolean NOT NULL DEFAULT false,
  einnahme_nachts   boolean NOT NULL DEFAULT false,
  einnahme_hinweis  text,
  verordnet_von text,
  beginn_datum  date,
  end_datum     date,
  dauermedikation boolean NOT NULL DEFAULT true,
  status        text NOT NULL DEFAULT 'aktiv'
                CHECK (status IN ('aktiv','pausiert','abgesetzt')),
  abgesetzt_am  timestamptz,
  abgesetzt_grund text,
  notizen       text,
  created_by    uuid REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT einnahme_mindestens_eine CHECK (
    einnahme_morgens OR einnahme_mittags OR einnahme_abends OR einnahme_nachts
  ),
  CONSTRAINT datum_konsistenz CHECK (
    beginn_datum IS NULL OR end_datum IS NULL OR beginn_datum <= end_datum
  )
);

CREATE INDEX IF NOT EXISTS idx_medikamente_client
  ON public.medikamente(client_id);
CREATE INDEX IF NOT EXISTS idx_medikamente_org
  ON public.medikamente(organization_id);
CREATE INDEX IF NOT EXISTS idx_medikamente_status
  ON public.medikamente(status) WHERE status = 'aktiv';

-- ── 2. Verabreichungs-Log ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.medikament_eingaben (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  medikament_id uuid NOT NULL REFERENCES public.medikamente(id) ON DELETE CASCADE,
  client_id     uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  einnahme_zeit text NOT NULL CHECK (einnahme_zeit IN ('morgens','mittags','abends','nachts')),
  geplant_um    timestamptz NOT NULL,
  gegeben_um    timestamptz,
  gegeben_von   uuid REFERENCES auth.users(id),
  status        text NOT NULL DEFAULT 'geplant'
                CHECK (status IN ('geplant','gegeben','verweigert','ausgelassen')),
  verweigert_grund text,
  notizen       text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_med_eingaben_medikament
  ON public.medikament_eingaben(medikament_id);
CREATE INDEX IF NOT EXISTS idx_med_eingaben_client_datum
  ON public.medikament_eingaben(client_id, geplant_um DESC);
CREATE INDEX IF NOT EXISTS idx_med_eingaben_org
  ON public.medikament_eingaben(organization_id);

-- ── 3. RLS ──────────────────────────────────────────────────────

ALTER TABLE public.medikamente ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medikament_eingaben ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  -- Org-Fence (RESTRICTIVE)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'medikamente' AND policyname = 'org_fence_medikamente') THEN
    CREATE POLICY org_fence_medikamente ON medikamente AS RESTRICTIVE FOR ALL
      USING (organization_id = current_org_id());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'medikament_eingaben' AND policyname = 'org_fence_medikament_eingaben') THEN
    CREATE POLICY org_fence_medikament_eingaben ON medikament_eingaben AS RESTRICTIVE FOR ALL
      USING (organization_id = current_org_id());
  END IF;

  -- Admin: Vollzugriff
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'medikamente' AND policyname = 'admin_medikamente_all') THEN
    CREATE POLICY admin_medikamente_all ON medikamente FOR ALL
      USING (is_admin());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'medikament_eingaben' AND policyname = 'admin_med_eingaben_all') THEN
    CREATE POLICY admin_med_eingaben_all ON medikament_eingaben FOR ALL
      USING (is_admin());
  END IF;

  -- Engel: Lesen + Eingaben erfassen für zugewiesene Klienten
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'medikamente' AND policyname = 'engel_medikamente_select') THEN
    CREATE POLICY engel_medikamente_select ON medikamente FOR SELECT
      USING (client_id IN (
        SELECT a.client_id FROM assignments a
        WHERE a.caregiver_id IN (SELECT eigene_caregiver_ids())
          AND a.status IN ('active','GEPLANT','BESTAETIGT','UNTERWEGS','GESTARTET')
      ));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'medikament_eingaben' AND policyname = 'engel_med_eingaben_select') THEN
    CREATE POLICY engel_med_eingaben_select ON medikament_eingaben FOR SELECT
      USING (client_id IN (
        SELECT a.client_id FROM assignments a
        WHERE a.caregiver_id IN (SELECT eigene_caregiver_ids())
          AND a.status IN ('active','GEPLANT','BESTAETIGT','UNTERWEGS','GESTARTET')
      ));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'medikament_eingaben' AND policyname = 'engel_med_eingaben_insert') THEN
    CREATE POLICY engel_med_eingaben_insert ON medikament_eingaben FOR INSERT
      WITH CHECK (gegeben_von = auth.uid() AND client_id IN (
        SELECT a.client_id FROM assignments a
        WHERE a.caregiver_id IN (SELECT eigene_caregiver_ids())
          AND a.status IN ('active','GEPLANT','BESTAETIGT','UNTERWEGS','GESTARTET')
      ));
  END IF;

END $$;



-- ─── Migration 12/20: 20260821010000_angehoerigenzugang.sql ──────────────

-- ═══════════════════════════════════════════════════════════════
-- Angehörigenzugang — dediziertes Portal für Angehörige
-- Zugänge, Nachrichten, Audit-Log, Benachrichtigungen
-- ═══════════════════════════════════════════════════════════════


-- ── 1. Angehörigen-Zugänge ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.angehoerigen_zugaenge (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id   uuid NOT NULL REFERENCES public.organizations(id),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id         uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  rolle             text NOT NULL CHECK (rolle IN ('angehoeriger','betreuer','bevollmaechtigter')),
  status            text NOT NULL DEFAULT 'aktiv' CHECK (status IN ('aktiv','widerrufen','abgelaufen')),
  freigegebene_bereiche text[] NOT NULL DEFAULT '{}',
  pflegeberichte_freigegeben boolean NOT NULL DEFAULT false,
  erteilt_von       uuid REFERENCES auth.users(id),
  erteilt_am        timestamptz NOT NULL DEFAULT now(),
  widerrufen_von    uuid REFERENCES auth.users(id),
  widerrufen_am     timestamptz,
  widerruf_grund    text,
  gueltig_bis       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bereiche_nicht_leer CHECK (array_length(freigegebene_bereiche, 1) > 0),
  CONSTRAINT unique_user_client UNIQUE (user_id, client_id)
);

CREATE INDEX IF NOT EXISTS idx_angeh_zugaenge_org ON public.angehoerigen_zugaenge(organization_id);
CREATE INDEX IF NOT EXISTS idx_angeh_zugaenge_client ON public.angehoerigen_zugaenge(client_id);
CREATE INDEX IF NOT EXISTS idx_angeh_zugaenge_user ON public.angehoerigen_zugaenge(user_id);
CREATE INDEX IF NOT EXISTS idx_angeh_zugaenge_status ON public.angehoerigen_zugaenge(status) WHERE status = 'aktiv';

-- ── 2. Nachrichten ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.angehoerigen_nachrichten (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id   uuid NOT NULL REFERENCES public.organizations(id),
  zugang_id         uuid NOT NULL REFERENCES public.angehoerigen_zugaenge(id) ON DELETE CASCADE,
  client_id         uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  absender_id       uuid NOT NULL REFERENCES auth.users(id),
  absender_typ      text NOT NULL CHECK (absender_typ IN ('angehoeriger','pflegedienst')),
  betreff           text NOT NULL,
  inhalt            text NOT NULL,
  status            text NOT NULL DEFAULT 'gesendet' CHECK (status IN ('gesendet','gelesen')),
  gelesen_am        timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_angeh_nachr_org ON public.angehoerigen_nachrichten(organization_id);
CREATE INDEX IF NOT EXISTS idx_angeh_nachr_zugang ON public.angehoerigen_nachrichten(zugang_id);
CREATE INDEX IF NOT EXISTS idx_angeh_nachr_client ON public.angehoerigen_nachrichten(client_id);

-- ── 3. Audit-Log ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.angehoerigen_audit_log (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id   uuid NOT NULL REFERENCES public.organizations(id),
  zugang_id         uuid NOT NULL REFERENCES public.angehoerigen_zugaenge(id) ON DELETE CASCADE,
  user_id           uuid NOT NULL REFERENCES auth.users(id),
  client_id         uuid NOT NULL REFERENCES public.clients(id),
  aktion            text NOT NULL CHECK (aktion IN (
    'login','logout',
    'termine_eingesehen','leistungen_eingesehen',
    'pflegebericht_eingesehen','dokument_eingesehen',
    'dokument_heruntergeladen',
    'nachricht_gesendet','nachricht_gelesen',
    'profil_aktualisiert',
    'zugang_erteilt','zugang_widerrufen',
    'freigabe_geaendert'
  )),
  details           jsonb,
  ip_adresse        inet,
  user_agent        text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_angeh_audit_org ON public.angehoerigen_audit_log(organization_id);
CREATE INDEX IF NOT EXISTS idx_angeh_audit_zugang ON public.angehoerigen_audit_log(zugang_id);
CREATE INDEX IF NOT EXISTS idx_angeh_audit_user ON public.angehoerigen_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_angeh_audit_aktion ON public.angehoerigen_audit_log(aktion);
CREATE INDEX IF NOT EXISTS idx_angeh_audit_created ON public.angehoerigen_audit_log(created_at DESC);

-- ── 4. Benachrichtigungen ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.angehoerigen_benachrichtigungen (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id   uuid NOT NULL REFERENCES public.organizations(id),
  zugang_id         uuid NOT NULL REFERENCES public.angehoerigen_zugaenge(id) ON DELETE CASCADE,
  typ               text NOT NULL CHECK (typ IN ('push','email')),
  betreff           text NOT NULL,
  inhalt            text NOT NULL,
  gesendet_am       timestamptz,
  gelesen_am        timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_angeh_benachr_org ON public.angehoerigen_benachrichtigungen(organization_id);
CREATE INDEX IF NOT EXISTS idx_angeh_benachr_zugang ON public.angehoerigen_benachrichtigungen(zugang_id);

-- ── 5. RLS ─────────────────────────────────────────────────────

ALTER TABLE public.angehoerigen_zugaenge ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.angehoerigen_nachrichten ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.angehoerigen_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.angehoerigen_benachrichtigungen ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  -- Org-Fence (RESTRICTIVE)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'angehoerigen_zugaenge' AND policyname = 'org_fence_angeh_zugaenge') THEN
    CREATE POLICY org_fence_angeh_zugaenge ON angehoerigen_zugaenge AS RESTRICTIVE FOR ALL
      USING (organization_id = current_org_id());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'angehoerigen_nachrichten' AND policyname = 'org_fence_angeh_nachrichten') THEN
    CREATE POLICY org_fence_angeh_nachrichten ON angehoerigen_nachrichten AS RESTRICTIVE FOR ALL
      USING (organization_id = current_org_id());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'angehoerigen_audit_log' AND policyname = 'org_fence_angeh_audit') THEN
    CREATE POLICY org_fence_angeh_audit ON angehoerigen_audit_log AS RESTRICTIVE FOR ALL
      USING (organization_id = current_org_id());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'angehoerigen_benachrichtigungen' AND policyname = 'org_fence_angeh_benachr') THEN
    CREATE POLICY org_fence_angeh_benachr ON angehoerigen_benachrichtigungen AS RESTRICTIVE FOR ALL
      USING (organization_id = current_org_id());
  END IF;

  -- Admin: Vollzugriff
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'angehoerigen_zugaenge' AND policyname = 'admin_angeh_zugaenge_all') THEN
    CREATE POLICY admin_angeh_zugaenge_all ON angehoerigen_zugaenge FOR ALL
      USING (is_admin());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'angehoerigen_nachrichten' AND policyname = 'admin_angeh_nachr_all') THEN
    CREATE POLICY admin_angeh_nachr_all ON angehoerigen_nachrichten FOR ALL
      USING (is_admin());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'angehoerigen_audit_log' AND policyname = 'admin_angeh_audit_all') THEN
    CREATE POLICY admin_angeh_audit_all ON angehoerigen_audit_log FOR ALL
      USING (is_admin());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'angehoerigen_benachrichtigungen' AND policyname = 'admin_angeh_benachr_all') THEN
    CREATE POLICY admin_angeh_benachr_all ON angehoerigen_benachrichtigungen FOR ALL
      USING (is_admin());
  END IF;

  -- Angehörige: Eigene Daten lesen + Nachrichten senden
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'angehoerigen_zugaenge' AND policyname = 'angeh_eigene_zugaenge_select') THEN
    CREATE POLICY angeh_eigene_zugaenge_select ON angehoerigen_zugaenge FOR SELECT
      USING (user_id = auth.uid() AND status = 'aktiv');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'angehoerigen_nachrichten' AND policyname = 'angeh_eigene_nachr_select') THEN
    CREATE POLICY angeh_eigene_nachr_select ON angehoerigen_nachrichten FOR SELECT
      USING (zugang_id IN (
        SELECT id FROM angehoerigen_zugaenge WHERE user_id = auth.uid() AND status = 'aktiv'
      ));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'angehoerigen_nachrichten' AND policyname = 'angeh_nachr_insert') THEN
    CREATE POLICY angeh_nachr_insert ON angehoerigen_nachrichten FOR INSERT
      WITH CHECK (
        absender_id = auth.uid()
        AND absender_typ = 'angehoeriger'
        AND zugang_id IN (
          SELECT id FROM angehoerigen_zugaenge WHERE user_id = auth.uid() AND status = 'aktiv'
        )
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'angehoerigen_benachrichtigungen' AND policyname = 'angeh_eigene_benachr_select') THEN
    CREATE POLICY angeh_eigene_benachr_select ON angehoerigen_benachrichtigungen FOR SELECT
      USING (zugang_id IN (
        SELECT id FROM angehoerigen_zugaenge WHERE user_id = auth.uid() AND status = 'aktiv'
      ));
  END IF;

  -- Audit-Log: Nur Admin lesen (oben bereits via admin_angeh_audit_all)
  -- Angehörige haben KEINEN Zugriff auf den Audit-Log

END $$;



-- ─── Migration 13/20: 20260821020000_digitale_signaturen.sql ──────────────

-- ═══════════════════════════════════════════════════════════════
-- Digitale Signaturen — Dokument-Hashing, Signatur-Hashing,
-- Audit Trail, QES-Hook-Vorbereitung
-- ═══════════════════════════════════════════════════════════════


-- ── 1. Signatur-Dokumente ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.signatur_dokumente (
  id                    uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id       uuid NOT NULL REFERENCES public.organizations(id),
  dokument_typ          text NOT NULL CHECK (dokument_typ IN (
    'leistungsnachweis','vertrag','pflegebericht',
    'protokoll','einwilligung','sonstiges'
  )),
  titel                 text NOT NULL,
  beschreibung          text,
  referenz_tabelle      text,
  referenz_id           uuid,
  dokument_hash_sha256  text NOT NULL CHECK (dokument_hash_sha256 ~ '^[a-f0-9]{64}$'),
  dokument_inhalt_snapshot text,
  erstellt_von          uuid NOT NULL REFERENCES auth.users(id),
  version               integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sig_dok_org ON public.signatur_dokumente(organization_id);
CREATE INDEX IF NOT EXISTS idx_sig_dok_typ ON public.signatur_dokumente(dokument_typ);
CREATE INDEX IF NOT EXISTS idx_sig_dok_ref ON public.signatur_dokumente(referenz_tabelle, referenz_id)
  WHERE referenz_tabelle IS NOT NULL;

-- ── 2. Signaturen ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.signaturen (
  id                    uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id       uuid NOT NULL REFERENCES public.organizations(id),
  dokument_id           uuid NOT NULL REFERENCES public.signatur_dokumente(id) ON DELETE CASCADE,
  signatar_id           uuid NOT NULL REFERENCES auth.users(id),
  signatar_name         text NOT NULL,
  signatar_rolle        text,
  status                text NOT NULL DEFAULT 'offen' CHECK (status IN ('offen','signiert','abgelehnt')),
  methode               text CHECK (methode IS NULL OR methode IN ('signaturepad','pin','checkbox','qes_extern')),
  signatur_hash_sha256  text CHECK (signatur_hash_sha256 IS NULL OR signatur_hash_sha256 ~ '^[a-f0-9]{64}$'),
  signatur_daten        text,
  signiert_am           timestamptz,
  abgelehnt_am          timestamptz,
  ablehnung_grund       text,
  ip_adresse            inet,
  user_agent            text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT signiert_hat_hash CHECK (
    status != 'signiert' OR signatur_hash_sha256 IS NOT NULL
  ),
  CONSTRAINT signiert_hat_zeitstempel CHECK (
    status != 'signiert' OR signiert_am IS NOT NULL
  ),
  CONSTRAINT abgelehnt_hat_grund CHECK (
    status != 'abgelehnt' OR ablehnung_grund IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_signaturen_org ON public.signaturen(organization_id);
CREATE INDEX IF NOT EXISTS idx_signaturen_dok ON public.signaturen(dokument_id);
CREATE INDEX IF NOT EXISTS idx_signaturen_signatar ON public.signaturen(signatar_id);
CREATE INDEX IF NOT EXISTS idx_signaturen_status ON public.signaturen(status);

-- ── 3. Signatur-Audit-Log ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.signatur_audit_log (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id   uuid NOT NULL REFERENCES public.organizations(id),
  dokument_id       uuid REFERENCES public.signatur_dokumente(id) ON DELETE SET NULL,
  signatur_id       uuid REFERENCES public.signaturen(id) ON DELETE SET NULL,
  aktion            text NOT NULL CHECK (aktion IN (
    'signatur_angefordert','signatur_geleistet','signatur_abgelehnt',
    'dokument_erstellt','hash_verifiziert','hash_ungueltig',
    'signatur_widerrufen'
  )),
  akteur_id         uuid NOT NULL REFERENCES auth.users(id),
  akteur_name       text,
  details           jsonb,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sig_audit_org ON public.signatur_audit_log(organization_id);
CREATE INDEX IF NOT EXISTS idx_sig_audit_dok ON public.signatur_audit_log(dokument_id);
CREATE INDEX IF NOT EXISTS idx_sig_audit_sig ON public.signatur_audit_log(signatur_id);
CREATE INDEX IF NOT EXISTS idx_sig_audit_created ON public.signatur_audit_log(created_at DESC);

-- ── 4. QES-Hooks (externe Provider-Integration) ────────────────

CREATE TABLE IF NOT EXISTS public.qes_hooks (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id   uuid NOT NULL REFERENCES public.organizations(id),
  provider          text NOT NULL,
  endpoint_url      text NOT NULL,
  api_key_ref       text,
  aktiv             boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_qes_hooks_org ON public.qes_hooks(organization_id);

-- ── 5. RLS ─────────────────────────────────────────────────────

ALTER TABLE public.signatur_dokumente ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signaturen ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signatur_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qes_hooks ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  -- Org-Fence (RESTRICTIVE)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'signatur_dokumente' AND policyname = 'org_fence_sig_dokumente') THEN
    CREATE POLICY org_fence_sig_dokumente ON signatur_dokumente AS RESTRICTIVE FOR ALL
      USING (organization_id = current_org_id());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'signaturen' AND policyname = 'org_fence_signaturen') THEN
    CREATE POLICY org_fence_signaturen ON signaturen AS RESTRICTIVE FOR ALL
      USING (organization_id = current_org_id());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'signatur_audit_log' AND policyname = 'org_fence_sig_audit') THEN
    CREATE POLICY org_fence_sig_audit ON signatur_audit_log AS RESTRICTIVE FOR ALL
      USING (organization_id = current_org_id());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'qes_hooks' AND policyname = 'org_fence_qes_hooks') THEN
    CREATE POLICY org_fence_qes_hooks ON qes_hooks AS RESTRICTIVE FOR ALL
      USING (organization_id = current_org_id());
  END IF;

  -- Admin: Vollzugriff
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'signatur_dokumente' AND policyname = 'admin_sig_dok_all') THEN
    CREATE POLICY admin_sig_dok_all ON signatur_dokumente FOR ALL
      USING (is_admin());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'signaturen' AND policyname = 'admin_signaturen_all') THEN
    CREATE POLICY admin_signaturen_all ON signaturen FOR ALL
      USING (is_admin());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'signatur_audit_log' AND policyname = 'admin_sig_audit_all') THEN
    CREATE POLICY admin_sig_audit_all ON signatur_audit_log FOR ALL
      USING (is_admin());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'qes_hooks' AND policyname = 'admin_qes_hooks_all') THEN
    CREATE POLICY admin_qes_hooks_all ON qes_hooks FOR ALL
      USING (is_admin());
  END IF;

  -- Signatare: Eigene offene Signaturen sehen + signieren/ablehnen
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'signaturen' AND policyname = 'signatar_eigene_select') THEN
    CREATE POLICY signatar_eigene_select ON signaturen FOR SELECT
      USING (signatar_id = auth.uid());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'signaturen' AND policyname = 'signatar_eigene_update') THEN
    CREATE POLICY signatar_eigene_update ON signaturen FOR UPDATE
      USING (signatar_id = auth.uid() AND status = 'offen')
      WITH CHECK (signatar_id = auth.uid());
  END IF;

  -- Signatare: Zugehörige Dokumente lesen
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'signatur_dokumente' AND policyname = 'signatar_dok_select') THEN
    CREATE POLICY signatar_dok_select ON signatur_dokumente FOR SELECT
      USING (id IN (
        SELECT dokument_id FROM signaturen WHERE signatar_id = auth.uid()
      ));
  END IF;

END $$;



-- ═══════════════════════════════════════════════════════════════════════════════
-- PHASE 3 — Security-Haertung (4 Migrationen)
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── Migration 14/20: 20260822010000_mis_audit_log_org_id.sql ──────────────

-- ════════════════════════════════════════════════════════════════════════════
-- Migration: mis_audit_log — organization_id Spalte + org_fence
-- Datum: 2026-08-10
-- Branch: staging/expansion-abnahme
-- P0: mis_audit_log hat keine organization_id → Cross-Tenant-Leserisiko
-- ════════════════════════════════════════════════════════════════════════════

-- 1. Spalte hinzufuegen (nullable fuer Altdaten)
ALTER TABLE public.mis_audit_log
  ADD COLUMN IF NOT EXISTS organization_id uuid;

-- 2. Altdaten-Backfill: leite org aus actor_id → organization_members ab
UPDATE public.mis_audit_log AS a
   SET organization_id = om.organization_id
  FROM public.organization_members AS om
 WHERE a.actor_id = om.user_id
   AND a.organization_id IS NULL;

-- 3. Default fuer neue Zeilen: current_org_id()
ALTER TABLE public.mis_audit_log
  ALTER COLUMN organization_id SET DEFAULT public.current_org_id();

-- 4. RESTRICTIVE org_fence Policy
DROP POLICY IF EXISTS "mis_audit_log_org_fence" ON public.mis_audit_log;
CREATE POLICY "mis_audit_log_org_fence" ON public.mis_audit_log
  AS RESTRICTIVE FOR ALL TO authenticated
  USING  (organization_id = public.current_org_id())
  WITH CHECK (organization_id = public.current_org_id());

-- 5. Anon-Deny (Defense-in-Depth)
DROP POLICY IF EXISTS "mis_audit_log_anon_deny" ON public.mis_audit_log;
CREATE POLICY "mis_audit_log_anon_deny" ON public.mis_audit_log
  AS RESTRICTIVE FOR ALL TO anon
  USING (false)
  WITH CHECK (false);

-- 6. Index fuer org_fence-Queries
CREATE INDEX IF NOT EXISTS idx_mis_audit_log_org
  ON public.mis_audit_log(organization_id);


-- ─── Migration 15/20: 20260822020000_billing_policies_is_admin.sql ──────────────

-- ════════════════════════════════════════════════════════════════════════════
-- Migration: Billing-Policies — profiles-Subquery → is_admin()
-- Datum: 2026-08-10
-- Branch: staging/expansion-abnahme
-- P1: 6 Policies nutzen EXISTS(SELECT 1 FROM profiles …) statt is_admin()
--     → 42P17-Rekursionsrisiko wenn profiles RLS-Policies aktiv
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- 1. payments: alte + neue Policy ersetzen
-- ────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can manage all payments" ON public.payments;
DROP POLICY IF EXISTS "Users can view own payments" ON public.payments;
DROP POLICY IF EXISTS "payments_admin_all" ON public.payments;

CREATE POLICY "payments_admin_all" ON public.payments
  FOR ALL TO authenticated
  USING (public.is_admin());

-- ────────────────────────────────────────────────────────────────────────────
-- 2. payment_allocations
-- ────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "alloc_admin_all" ON public.payment_allocations;

CREATE POLICY "alloc_admin_all" ON public.payment_allocations
  FOR ALL TO authenticated
  USING (public.is_admin());

-- ────────────────────────────────────────────────────────────────────────────
-- 3. dunning_entries
-- ────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "dunning_admin_all" ON public.dunning_entries;

CREATE POLICY "dunning_admin_all" ON public.dunning_entries
  FOR ALL TO authenticated
  USING (public.is_admin());

-- ────────────────────────────────────────────────────────────────────────────
-- 4. payment_differences
-- ────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "diff_admin_all" ON public.payment_differences;

CREATE POLICY "diff_admin_all" ON public.payment_differences
  FOR ALL TO authenticated
  USING (public.is_admin());

-- ────────────────────────────────────────────────────────────────────────────
-- 5. Alte 20260319-Policies auf documents (profiles-Subquery)
-- ────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can update own documents" ON public.documents;
DROP POLICY IF EXISTS "Users can delete own documents" ON public.documents;
DROP POLICY IF EXISTS "Admins can manage all documents" ON public.documents;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'documents' AND schemaname = 'public') THEN
    EXECUTE 'DROP POLICY IF EXISTS "documents_admin_all" ON public.documents';
    EXECUTE 'DROP POLICY IF EXISTS "documents_user_update" ON public.documents';
    EXECUTE 'DROP POLICY IF EXISTS "documents_user_delete" ON public.documents';
    EXECUTE 'CREATE POLICY "documents_admin_all" ON public.documents FOR ALL TO authenticated USING (public.is_admin())';
    EXECUTE 'CREATE POLICY "documents_user_update" ON public.documents FOR UPDATE TO authenticated USING (user_id = auth.uid())';
    EXECUTE 'CREATE POLICY "documents_user_delete" ON public.documents FOR DELETE TO authenticated USING (user_id = auth.uid())';
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 6. Alte Policy auf mis_audit_log (profiles-Subquery)
-- ────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can manage audits" ON public.mis_audit_log;
DROP POLICY IF EXISTS "Admins can read audit log" ON public.mis_audit_log;
DROP POLICY IF EXISTS "Admin full access on mis_audit_log" ON public.mis_audit_log;

CREATE POLICY "mis_audit_log_admin_all" ON public.mis_audit_log
  FOR ALL TO authenticated
  USING (public.is_admin());


-- ─── Migration 16/20: 20260823010000_secdef_trigger_revoke.sql ──────────────

-- ════════════════════════════════════════════════════════════════════════════
-- Migration: SECURITY-DEFINER-Funktionen — EXECUTE-Rechte einschraenken
-- Datum:     2026-08-10
-- Branch:    staging/expansion-abnahme
--
-- BEFUND (aus audit/STAGING_STATUS_2026-08-10.md):
--   19 SECURITY-DEFINER-Funktionen im public-Schema ohne REVOKE.
--   Durch Default-Privileges in Supabase sind alle per EXECUTE fuer
--   anon und PUBLIC aufrufbar.
--
-- AUFTEILUNG:
--   A) 17 TRIGGER-Funktionen: kein User braucht EXECUTE — der Trigger-
--      Mechanismus ruft die Funktion unabhaengig von den Aufrufrechten.
--      → REVOKE ALL FROM PUBLIC, anon, authenticated; GRANT TO service_role.
--
--   B) 2 Non-Trigger (is_internal_staff, state_flag): werden in
--      RLS-Policies ausgewertet. Anon/authenticated brauchen EXECUTE
--      fuer die Policy-Auswertung. PUBLIC-Grant entziehen, explizite
--      Grants behalten.
--
-- Idempotent. Rollback: 20260823010001_rollback_secdef_trigger_revoke.sql
-- ════════════════════════════════════════════════════════════════════════════


-- ── A) 17 Trigger-Funktionen: EXECUTE komplett entziehen ───────────────────
DO $$
DECLARE
  sig text;
  n   integer := 0;
  trigger_fns text[] := ARRAY[
    'audit_invoice_status_change',
    'prevent_messages_field_tampering',
    'prevent_notifications_field_tampering',
    'prevent_privileged_role_insert',
    'audit_service_record_change',
    'enforce_tariff_obergrenze',
    'enforce_kassentarif_freigeschaltet',
    'enforce_kassenrechnung_freigeschaltet',
    'enforce_booking_zahlungsart',
    'enforce_state_settings_kanal',
    'audit_state_settings_immer',
    'log_arbeitszeit_korrektur',
    'check_aufgabe_eskalation',
    'create_recurring_aufgabe',
    'compute_signature_hash',
    'prevent_locked_record_change',
    'seed_state_settings_for_org'
  ];
  FOR sig IN
    SELECT p.oid::regprocedure::text
    FROM pg_proc p
    JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
    WHERE nsp.nspname = 'public'
      AND p.proname = ANY(trigger_fns)
      AND p.prosecdef = true
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', sig);
    n := n + 1;
    RAISE NOTICE 'trigger-fn abgesichert: %', sig;
  END LOOP;

  RAISE NOTICE '% Trigger-Funktion(en) abgesichert', n;
END $$;

-- ── B) Non-Trigger SECDEF: PUBLIC-Grant entziehen, explizite Grants behalten
DO $$
DECLARE
  sig text;
  n   integer := 0;
  nontrigger_fns text[] := ARRAY[
    'is_internal_staff',
    'state_flag'
  ];
  FOR sig IN
    SELECT p.oid::regprocedure::text
    FROM pg_proc p
    JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
    WHERE nsp.nspname = 'public'
      AND p.proname = ANY(nontrigger_fns)
      AND p.prosecdef = true
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', sig);
    n := n + 1;
    RAISE NOTICE 'non-trigger-fn PUBLIC-revoke: %', sig;
  END LOOP;

  RAISE NOTICE '% Non-Trigger-Funktion(en) PUBLIC-revoked', n;
END $$;

-- is_internal_staff braucht EXECUTE fuer anon, weil RLS-Policies auf
-- MIS-Tabellen es evaluieren. Ohne Aufrufrecht bricht die Policy mit
-- permission-denied statt 0 Zeilen. REVOKE von anon ist NUR sicher,
-- wenn gleichzeitig SELECT auf den betroffenen Tabellen entzogen wird.
DO $$
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'is_internal_staff' AND p.prosecdef
  ) THEN
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION %s TO anon',
      (SELECT p.oid::regprocedure::text FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'is_internal_staff' LIMIT 1)
    );
    RAISE NOTICE 'is_internal_staff: anon-Grant beibehalten (RLS-Abhaengigkeit)';
  END IF;
END $$;

-- state_flag braucht EXECUTE fuer anon wegen Warteliste-RLS-Policy.
DO $$
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'state_flag' AND p.prosecdef
  ) THEN
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION %s TO anon',
      (SELECT p.oid::regprocedure::text FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'state_flag' LIMIT 1)
    );
    RAISE NOTICE 'state_flag: anon-Grant beibehalten (Warteliste-RLS)';
  END IF;
END $$;

-- ── C) search_path bei allen SECDEF-Funktionen ohne search_path setzen ─────
DO $$
DECLARE
  sig text;
  n   integer := 0;
  FOR sig IN
    SELECT p.oid::regprocedure::text
    FROM pg_proc p
    JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
    WHERE nsp.nspname = 'public'
      AND p.prosecdef
      AND NOT EXISTS (
        SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) c
        WHERE c LIKE 'search_path=%'
      )
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path TO public, pg_temp', sig);
    n := n + 1;
    RAISE NOTICE 'search_path gesetzt: %', sig;
  END LOOP;
  RAISE NOTICE '% Funktion(en) search_path nachgezogen', n;
END $$;


-- ── VERIFIKATION ────────────────────────────────────────────────────────────
-- SELECT p.proname,
--        has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon,
--        has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth,
--        has_function_privilege('service_role',  p.oid, 'EXECUTE') AS svc
-- FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public' AND p.prosecdef;
--
-- Erwartet:
--   Trigger-Funktionen: anon=false, auth=false, svc=true
--   is_internal_staff:  anon=true,  auth=true,  svc=true
--   state_flag:         anon=true,  auth=true,  svc=true


-- ─── Migration 17/20: 20260823020000_profiles_subquery_to_is_admin.sql ──────────────

-- ════════════════════════════════════════════════════════════════════════════
-- Migration: profiles-Subquery in RLS-Policies → is_admin()
-- Datum:     2026-08-10
-- Branch:    staging/expansion-abnahme
--
-- BEFUND (audit/STAGING_STATUS_2026-08-10.md §3.3):
--   44 aktive RLS-Policies nutzen
--     EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
--   statt public.is_admin().
--
--   Risiko: 42P17 Infinite-Recursion wenn profiles-RLS aktiv ist und die
--   Policy-Auswertung transitiv ueber profiles zuruecklaeuft.
--   is_admin() ist SECURITY DEFINER und umgeht RLS — kein Zyklus.
--
-- BETROFFENE MODULE:
--   1. Workflow-Engine   (7 wf_*-Tabellen)        — 20260813010000
--   2. Pflegedokumentation (8 pflege_*-Tabellen)   — 20260810010000
--   3. Aufgaben/Kommunikation (13 ops_*-Tabellen)  — 20260812010000
--   4. Personalmanagement (7 personal_*-Tabellen)  — 20260811010000
--   5. Legacy-Tabellen   (9 Tabellen)              — 20260319000000
--
-- STRATEGIE: DROP POLICY IF EXISTS + CREATE POLICY mit is_admin().
-- Idempotent. Rollback: 20260823020001_rollback_profiles_subquery_to_is_admin.sql
-- ════════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════════════
-- 1. WORKFLOW-ENGINE — 7 Policies
-- ════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS wf_events_admin_all ON public.wf_events;
CREATE POLICY wf_events_admin_all ON public.wf_events
  FOR ALL TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS wf_regeln_admin_all ON public.wf_regeln;
CREATE POLICY wf_regeln_admin_all ON public.wf_regeln
  FOR ALL TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS wf_aktionen_admin_all ON public.wf_aktionen;
CREATE POLICY wf_aktionen_admin_all ON public.wf_aktionen
  FOR ALL TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS wf_ausfuehrungen_admin_all ON public.wf_ausfuehrungen;
CREATE POLICY wf_ausfuehrungen_admin_all ON public.wf_ausfuehrungen
  FOR ALL TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS wf_warteschlange_admin_all ON public.wf_warteschlange;
CREATE POLICY wf_warteschlange_admin_all ON public.wf_warteschlange
  FOR ALL TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS wf_dead_letter_admin_all ON public.wf_dead_letter;
CREATE POLICY wf_dead_letter_admin_all ON public.wf_dead_letter
  FOR ALL TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS wf_audit_admin_all ON public.wf_audit_log;
CREATE POLICY wf_audit_admin_all ON public.wf_audit_log
  FOR ALL TO authenticated
  USING (public.is_admin());

-- ════════════════════════════════════════════════════════════════════════════
-- 2. PFLEGEDOKUMENTATION — 8 Policies
-- ════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS admin_pflege_aufnahmen ON public.pflege_aufnahmen;
CREATE POLICY admin_pflege_aufnahmen ON public.pflege_aufnahmen
  FOR ALL TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS admin_pflege_anamnesen ON public.pflege_anamnesen;
CREATE POLICY admin_pflege_anamnesen ON public.pflege_anamnesen
  FOR ALL TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS admin_pflege_diagnosen ON public.pflege_diagnosen;
CREATE POLICY admin_pflege_diagnosen ON public.pflege_diagnosen
  FOR ALL TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS admin_pflege_risiken ON public.pflege_risiken;
CREATE POLICY admin_pflege_risiken ON public.pflege_risiken
  FOR ALL TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS admin_pflege_massnahmenplaene ON public.pflege_massnahmenplaene;
CREATE POLICY admin_pflege_massnahmenplaene ON public.pflege_massnahmenplaene
  FOR ALL TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS admin_pflege_massnahmen ON public.pflege_massnahmen;
CREATE POLICY admin_pflege_massnahmen ON public.pflege_massnahmen
  FOR ALL TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS admin_pflege_verlauf ON public.pflege_verlauf;
CREATE POLICY admin_pflege_verlauf ON public.pflege_verlauf
  FOR ALL TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS admin_pflege_doku_perioden ON public.pflege_doku_perioden;
CREATE POLICY admin_pflege_doku_perioden ON public.pflege_doku_perioden
  FOR ALL TO authenticated
  USING (public.is_admin());

-- ════════════════════════════════════════════════════════════════════════════
-- 3. AUFGABEN & KOMMUNIKATION — 13 Policies
-- ════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "ops_aufgaben_admin_all" ON public.ops_aufgaben;
CREATE POLICY "ops_aufgaben_admin_all" ON public.ops_aufgaben
  FOR ALL TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "ops_checklisten_admin_all" ON public.ops_aufgaben_checklisten;
CREATE POLICY "ops_checklisten_admin_all" ON public.ops_aufgaben_checklisten
  FOR ALL TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "ops_kommentare_admin_all" ON public.ops_aufgaben_kommentare;
CREATE POLICY "ops_kommentare_admin_all" ON public.ops_aufgaben_kommentare
  FOR ALL TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "ops_anhaenge_admin_all" ON public.ops_aufgaben_anhaenge;
CREATE POLICY "ops_anhaenge_admin_all" ON public.ops_aufgaben_anhaenge
  FOR ALL TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "ops_wiedervorlagen_admin_all" ON public.ops_wiedervorlagen;
CREATE POLICY "ops_wiedervorlagen_admin_all" ON public.ops_wiedervorlagen
  FOR ALL TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "ops_eskalationsregeln_admin_all" ON public.ops_eskalationsregeln;
CREATE POLICY "ops_eskalationsregeln_admin_all" ON public.ops_eskalationsregeln
  FOR ALL TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "ops_eskalation_admin_all" ON public.ops_eskalationshistorie;
CREATE POLICY "ops_eskalation_admin_all" ON public.ops_eskalationshistorie
  FOR ALL TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "ops_nachrichten_admin_all" ON public.ops_nachrichten;
CREATE POLICY "ops_nachrichten_admin_all" ON public.ops_nachrichten
  FOR ALL TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "ops_empfaenger_admin_all" ON public.ops_nachrichten_empfaenger;
CREATE POLICY "ops_empfaenger_admin_all" ON public.ops_nachrichten_empfaenger
  FOR ALL TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "ops_benach_admin_all" ON public.ops_benachrichtigungen;
CREATE POLICY "ops_benach_admin_all" ON public.ops_benachrichtigungen
  FOR ALL TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "ops_praef_admin_all" ON public.ops_benachrichtigungs_praeferenzen;
CREATE POLICY "ops_praef_admin_all" ON public.ops_benachrichtigungs_praeferenzen
  FOR ALL TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "ops_ereignis_admin_all" ON public.ops_ereignis_regeln;
CREATE POLICY "ops_ereignis_admin_all" ON public.ops_ereignis_regeln
  FOR ALL TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "ops_log_admin_all" ON public.ops_aktivitaetslog;
CREATE POLICY "ops_log_admin_all" ON public.ops_aktivitaetslog
  FOR ALL TO authenticated
  USING (public.is_admin());

-- ════════════════════════════════════════════════════════════════════════════
-- 4. PERSONALMANAGEMENT — 7 Policies
-- ════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS admin_personal_schulungen ON public.personal_schulungen;
CREATE POLICY admin_personal_schulungen ON public.personal_schulungen
  FOR ALL TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS admin_dienstplan_schichten ON public.dienstplan_schichten;
CREATE POLICY admin_dienstplan_schichten ON public.dienstplan_schichten
  FOR ALL TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS admin_dienstplan_eintraege ON public.dienstplan_eintraege;
CREATE POLICY admin_dienstplan_eintraege ON public.dienstplan_eintraege
  FOR ALL TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS admin_personal_urlaubskonto ON public.personal_urlaubskonto;
CREATE POLICY admin_personal_urlaubskonto ON public.personal_urlaubskonto
  FOR ALL TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS admin_personal_arbeitszeiten ON public.personal_arbeitszeiten;
CREATE POLICY admin_personal_arbeitszeiten ON public.personal_arbeitszeiten
  FOR ALL TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS admin_personal_zeitkorrekturen ON public.personal_zeitkorrekturen;
CREATE POLICY admin_personal_zeitkorrekturen ON public.personal_zeitkorrekturen
  FOR ALL TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS admin_personal_audit_log ON public.personal_audit_log;
CREATE POLICY admin_personal_audit_log ON public.personal_audit_log
  FOR ALL TO authenticated
  USING (public.is_admin());

-- ════════════════════════════════════════════════════════════════════════════
-- 5. LEGACY-TABELLEN — 9 Policies (einige Tabellen existieren nur bedingt)
-- ════════════════════════════════════════════════════════════════════════════

-- 5a) messages — immer vorhanden
DROP POLICY IF EXISTS "Admins can manage all messages" ON public.messages;
DROP POLICY IF EXISTS "messages_admin_all" ON public.messages;
CREATE POLICY "messages_admin_all" ON public.messages
  FOR ALL TO authenticated
  USING (public.is_admin());

-- 5b) notifications — immer vorhanden
DROP POLICY IF EXISTS "Admins can manage all notifications" ON public.notifications;
DROP POLICY IF EXISTS "notifications_admin_all" ON public.notifications;
CREATE POLICY "notifications_admin_all" ON public.notifications
  FOR ALL TO authenticated
  USING (public.is_admin());

-- 5c) reviews — "Admins can manage all reviews" hat profiles-subquery;
--     "Admins can read all reviews" (20260414, is_admin()) ist redundant
--     wenn FOR ALL existiert.
DROP POLICY IF EXISTS "Admins can manage all reviews" ON public.reviews;
DROP POLICY IF EXISTS "Admins can read all reviews" ON public.reviews;
DROP POLICY IF EXISTS "reviews_admin_all" ON public.reviews;
CREATE POLICY "reviews_admin_all" ON public.reviews
  FOR ALL TO authenticated
  USING (public.is_admin());

-- 5d) angel_reviews
DROP POLICY IF EXISTS "Admin kann alle Bewertungen verwalten" ON public.angel_reviews;
DROP POLICY IF EXISTS "Admins can manage all reviews" ON public.angel_reviews;
DROP POLICY IF EXISTS "angel_reviews_admin_all" ON public.angel_reviews;
CREATE POLICY "angel_reviews_admin_all" ON public.angel_reviews
  FOR ALL TO authenticated
  USING (public.is_admin());

-- 5e) page_views
DROP POLICY IF EXISTS "Admins can read page views" ON public.page_views;
DROP POLICY IF EXISTS "page_views_admin_select" ON public.page_views;
CREATE POLICY "page_views_admin_select" ON public.page_views
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- 5f) Bedingt existierende Tabellen
DO $$
  -- care_eligibility
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'care_eligibility') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Admins can manage all eligibility" ON public.care_eligibility';
    EXECUTE 'DROP POLICY IF EXISTS "care_eligibility_admin_all" ON public.care_eligibility';
    EXECUTE 'CREATE POLICY "care_eligibility_admin_all" ON public.care_eligibility FOR ALL TO authenticated USING (public.is_admin())';
    RAISE NOTICE 'care_eligibility: Policy ersetzt';
  END IF;

  -- carebox_cart
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'carebox_cart') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Admins can manage all carts" ON public.carebox_cart';
    EXECUTE 'DROP POLICY IF EXISTS "carebox_cart_admin_all" ON public.carebox_cart';
    EXECUTE 'CREATE POLICY "carebox_cart_admin_all" ON public.carebox_cart FOR ALL TO authenticated USING (public.is_admin())';
    RAISE NOTICE 'carebox_cart: Policy ersetzt';
  END IF;

  -- carebox_order_requests
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'carebox_order_requests') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Admins can manage all orders" ON public.carebox_order_requests';
    EXECUTE 'DROP POLICY IF EXISTS "carebox_orders_admin_all" ON public.carebox_order_requests';
    EXECUTE 'CREATE POLICY "carebox_orders_admin_all" ON public.carebox_order_requests FOR ALL TO authenticated USING (public.is_admin())';
    RAISE NOTICE 'carebox_order_requests: Policy ersetzt';
  END IF;

  -- carebox_catalog_items
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'carebox_catalog_items') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Admins can manage catalog" ON public.carebox_catalog_items';
    EXECUTE 'DROP POLICY IF EXISTS "carebox_catalog_admin_all" ON public.carebox_catalog_items';
    EXECUTE 'CREATE POLICY "carebox_catalog_admin_all" ON public.carebox_catalog_items FOR ALL TO authenticated USING (public.is_admin())';
    RAISE NOTICE 'carebox_catalog_items: Policy ersetzt';
  END IF;
END $$;


-- ── VERIFIKATION ────────────────────────────────────────────────────────────
-- Keine Policy darf mehr profiles-Subquery nutzen:
--
-- SELECT schemaname, tablename, policyname, qual
-- FROM pg_policies
-- WHERE schemaname = 'public'
--   AND qual LIKE '%profiles%'
--   AND qual NOT LIKE '%is_admin%';
--
-- Erwartet: 0 Zeilen.


-- ═══════════════════════════════════════════════════════════════════════════════
-- PHASE 4 — P0/P1 Fixes (3 Migrationen)
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── Migration 18/20: 20260824010000_p0_race_condition_fixes.sql ──────────────

-- ============================================================
-- Migration: P0 Race Condition Fixes
-- Datum: 2026-08-10
-- Beschreibung:
--   1. abrechnungslaeufe.idempotency_key + UNIQUE (Duplikat-Schutz)
--   2. wf_process_event() CAS-Bedingung (Concurrent State Transition)
--   3. wf_execute_queue_item() CAS-Bedingung (Concurrent State Transition)
-- ============================================================

-- ============================================================
-- FIX 1: Abrechnungslauf-Duplikate (P0-16)
-- idempotency_key verhindert doppelte Erstellung durch parallele Requests
-- ============================================================

ALTER TABLE public.abrechnungslaeufe
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_abrechnungslaeufe_idempotency
  ON public.abrechnungslaeufe (idempotency_key)
  WHERE idempotency_key IS NOT NULL AND status NOT IN ('storniert', 'abgelehnt');

-- ============================================================
-- FIX 2: wf_process_event() — CAS statt TOCTOU (P0-17a)
-- SELECT ... AND status='neu' + UPDATE ohne Bedingung =
--   zwei concurrent Calls verarbeiten dasselbe Event doppelt.
-- Fix: UPDATE ... WHERE status='neu' RETURNING, Skip wenn 0 Zeilen.
-- ============================================================

CREATE OR REPLACE FUNCTION public.wf_process_event(p_event_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event RECORD;
  v_regel RECORD;
  v_aktion RECORD;
  v_matched boolean;
  v_count integer := 0;
  v_ausfuehrung_id uuid;
  v_cooldown_ok boolean;
  v_exec_count integer;
  v_claimed_id uuid;
BEGIN
  -- CAS: atomically claim the event
  UPDATE public.wf_events
    SET status = 'in_bearbeitung'
    WHERE id = p_event_id AND status = 'neu'
    RETURNING id INTO v_claimed_id;

  IF v_claimed_id IS NULL THEN RETURN 0; END IF;

  -- Event laden (status ist jetzt 'in_bearbeitung')
  SELECT * INTO v_event FROM public.wf_events WHERE id = p_event_id;

  -- Passende Regeln suchen
  FOR v_regel IN
    SELECT * FROM public.wf_regeln
    WHERE event_typ = v_event.event_typ
      AND organization_id = v_event.organization_id
      AND aktiv = true
    ORDER BY prioritaet DESC
  LOOP
    -- Cooldown pruefen
    v_cooldown_ok := true;
    IF v_regel.cooldown_minuten IS NOT NULL THEN
      SELECT NOT EXISTS (
        SELECT 1 FROM public.wf_ausfuehrungen a
        JOIN public.wf_events e ON e.id = a.event_id
        WHERE a.regel_id = v_regel.id
          AND a.status = 'erfolgreich'
          AND e.quell_id = v_event.quell_id
          AND a.created_at > now() - (v_regel.cooldown_minuten || ' minutes')::interval
      ) INTO v_cooldown_ok;
    END IF;

    IF NOT v_cooldown_ok THEN CONTINUE; END IF;

    -- Max-Ausfuehrungen pruefen
    IF v_regel.max_ausfuehrungen_pro_entity IS NOT NULL THEN
      SELECT COUNT(*) INTO v_exec_count
      FROM public.wf_ausfuehrungen a
      JOIN public.wf_events e ON e.id = a.event_id
      WHERE a.regel_id = v_regel.id
        AND a.status = 'erfolgreich'
        AND e.quell_id = v_event.quell_id;

      IF v_exec_count >= v_regel.max_ausfuehrungen_pro_entity THEN CONTINUE; END IF;
    END IF;

    -- Bedingungen auswerten (JSON-basiert)
    v_matched := public.wf_evaluate_conditions(v_regel.bedingungen, v_event.payload);
    IF NOT v_matched THEN
      INSERT INTO public.wf_audit_log (organization_id, typ, entitaet_typ, entitaet_id, aktion, details)
      VALUES (v_event.organization_id, 'regel_ausgewertet', 'wf_regeln', v_regel.id,
              'bedingung_nicht_erfuellt', jsonb_build_object('event_id', p_event_id));
      CONTINUE;
    END IF;

    -- Aktionen der Regel ausfuehren
    FOR v_aktion IN
      SELECT * FROM public.wf_aktionen
      WHERE regel_id = v_regel.id AND aktiv = true
      ORDER BY reihenfolge
    LOOP
      INSERT INTO public.wf_warteschlange (
        organization_id, event_id, regel_id, aktion_id, prioritaet
      ) VALUES (
        v_event.organization_id, p_event_id, v_regel.id, v_aktion.id, v_regel.prioritaet
      );

      v_count := v_count + 1;
    END LOOP;

    -- Audit: Regel gematcht
    INSERT INTO public.wf_audit_log (organization_id, typ, entitaet_typ, entitaet_id, aktion, details)
    VALUES (v_event.organization_id, 'regel_ausgewertet', 'wf_regeln', v_regel.id,
            'gematcht', jsonb_build_object('event_id', p_event_id, 'aktionen_count', v_count));
  END LOOP;

  -- Event als verarbeitet markieren
  UPDATE public.wf_events SET status = 'verarbeitet', verarbeitet_am = now() WHERE id = p_event_id;

  RETURN v_count;
END;
$$;

-- ============================================================
-- FIX 3: wf_execute_queue_item() — CAS statt TOCTOU (P0-17b)
-- Selbes Pattern: SELECT WHERE status='wartend' dann UPDATE ohne Bedingung.
-- Fix: UPDATE ... WHERE status='wartend' RETURNING als atomarer Claim.
-- ============================================================

CREATE OR REPLACE FUNCTION public.wf_execute_queue_item(p_queue_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item RECORD;
  v_aktion RECORD;
  v_event RECORD;
  v_regel RECORD;
  v_result jsonb;
  v_created_id uuid;
  v_created_type text;
  v_success boolean := false;
  v_claimed_id uuid;
BEGIN
  -- CAS: atomically claim the queue item
  UPDATE public.wf_warteschlange
    SET status = 'in_bearbeitung', updated_at = now()
    WHERE id = p_queue_id AND status = 'wartend'
    RETURNING id INTO v_claimed_id;

  IF v_claimed_id IS NULL THEN RETURN false; END IF;

  -- Queue-Item laden (status ist jetzt 'in_bearbeitung')
  SELECT * INTO v_item FROM public.wf_warteschlange WHERE id = p_queue_id;

  -- Aktion, Event, Regel laden
  SELECT * INTO v_aktion FROM public.wf_aktionen WHERE id = v_item.aktion_id;
  SELECT * INTO v_event FROM public.wf_events WHERE id = v_item.event_id;
  SELECT * INTO v_regel FROM public.wf_regeln WHERE id = v_item.regel_id;

  BEGIN
    CASE v_aktion.typ
      WHEN 'aufgabe_erstellen' THEN
        INSERT INTO public.ops_aufgaben (
          organization_id, titel, beschreibung, kategorie, prioritaet,
          status, faellig_am, verantwortlich_id, erstellt_von,
          client_id, caregiver_id, assignment_id
        ) VALUES (
          v_event.organization_id,
          COALESCE(v_aktion.konfiguration->>'titel', v_regel.bezeichnung),
          COALESCE(v_aktion.konfiguration->>'beschreibung', '') || E'\n\n[Auto-Workflow: ' || v_regel.bezeichnung || ']',
          COALESCE(v_aktion.konfiguration->>'kategorie', 'verwaltung'),
          COALESCE(v_aktion.konfiguration->>'prioritaet', 'normal'),
          'offen',
          CASE WHEN v_aktion.konfiguration->>'frist_tage' IS NOT NULL
            THEN now() + ((v_aktion.konfiguration->>'frist_tage')::integer || ' days')::interval
            ELSE now() + interval '7 days'
          END,
          CASE WHEN v_aktion.konfiguration->>'verantwortlich_rolle' = 'admin'
            THEN (SELECT om.user_id FROM public.organization_members om JOIN public.profiles p ON p.id = om.user_id WHERE om.organization_id = v_event.organization_id AND p.role = 'admin' LIMIT 1)
            ELSE (v_event.payload->>'verantwortlich_id')::uuid
          END,
          NULL,
          (v_event.payload->>'client_id')::uuid,
          (v_event.payload->>'caregiver_id')::uuid,
          (v_event.payload->>'assignment_id')::uuid
        )
        RETURNING id INTO v_created_id;

        v_created_type := 'ops_aufgaben';
        v_result := jsonb_build_object('aufgabe_id', v_created_id);

      WHEN 'benachrichtigung_senden' THEN
        INSERT INTO public.ops_benachrichtigungen (
          organization_id, empfaenger_id, titel, inhalt,
          kategorie, typ,
          bezug_typ, bezug_id
        ) VALUES (
          v_event.organization_id,
          COALESCE(
            (v_aktion.konfiguration->>'empfaenger_id')::uuid,
            CASE WHEN v_aktion.konfiguration->>'empfaenger_rolle' = 'admin'
              THEN (SELECT om.user_id FROM public.organization_members om JOIN public.profiles p ON p.id = om.user_id WHERE om.organization_id = v_event.organization_id AND p.role = 'admin' LIMIT 1)
              ELSE (v_event.payload->>'verantwortlich_id')::uuid
            END
          ),
          COALESCE(v_aktion.konfiguration->>'titel', v_regel.bezeichnung),
          COALESCE(v_aktion.konfiguration->>'nachricht', v_regel.beschreibung, ''),
          COALESCE(v_aktion.konfiguration->>'kategorie', 'system'),
          COALESCE(v_aktion.konfiguration->>'typ', 'info'),
          v_event.quell_tabelle,
          v_event.quell_id
        )
        RETURNING id INTO v_created_id;

        v_created_type := 'ops_benachrichtigungen';
        v_result := jsonb_build_object('benachrichtigung_id', v_created_id);

      WHEN 'wiedervorlage_erstellen' THEN
        INSERT INTO public.ops_wiedervorlagen (
          organization_id, titel, beschreibung,
          faellig_am, empfaenger_id, erstellt_von,
          entitaet_typ, entitaet_id, status
        ) VALUES (
          v_event.organization_id,
          COALESCE(v_aktion.konfiguration->>'titel', v_regel.bezeichnung),
          COALESCE(v_aktion.konfiguration->>'beschreibung', ''),
          CASE WHEN v_aktion.konfiguration->>'frist_tage' IS NOT NULL
            THEN now() + ((v_aktion.konfiguration->>'frist_tage')::integer || ' days')::interval
            ELSE now() + interval '14 days'
          END,
          COALESCE(
            (v_aktion.konfiguration->>'empfaenger_id')::uuid,
            (SELECT om.user_id FROM public.organization_members om JOIN public.profiles p ON p.id = om.user_id WHERE om.organization_id = v_event.organization_id AND p.role = 'admin' LIMIT 1)
          ),
          NULL,
          COALESCE(v_event.quell_tabelle, 'allgemein'),
          v_event.quell_id,
          'aktiv'
        )
        RETURNING id INTO v_created_id;

        v_created_type := 'ops_wiedervorlagen';
        v_result := jsonb_build_object('wiedervorlage_id', v_created_id);

      WHEN 'eskalation_ausloesen' THEN
        INSERT INTO public.ops_eskalationshistorie (
          organization_id, aufgabe_id, eskalationsstufe, eskaliert_an, grund
        ) VALUES (
          v_event.organization_id,
          (v_event.payload->>'aufgabe_id')::uuid,
          COALESCE((v_aktion.konfiguration->>'stufe')::integer, 1),
          COALESCE(
            (v_aktion.konfiguration->>'eskaliert_an')::uuid,
            (SELECT om.user_id FROM public.organization_members om JOIN public.profiles p ON p.id = om.user_id WHERE om.organization_id = v_event.organization_id AND p.role = 'admin' LIMIT 1)
          ),
          COALESCE(v_aktion.konfiguration->>'grund', 'Automatische Eskalation durch Workflow-Engine')
        )
        RETURNING id INTO v_created_id;

        v_created_type := 'ops_eskalationshistorie';
        v_result := jsonb_build_object('eskalation_id', v_created_id);

      WHEN 'status_aendern' THEN
        IF v_event.quell_tabelle IN ('invoices','service_records','ops_aufgaben','ops_wiedervorlagen','dunning_entries') THEN
          EXECUTE format(
            'UPDATE public.%I SET %I = $1 WHERE id = $2 AND organization_id = $3',
            v_event.quell_tabelle,
            COALESCE(v_aktion.konfiguration->>'feld', 'status')
          ) USING v_aktion.konfiguration->>'neuer_wert', v_event.quell_id, v_event.organization_id;

          v_result := jsonb_build_object('tabelle', v_event.quell_tabelle, 'neuer_status', v_aktion.konfiguration->>'neuer_wert');
        ELSE
          RAISE EXCEPTION 'Status-Aenderung auf Tabelle % nicht erlaubt', v_event.quell_tabelle;
        END IF;

        v_created_type := v_event.quell_tabelle;
        v_created_id := v_event.quell_id;

      WHEN 'feld_aktualisieren' THEN
        IF v_event.quell_tabelle IN ('invoices','service_records','caregiver_qualifications','dunning_entries','payments') THEN
          EXECUTE format(
            'UPDATE public.%I SET %I = $1 WHERE id = $2 AND organization_id = $3',
            v_event.quell_tabelle,
            v_aktion.konfiguration->>'feld'
          ) USING v_aktion.konfiguration->>'wert', v_event.quell_id, v_event.organization_id;

          v_result := jsonb_build_object('tabelle', v_event.quell_tabelle, 'feld', v_aktion.konfiguration->>'feld');
        ELSE
          RAISE EXCEPTION 'Feld-Update auf Tabelle % nicht erlaubt', v_event.quell_tabelle;
        END IF;

        v_created_type := v_event.quell_tabelle;
        v_created_id := v_event.quell_id;

      ELSE
        RAISE EXCEPTION 'Unbekannter Aktionstyp: %', v_aktion.typ;
    END CASE;

    -- Erfolg
    UPDATE public.wf_warteschlange SET status = 'erledigt', updated_at = now() WHERE id = p_queue_id;

    INSERT INTO public.wf_ausfuehrungen (
      organization_id, event_id, regel_id, aktion_id, status,
      ergebnis, erstellt_entity_typ, erstellt_entity_id, beendet_am
    ) VALUES (
      v_event.organization_id, v_item.event_id, v_item.regel_id, v_item.aktion_id,
      'erfolgreich', v_result, v_created_type, v_created_id, now()
    );

    INSERT INTO public.wf_audit_log (organization_id, typ, entitaet_typ, entitaet_id, aktion, details)
    VALUES (v_event.organization_id, 'aktion_ausgefuehrt', COALESCE(v_created_type, 'wf_aktionen'),
            COALESCE(v_created_id, v_item.aktion_id), v_aktion.typ,
            jsonb_build_object('ergebnis', v_result, 'queue_id', p_queue_id));

    v_success := true;

  EXCEPTION WHEN OTHERS THEN
    IF v_item.versuch >= v_item.max_versuche THEN
      UPDATE public.wf_warteschlange SET status = 'dead_letter', fehler_nachricht = SQLERRM, updated_at = now()
      WHERE id = p_queue_id;

      INSERT INTO public.wf_dead_letter (
        organization_id, warteschlange_id, event_id, regel_id, aktion_id,
        fehler_nachricht, payload, versuche
      ) VALUES (
        v_event.organization_id, p_queue_id, v_item.event_id, v_item.regel_id,
        v_item.aktion_id, SQLERRM, v_event.payload, v_item.versuch
      );

      INSERT INTO public.wf_audit_log (organization_id, typ, entitaet_typ, entitaet_id, aktion, details)
      VALUES (v_event.organization_id, 'dead_letter', 'wf_warteschlange', p_queue_id,
              'max_versuche_erreicht', jsonb_build_object('fehler', SQLERRM, 'versuche', v_item.versuch));
    ELSE
      UPDATE public.wf_warteschlange
      SET status = 'wartend',
          versuch = versuch + 1,
          naechster_versuch = now() + (power(2, v_item.versuch) || ' minutes')::interval,
          fehler_nachricht = SQLERRM,
          updated_at = now()
      WHERE id = p_queue_id;

      INSERT INTO public.wf_audit_log (organization_id, typ, entitaet_typ, entitaet_id, aktion, details)
      VALUES (v_event.organization_id, 'retry', 'wf_warteschlange', p_queue_id,
              'retry_geplant', jsonb_build_object('fehler', SQLERRM, 'versuch', v_item.versuch + 1,
              'naechster', now() + (power(2, v_item.versuch) || ' minutes')::interval));
    END IF;

    INSERT INTO public.wf_ausfuehrungen (
      organization_id, event_id, regel_id, aktion_id, status, fehler_nachricht, beendet_am
    ) VALUES (
      v_event.organization_id, v_item.event_id, v_item.regel_id, v_item.aktion_id,
      'fehlgeschlagen', SQLERRM, now()
    );

    v_success := false;
  END;

  RETURN v_success;
END;
$$;

-- Re-apply REVOKE/GRANT for the replaced functions
-- REVOKEs grouped before GRANTs to avoid false positives in the SECDEF regression test
REVOKE ALL ON FUNCTION public.wf_process_event(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.wf_execute_queue_item(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wf_process_event(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.wf_execute_queue_item(uuid) TO service_role;


-- ─── Migration 19/20: 20260824020000_p1_service_record_unique.sql ──────────────

-- P1-18: Tour-Stop-Completion — Doppelte service_records verhindern
-- Verhindert, dass derselbe Caregiver für denselben Client am selben Tag
-- und zur selben Startzeit mehrere aktive Einträge anlegt.
-- Nur aktive (nicht stornierte, nicht gelöschte) Records werden geprüft.

CREATE UNIQUE INDEX IF NOT EXISTS idx_service_records_unique_entry
  ON public.service_records (caregiver_id, client_id, date, start_time)
  WHERE deleted_at IS NULL AND status != 'cancelled';


-- ─── Migration 20/20: 20260824030000_p1_missing_rls.sql ──────────────

-- P1-7 + P1-8: Billing- und Rollback-Archiv-Tabellen ohne RLS absichern
-- Alle Tabellen erhalten RLS + eine Read-Only-Policy für authentifizierte Benutzer.
-- Idempotent: DROP POLICY IF EXISTS vor CREATE, ENABLE RLS ist wiederholbar.

-- ══════════════════════════════════════════════════════════════
-- Billing-Stammdaten (read-only für alle authentifizierten)
-- ══════════════════════════════════════════════════════════════

ALTER TABLE public.billing_feiertage ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS billing_feiertage_read_auth ON public.billing_feiertage;
CREATE POLICY billing_feiertage_read_auth ON public.billing_feiertage
  FOR SELECT USING (auth.role() = 'authenticated');

ALTER TABLE public.billing_leistungsarten ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS billing_leistungsarten_read_auth ON public.billing_leistungsarten;
CREATE POLICY billing_leistungsarten_read_auth ON public.billing_leistungsarten
  FOR SELECT USING (auth.role() = 'authenticated');

ALTER TABLE public.billing_rechtsgrundlagen ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS billing_rechtsgrundlagen_read_auth ON public.billing_rechtsgrundlagen;
CREATE POLICY billing_rechtsgrundlagen_read_auth ON public.billing_rechtsgrundlagen
  FOR SELECT USING (auth.role() = 'authenticated');

ALTER TABLE public.billing_tarifquellen ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS billing_tarifquellen_read_auth ON public.billing_tarifquellen;
CREATE POLICY billing_tarifquellen_read_auth ON public.billing_tarifquellen
  FOR SELECT USING (auth.role() = 'authenticated');

-- ══════════════════════════════════════════════════════════════
-- Archiv-Tabellen (read-only für alle authentifizierten)
-- ══════════════════════════════════════════════════════════════

ALTER TABLE public.billing_landesregeln_archiv ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS billing_landesregeln_archiv_read_auth ON public.billing_landesregeln_archiv;
CREATE POLICY billing_landesregeln_archiv_read_auth ON public.billing_landesregeln_archiv
  FOR SELECT USING (auth.role() = 'authenticated');

ALTER TABLE public.billing_obergrenzen_archiv ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS billing_obergrenzen_archiv_read_auth ON public.billing_obergrenzen_archiv;
CREATE POLICY billing_obergrenzen_archiv_read_auth ON public.billing_obergrenzen_archiv
  FOR SELECT USING (auth.role() = 'authenticated');

ALTER TABLE public.billing_wegepauschalen_archiv ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS billing_wegepauschalen_archiv_read_auth ON public.billing_wegepauschalen_archiv;
CREATE POLICY billing_wegepauschalen_archiv_read_auth ON public.billing_wegepauschalen_archiv
  FOR SELECT USING (auth.role() = 'authenticated');

ALTER TABLE public.state_settings_audit_archiv ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS state_settings_audit_archiv_read_auth ON public.state_settings_audit_archiv;
CREATE POLICY state_settings_audit_archiv_read_auth ON public.state_settings_audit_archiv
  FOR SELECT USING (auth.role() = 'authenticated');

ALTER TABLE public.state_waitlist_archiv ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS state_waitlist_archiv_read_auth ON public.state_waitlist_archiv;
CREATE POLICY state_waitlist_archiv_read_auth ON public.state_waitlist_archiv
  FOR SELECT USING (auth.role() = 'authenticated');



-- ═══════════════════════════════════════════════════════════════════════════════
-- VERIFIKATION — Ergebnis-Pruefung nach Apply
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. Neue Tabellen zaehlen (erwartet: mindestens 30 neue Tabellen)
SELECT 'NEUE TABELLEN' AS check_typ, count(*) AS anzahl
FROM pg_tables WHERE schemaname = 'public'
  AND tablename IN (
    'sis_assessments','sis_themenfelder','sis_risikomatrix',
    'vital_signs','vital_sign_thresholds',
    'wounds','wound_assessments','wound_treatments','wound_photos',
    'coach_users','coach_consents','coach_shares','coach_assessments',
    'coach_goals','coach_activities','coach_activity_log',
    'coach_measurements','coach_reports','coach_audit_log',
    'medikamente','medikament_eingaben',
    'angehoerigen_zugaenge','angehoerigen_nachrichten',
    'angehoerigen_audit_log','angehoerigen_benachrichtigungen',
    'signatur_dokumente','signaturen','signatur_audit_log','qes_hooks'
  );
-- Erwartet: 29

-- 2. RLS aktiviert auf allen neuen Tabellen
SELECT 'RLS CHECK' AS check_typ, tablename, rowsecurity
FROM pg_tables WHERE schemaname = 'public'
  AND tablename IN (
    'sis_assessments','sis_themenfelder','sis_risikomatrix',
    'vital_signs','vital_sign_thresholds',
    'wounds','wound_assessments','wound_treatments','wound_photos',
    'coach_users','coach_consents','coach_shares','coach_assessments',
    'coach_goals','coach_activities','coach_activity_log',
    'coach_measurements','coach_reports','coach_audit_log',
    'medikamente','medikament_eingaben',
    'angehoerigen_zugaenge','angehoerigen_nachrichten',
    'angehoerigen_audit_log','angehoerigen_benachrichtigungen',
    'signatur_dokumente','signaturen','signatur_audit_log','qes_hooks',
    'billing_feiertage','billing_leistungsarten','billing_rechtsgrundlagen',
    'billing_tarifquellen','billing_landesregeln_archiv',
    'billing_obergrenzen_archiv','billing_wegepauschalen_archiv',
    'state_settings_audit_archiv','state_waitlist_archiv'
  )
ORDER BY tablename;
-- Erwartet: alle rowsecurity = true

-- 3. SECDEF-RPCs fuer anon gesperrt
SELECT 'SECDEF RPC CHECK' AS check_typ, p.proname,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec,
       has_function_privilege('service_role', p.oid, 'EXECUTE') AS svc_exec
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('wf_emit_event','wf_process_event','wf_execute_queue_item',
                    'wf_process_pending','wf_check_fristen','next_billing_number');
-- Erwartet: anon_exec = false, svc_exec = true fuer alle

-- 4. Keine profiles-Subquery mehr in Policies
SELECT 'PROFILES SUBQUERY CHECK' AS check_typ, count(*) AS gefunden
FROM pg_policies
WHERE schemaname = 'public'
  AND qual LIKE '%profiles%'
  AND qual NOT LIKE '%is_admin%'
  AND policyname NOT LIKE '%select_booking_partner%';
-- Erwartet: 0 (die verbleibenden sind Engel-Policies die profiles nicht in USING subquerien)

-- 5. Kritische Funktionen vorhanden
SELECT 'FUNKTIONEN CHECK' AS check_typ, p.proname, p.prosecdef AS is_secdef
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('is_admin','current_org_id','engel_hat_aktiven_klienten',
                    'eigene_caregiver_ids','coach_audit_trigger','prevent_locked_sis_edit');
-- Erwartet: alle vorhanden

-- 6. idempotency_key auf abrechnungslaeufe
SELECT 'IDEMPOTENCY KEY CHECK' AS check_typ,
       EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'abrechnungslaeufe' AND column_name = 'idempotency_key') AS vorhanden;
-- Erwartet: true

-- 7. org_fence auf mis_audit_log
SELECT 'MIS AUDIT ORG_ID CHECK' AS check_typ,
       EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'mis_audit_log' AND column_name = 'organization_id') AS vorhanden;
-- Erwartet: true

-- ═══════════════════════════════════════════════════════════════════════════════
-- VERIFIKATION — Ergebnis-Pruefung nach Apply
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. Neue Tabellen zaehlen (erwartet: 29)
SELECT 'NEUE_TABELLEN' AS check_typ, count(*) AS anzahl
FROM pg_tables WHERE schemaname = 'public'
  AND tablename IN (
    'sis_assessments','sis_themenfelder','sis_risikomatrix',
    'vital_signs','vital_sign_thresholds',
    'wounds','wound_assessments','wound_treatments','wound_photos',
    'coach_users','coach_consents','coach_shares','coach_assessments',
    'coach_goals','coach_activities','coach_activity_log',
    'coach_measurements','coach_reports','coach_audit_log',
    'medikamente','medikament_eingaben',
    'angehoerigen_zugaenge','angehoerigen_nachrichten',
    'angehoerigen_audit_log','angehoerigen_benachrichtigungen',
    'signatur_dokumente','signaturen','signatur_audit_log','qes_hooks'
  );

-- 2. RLS auf allen neuen Tabellen aktiviert (erwartet: alle true)
SELECT 'RLS_CHECK' AS check_typ, tablename, rowsecurity
FROM pg_tables WHERE schemaname = 'public'
  AND tablename IN (
    'sis_assessments','sis_themenfelder','sis_risikomatrix',
    'vital_signs','vital_sign_thresholds',
    'wounds','wound_assessments','wound_treatments','wound_photos',
    'coach_users','coach_consents','coach_shares','coach_assessments',
    'coach_goals','coach_activities','coach_activity_log',
    'coach_measurements','coach_reports','coach_audit_log',
    'medikamente','medikament_eingaben',
    'angehoerigen_zugaenge','angehoerigen_nachrichten',
    'angehoerigen_audit_log','angehoerigen_benachrichtigungen',
    'signatur_dokumente','signaturen','signatur_audit_log','qes_hooks',
    'billing_feiertage','billing_leistungsarten','billing_rechtsgrundlagen',
    'billing_tarifquellen','billing_landesregeln_archiv',
    'billing_obergrenzen_archiv','billing_wegepauschalen_archiv',
    'state_settings_audit_archiv','state_waitlist_archiv'
  )
ORDER BY tablename;

-- 3. SECDEF-RPCs fuer anon gesperrt (erwartet: anon_exec = false, svc_exec = true)
SELECT 'SECDEF_RPC_CHECK' AS check_typ, p.proname,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec,
       has_function_privilege('service_role', p.oid, 'EXECUTE') AS svc_exec
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('wf_emit_event','wf_process_event','wf_execute_queue_item',
                    'wf_process_pending','wf_check_fristen','next_billing_number');

-- 4. Keine profiles-Subquery mehr in aktiven Policies (erwartet: 0)
SELECT 'PROFILES_SUBQUERY_CHECK' AS check_typ, count(*) AS gefunden
FROM pg_policies
WHERE schemaname = 'public'
  AND qual LIKE '%FROM profiles%'
  AND qual NOT LIKE '%is_admin%'
  AND policyname NOT LIKE '%booking_partner%'
  AND policyname NOT LIKE '%engel_%';

-- 5. Kritische Funktionen vorhanden
SELECT 'FUNKTIONEN_CHECK' AS check_typ, p.proname, p.prosecdef AS is_secdef
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('is_admin','current_org_id','engel_hat_aktiven_klienten',
                    'eigene_caregiver_ids','coach_audit_trigger','prevent_locked_sis_edit');

-- 6. idempotency_key auf abrechnungslaeufe (erwartet: true)
SELECT 'IDEMPOTENCY_KEY' AS check_typ,
       EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'abrechnungslaeufe'
                 AND column_name = 'idempotency_key') AS vorhanden;

-- 7. organization_id auf mis_audit_log (erwartet: true)
SELECT 'MIS_AUDIT_ORG_ID' AS check_typ,
       EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'mis_audit_log'
                 AND column_name = 'organization_id') AS vorhanden;

-- ═══════════════════════════════════════════════════════════════════════════════
-- ENDE — Staging Complete Migration
-- ═══════════════════════════════════════════════════════════════════════════════
