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
