-- ════════════════════════════════════════════════════════════════════════════
-- Migration: profiles-RLS — 42P17-Rekursion beseitigen UND das dadurch
--            verdeckte anon-Leseleck schliessen
-- Datum:     2026-08-15
-- Branch:    staging/expansion-abnahme
--
-- BEFUND (live gemessen auf Production, nnwyktkqibdjxgimjyuq)
--
--   1) JEDER Nicht-service_role-Zugriff auf public.profiles scheitert:
--          {"code":"42P17","message":"infinite recursion detected in
--           policy for relation \"profiles\""}
--      Ursache ist die Alt-Policy "Admin profilleri yönetebilir" (FOR ALL):
--          USING (EXISTS (SELECT 1 FROM profiles profiles_1
--                          WHERE profiles_1.id = auth.uid()
--                            AND profiles_1.role = 'admin'))
--      Eine profiles-Subquery IN einer profiles-Policy ruft die Policies
--      erneut auf -> Rekursion. Weil die Policy FOR ALL gilt, trifft es
--      auch jedes SELECT, unabhaengig vom JWT.
--      Der korrekte Ersatz ist bereits vorhanden und aktiv:
--          "Admins can manage all profiles"  USING (is_admin())
--      is_admin() ist SECURITY DEFINER und umgeht die Policies -> keine
--      Rekursion. Die Alt-Policy ist damit reine Altlast.
--
--   2) Genau diese Rekursion verdeckt derzeit ein Leseleck. Sobald (1)
--      behoben ist, greifen zwei permissive SELECT-Policies fuer die
--      Rolle `public` (schliesst anon EIN):
--          "Herkes profilleri okuyabilir"   USING (true)
--          "Anyone can view public profiles" USING (deleted_at IS NULL)
--      Wirkung waere: ein unangemeldeter Aufrufer liest mit dem oeffentlichen
--      Anon-Key ALLE Profilzeilen inkl. email, phone, postal_code, location
--      (aktuell 59 Zeilen). DSGVO Art. 5/32.
--
--   >>> (1) und (2) MUESSEN GEMEINSAM ausgerollt werden. Wer nur die
--   >>> Rekursion behebt, oeffnet das Leck. Wer nur die offenen Policies
--   >>> dropt, laesst die Totalblockade stehen. Diese Migration macht beides
--   >>> in EINER Transaktion.
--
-- ABDECKUNG NACH DEM DROP — es bleibt kein legitimer Lesepfad auf der
-- Strecke. Fuer authentifizierte Nutzer greifen weiterhin:
--     profiles_select_own            auth.uid() = id
--     profiles_select_admin          is_admin()
--     profiles_select_engels         authenticated AND role='engel' AND nicht geloescht
--     profiles_select_booking_partner  Buchungs-/Krankenfahrt-Gegenpart
-- Anonyme Leser verlieren den Zugriff auf profiles vollstaendig — im Code
-- existiert kein anon-Lesepfad auf profiles (geprueft ueber app/**).
-- Login/Registrierung sind nicht betroffen: der Profil-Upsert laeuft ueber
-- profiles_insert (auth.uid() = id), der Profil-Read nach signIn ueber
-- profiles_select_own — beide erst NACH Session-Aufbau.
--
-- KEINE Datenaenderung (nur Policies). Idempotent (DROP POLICY IF EXISTS).
-- Rollback: 20260815010001_rollback_profiles_rls_rekursion_und_anon_leck.sql
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1) Rekursive Alt-Policy entfernen ───────────────────────────────────────
-- Ersetzt durch "Admins can manage all profiles" USING (is_admin()).
DROP POLICY IF EXISTS "Admin profilleri yönetebilir" ON public.profiles;

-- ── 2) Offene Lesepolicies fuer Rolle `public` entfernen ────────────────────
DROP POLICY IF EXISTS "Herkes profilleri okuyabilir" ON public.profiles;
DROP POLICY IF EXISTS "Anyone can view public profiles" ON public.profiles;

-- ── 3) Absicherung: der nicht-rekursive Admin-Pfad muss existieren ──────────
-- Sonst stuende nach dem Drop kein Admin-Vollzugriff mehr zur Verfuegung.
-- is_admin() ist SECURITY DEFINER -> ruft die profiles-Policies NICHT erneut auf.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'profiles'
      AND policyname = 'Admins can manage all profiles'
  ) THEN
    CREATE POLICY "Admins can manage all profiles"
      ON public.profiles FOR ALL
      USING (public.is_admin());
  END IF;
END $$;

-- ── 4) Absicherung: Selbstlesepfad muss existieren ──────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'profiles'
      AND policyname = 'profiles_select_own'
  ) THEN
    CREATE POLICY profiles_select_own
      ON public.profiles FOR SELECT
      USING (auth.uid() = id);
  END IF;
END $$;

COMMIT;

-- ── VERIFIKATION nach dem Apply ─────────────────────────────────────────────
-- a) Rekursion weg (muss Zeilen liefern, nicht 42P17):
--      curl "$URL/rest/v1/profiles?select=id&limit=1" \
--        -H "apikey: $SERVICE_ROLE" -H "Authorization: Bearer $SERVICE_ROLE"
-- b) Anon-Leck zu (muss [] liefern, NICHT 59 Zeilen):
--      curl "$URL/rest/v1/profiles?select=id,email&limit=5" \
--        -H "apikey: $ANON" -H "Authorization: Bearer $ANON"
-- c) Eingeloggter Nutzer sieht weiterhin sein eigenes Profil.
