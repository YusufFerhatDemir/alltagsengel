-- ════════════════════════════════════════════════════════════════════════════
-- Block 41 — Die Pflegekraft konnte ihren eigenen Datensatz nicht lesen
-- ════════════════════════════════════════════════════════════════════════════
--
-- BEFUND (14.09.2026)
--
-- Drei Seiten des Engel-Portals beginnen mit demselben Schritt:
--
--     supabase.from('caregivers').select('id').eq('user_id', user.id).single()
--
-- Sie holen die eigene `caregiver_id`; alles Weitere haengt daran —
-- Medikamente, Pflegedoku-Verlauf und Einsaetze.
--
-- `caregivers` trug fuenf Policies, und KEINE band eine Pflegekraft an
-- ihren eigenen Datensatz:
--
--     caregivers_admin_all        is_admin()
--     caregivers_org_fence        RESTRICTIVE, organization_id
--     caregivers_service_all      service_role
--     rk_caregivers_lesen         darf('personal.lesen')
--     rk_caregivers_schreiben     darf('personal.schreiben')
--
-- Die Rolle `engel` traegt laut lib/auth/rollen.ts KEINE Berechtigung —
-- `darf('personal.lesen')` ist fuer sie falsch. Das `.single()` fand also
-- nie eine Zeile, und die drei Seiten meldeten „Ihre Zuordnung konnte
-- nicht geladen werden".
--
-- Die Fehlerbehandlung war korrekt; die Funktion war es nicht.
--
-- ── WARUM DAS LANGE NICHT AUFFIEL ───────────────────────────────────────────
--
-- Live traegt genau EINE Pflegekraft einen Login (Stand 14.09.2026); die
-- andere hat `user_id IS NULL`. Und `einsatzfreigabe` steht bei beiden auf
-- false, es findet also ohnehin kein Einsatz statt.
--
-- ── DIE REGEL ───────────────────────────────────────────────────────────────
--
-- Minimal und genau: die eigene Zeile, sonst nichts. Kein Blick auf
-- Kolleginnen, keine Liste. Der RESTRICTIVE org_fence wirkt unveraendert
-- zusaetzlich.
--
-- Bewusst NICHT ueber `eigene_caregiver_ids()`: diese SECURITY-DEFINER-
-- Funktion existiert, um andere Tabellen zu binden, ohne `caregivers` zu
-- joinen (die bekannte Join-Falle). Sie hier zu verwenden waere ein
-- Zirkelschluss — die Funktion liest selbst `caregivers`.
-- ════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "engel_caregivers_select_own" ON public.caregivers;

CREATE POLICY "engel_caregivers_select_own" ON public.caregivers
  FOR SELECT
  USING (user_id = auth.uid());

COMMENT ON POLICY "engel_caregivers_select_own" ON public.caregivers IS
  'Block 41: Die Pflegekraft liest ihren EIGENEN Datensatz. Ohne diese Policy fand das .single() in /engel/medikamente, /engel/pflegedoku/verlauf und /engel/einsaetze nie eine Zeile — die Seiten waren unbenutzbar.';
