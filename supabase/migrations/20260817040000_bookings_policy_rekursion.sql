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

BEGIN;

-- ── Vorbedingung: der nicht-rekursive Ersatz MUSS stehen ────────────────────
-- Ohne ihn wuerde der Drop den Admin-Vollzugriff auf bookings kappen.
DO $$
BEGIN
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

COMMIT;

-- ── VERIFIKATION nach dem Apply ─────────────────────────────────────────────
-- a) Rekursion weg — muss Zeilen liefern statt 42P17:
--      curl "$URL/rest/v1/profiles?select=id&limit=1" -H "apikey: $ANON" ...
--      erwartet: []  (leer, weil anon keine SELECT-Policy mehr hat)
--      NICHT erwartet: 42P17
-- b) Eingeloggter Nutzer sieht sein eigenes Profil (profiles_select_own).
-- c) Admin sieht weiterhin alle Buchungen (bookings_admin).
-- d) node scripts/verify-security-p0.mjs
