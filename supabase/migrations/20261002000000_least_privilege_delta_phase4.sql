-- ════════════════════════════════════════════════════════════════════════════
-- Least-Privilege-Härtung — Security-/DSGVO-Delta Review Phase 4
-- ════════════════════════════════════════════════════════════════════════════
--
-- Drei live gemessene Befunde (nicht vermutet — siehe
-- scripts/verify-security-delta-phase4*.mjs):
--
-- ── BEFUND 1 (P1): anon hält volle DML-Rechte auf fast allen Tabellen ───────
--
--   Gemessen über pg_class.relacl:
--     audit_logs : anon=arwdDxtm/postgres
--     profiles   : anon=arwdDxtm/postgres
--     clients    : anon=arwdDxtm/postgres
--     invoices   : anon=arwdDxtm/postgres
--   Das ist die Supabase-Standardvergabe (GRANT ALL an anon/authenticated,
--   RLS als alleinige Grenze). Sie gilt live auf 225 der 308 public-Tabellen.
--
--   Die Grenze hält heute — aber teilweise aus dem falschen Grund. Der echte
--   anon-Aufruf auf profiles/clients/invoices/audit_logs scheitert nicht an
--   einer Policy-Entscheidung, sondern an
--       42501 "permission denied for function darf"
--       42501 "permission denied for function eigene_client_ids"
--       42501 "permission denied for function is_profile_soft_deleted"
--   Also an einer FEHLER-Sperre. Wer künftig einer dieser Hilfsfunktionen
--   EXECUTE an anon gibt (ein GRANT ... TO PUBLIC genügt), verschiebt die
--   Sperre still von "Abbruch" auf "Policy entscheidet" — und dann hängt der
--   Schutz jeder einzelnen dieser 225 Tabellen an genau einer Policy-Zeile.
--   Bei anon=d auf audit_logs wäre das ein löschbarer Prüfpfad.
--
--   Dass das bekannt ist, zeigt die Tabelle angels: dort steht bereits
--   anon=Dxtm — die Schreibrechte wurden entzogen. Der Sweep wurde nur nicht
--   zu Ende geführt. Diese Migration führt ihn zu Ende.
--
--   BEWUSST NUR SCHREIBRECHTE: SELECT bleibt unangetastet. Lesen ist live
--   nachweislich durch RLS gedeckt (20 sensible Tabellen empirisch geprüft:
--   401 bzw. 200 [] — kein einziger Datensatz für anon sichtbar), und ein
--   pauschaler SELECT-Entzug würde die öffentlichen Referenzdaten
--   (bundeslaender, plz_bundesland_regeln) und damit die Website brechen.
--   Schreibrechte dagegen braucht anon nirgends: alle öffentlichen
--   Schreibwege laufen serverseitig über den Service-Role-Client
--   (app/api/**), die einzigen clientseitigen Schreibzugriffe liegen in
--   /admin und laufen als authenticated.
--
-- ── BEFUND 2 (P2): SECURITY-DEFINER-Funktionen für anon ausführbar ─────────
--
--   Zehn Stück, davon drei per PostgREST-RPC echt aufrufbar:
--     current_org_id()              -> gibt unangemeldet die Stamm-Org-UUID aus
--     nutzer_hat_org_bindung(uuid)  -> Existenz-Orakel für Nutzer-UUIDs
--     nutzer_in_aktiver_org(uuid)   -> dito
--   Die übrigen sieben sind Trigger-Funktionen (RETURNS trigger) und damit
--   nicht per RPC erreichbar — Defense-in-Depth, keine offene Tür.
--
--   Zwei davon — trg_vpkzp_audit() und trg_vpkzp_fortschreibung() — stammen
--   aus den VP/KZP-Migrationen von Phase 3. Sie sind also eine Regression
--   gegenüber der mit 20260823010000 und 20260913000000 gesetzten Regel:
--   SECURITY DEFINER bekommt nie EXECUTE für anon.
--
-- ── BEFUND 3 (P2): billing_landesregeln ist mandantenblind ─────────────────
--
--   Policy landesregeln_admin_write: FOR ALL TO authenticated USING is_admin()
--   Kein organization_id-Bezug, PERMISSIVE, und die Tabelle hat keinen
--   org_fence. Ein Admin eines beliebigen Mandanten kann damit die
--   Landesregeln ALLER Mandanten lesen, ändern und löschen. Landesregeln
--   steuern die Abrechnung — das ist eine fremde Kasse.
--
--   Die zweite Policy auf der Tabelle macht es richtig
--   (organization_id IS NULL OR organization_id = current_org_id()) und
--   bleibt unverändert: bundesweite Regeln (organization_id IS NULL) sollen
--   für alle lesbar sein.
--
-- Idempotent. Rollback: 20261002000001_rollback_least_privilege_delta_phase4.sql
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1) Schreibrechte für anon entziehen ────────────────────────────────────
-- Tabellenweise statt "ON ALL TABLES", damit die Migration protokolliert,
-- was sie anfasst, und damit ein einzelner Fehlschlag sichtbar wird statt
-- im Sammelbefehl unterzugehen.
DO $$
DECLARE
  r record;
  anzahl int := 0;
BEGIN
  FOR r IN
    SELECT c.oid, c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND (has_table_privilege('anon', c.oid, 'INSERT')
        OR has_table_privilege('anon', c.oid, 'UPDATE')
        OR has_table_privilege('anon', c.oid, 'DELETE')
        OR has_table_privilege('anon', c.oid, 'TRUNCATE'))
    ORDER BY c.relname
  LOOP
    EXECUTE format(
      'REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.%I FROM anon',
      r.relname);
    anzahl := anzahl + 1;
  END LOOP;
  RAISE NOTICE 'Schreibrechte fuer anon entzogen auf % Tabellen', anzahl;
END $$;

-- Neue Tabellen sollen die Schreibrechte gar nicht erst erben. Ohne diesen
-- Block wäre die Migration nur eine Momentaufnahme und die nächste
-- CREATE TABLE bringt den Befund zurück.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLES FROM anon;

-- ── 2) EXECUTE für anon auf SECURITY-DEFINER-Funktionen entziehen ──────────
-- Über pg_proc statt fester Signaturen: hält auch, wenn eine Funktion später
-- eine andere Signatur bekommt, und erfasst neue SECDEF-Funktionen mit.
-- authenticated behält EXECUTE — die Policies rufen diese Funktionen auf.
DO $$
DECLARE
  r record;
  anzahl int := 0;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
    ORDER BY 1
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', r.sig);
    -- PUBLIC mit entziehen: sonst erbt anon das Recht sofort wieder.
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', r.sig);
    RAISE NOTICE 'EXECUTE fuer anon entzogen: %', r.sig;
    anzahl := anzahl + 1;
  END LOOP;
  RAISE NOTICE 'SECDEF-Funktionen geschlossen: %', anzahl;
END $$;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon;

-- ── 3) billing_landesregeln an den Mandanten binden ────────────────────────
-- Die alte Policy wird ersetzt, nicht ergänzt: eine zusätzliche Policy würde
-- als PERMISSIVE danebenstehen und der mandantenblinde Vollzugriff bliebe.
DROP POLICY IF EXISTS landesregeln_admin_write ON public.billing_landesregeln;

CREATE POLICY landesregeln_admin_write ON public.billing_landesregeln
  FOR ALL TO authenticated
  USING (is_admin() AND organization_id = current_org_id())
  WITH CHECK (is_admin() AND organization_id = current_org_id());

-- Zusätzlich der Zaun, den die Tabelle bisher nicht hatte. RESTRICTIVE, weil
-- er UND-verknüpft gelten muss — eine permissive Policy könnte ihn sonst
-- überstimmen. Bundesweite Regeln (organization_id IS NULL) bleiben für alle
-- lesbar; genau dafür ist der NULL-Zweig da.
DROP POLICY IF EXISTS org_fence_billing_landesregeln ON public.billing_landesregeln;

CREATE POLICY org_fence_billing_landesregeln ON public.billing_landesregeln
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (organization_id IS NULL OR organization_id = current_org_id())
  WITH CHECK (organization_id = current_org_id());

COMMENT ON POLICY org_fence_billing_landesregeln ON public.billing_landesregeln IS
  'Delta Phase 4: Mandantenzaun. Lesen erlaubt zusätzlich bundesweite Regeln '
  '(organization_id IS NULL); Schreiben nur in die eigene Organisation.';

COMMIT;

-- ── VERIFIKATION nach dem Apply ────────────────────────────────────────────
--   node scripts/verify-security-delta-phase4.mjs
--   node scripts/verify-security-delta-phase4-detail.mjs
-- Erwartet danach:
--   · secdef_anon        : 0 Funktionen für anon ausführbar
--   · anon-Schreibrechte : 0 Tabellen
--   · billing_landesregeln taucht nicht mehr in der org_fence-Lücke auf
