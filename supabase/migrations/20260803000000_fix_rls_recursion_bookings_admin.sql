-- ════════════════════════════════════════════════════════════════════
-- Fix: 42P17-Rekursion profiles ↔ bookings (Shadow-DB-Befund 2026-08-03)
-- ════════════════════════════════════════════════════════════════════
--
-- Befund: "Admins can manage all bookings" (20260319) prüft die
-- Admin-Rolle per direktem Sub-SELECT auf profiles. Seit dem
-- Profiles-Hardening (20260414) referenziert profiles seinerseits
-- bookings (profiles_select_booking_partner). Ergebnis ist ein
-- Policy-Zyklus profiles → bookings → profiles, den Postgres mit
-- ERROR 42P17 "infinite recursion detected in policy for relation
-- profiles" quittiert — JEDER authenticated/anon SELECT auf profiles
-- (und transitiv auf bookings/messages/…) schlägt fehl.
--
-- Auf der aus dem Repo gebauten Shadow-DB real nachgewiesen; LIVE ist
-- davon nur deshalb nichts zu sehen, weil die Live-Policy-Landschaft
-- gedriftet ist (Admin-Checks laufen dort über is_admin()). Damit der
-- Repo-Replay (Disaster-Recovery-Garantie) eine funktionierende DB
-- erzeugt, ersetzen wir den Sub-SELECT durch is_admin() — SECURITY
-- DEFINER (seit 20260414), umgeht RLS im Funktions-Body und bricht
-- den Zyklus. Seit 20260419 verliert ein soft-deleted Admin darüber
-- zusätzlich seine Admin-Rechte (deleted_at-Check in is_admin()).

BEGIN;

DROP POLICY IF EXISTS "Admins can manage all bookings" ON public.bookings;
CREATE POLICY "Admins can manage all bookings" ON public.bookings
  FOR ALL USING (public.is_admin());

-- ── Zweiter Befund (DSGVO-Lücke im Soft-Delete): ─────────────────────
-- profiles_select_engels und profiles_select_booking_partner (20260414)
-- prüfen deleted_at nicht. Permissive Policies sind OR-verknüpft —
-- ein soft-deleted Engel bliebe damit trotz "Anyone can view public
-- profiles USING (deleted_at IS NULL)" für JEDEN angemeldeten Nutzer
-- sichtbar (Marktplatz-Discovery), ein soft-deleted Buchungspartner
-- für seine Gegenseite. Beide Policies bekommen den deleted_at-Filter
-- der Zielzeile (kein Zyklus: Filter liegt auf profiles selbst).
DROP POLICY IF EXISTS "profiles_select_engels" ON public.profiles;
CREATE POLICY "profiles_select_engels" ON public.profiles
  FOR SELECT
  USING (
    auth.role() = 'authenticated' AND role = 'engel' AND deleted_at IS NULL
  );

DROP POLICY IF EXISTS "profiles_select_booking_partner" ON public.profiles;
CREATE POLICY "profiles_select_booking_partner" ON public.profiles
  FOR SELECT
  USING (
    auth.role() = 'authenticated' AND deleted_at IS NULL AND (
      EXISTS (
        SELECT 1 FROM public.bookings b
        WHERE (b.customer_id = profiles.id AND b.angel_id = auth.uid())
           OR (b.angel_id = profiles.id AND b.customer_id = auth.uid())
      )
      OR EXISTS (
        SELECT 1 FROM public.krankenfahrten k
        WHERE k.customer_id = profiles.id
          AND k.provider_id IN (
            SELECT id FROM public.krankenfahrt_providers
            WHERE user_id = auth.uid()
          )
      )
    )
  );

COMMIT;

-- ════════════════════════════════════════════════════════════════════
-- ROLLBACK-Plan:
--   "Admins can manage all bookings" NICHT auf die Selbstreferenz-
--   Variante zurückdrehen — die stellt die 42P17-Rekursion wieder her.
--   Falls die Policy weg muss:
--     DROP POLICY IF EXISTS "Admins can manage all bookings" ON public.bookings;
--   Die beiden profiles_select_*-Policies lassen sich durch erneutes
--   Ausführen von 20260414_rls_profiles_hardening.sql (nur Abschnitte
--   3+4) auf den Stand ohne deleted_at-Filter zurücksetzen — nötig
--   nur, wenn auch 20260419 zurückgerollt wird (Spalte weg), sonst
--   bleiben sie funktionsfähig.
-- ════════════════════════════════════════════════════════════════════
