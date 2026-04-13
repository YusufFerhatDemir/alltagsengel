-- RLS-Hardening fuer profiles
-- Vorher: "Herkes profilleri okuyabilir" + "profiles_select" (beide: USING(true))
--   -> Jeder konnte alle Profile lesen inkl. E-Mail, Telefon, Standort.
-- Nachher:
--   1) Eigener Nutzer liest eigenes Profil (auth.uid() = id)
--   2) Admin/Superadmin liest alles
--   3) Authentifizierte Nutzer koennen Profile von Engeln lesen
--      (noetig fuer Buchungsflow: Namen/Avatar des Engels anzeigen)
--   4) Authentifizierte Nutzer koennen Profile von Kunden lesen,
--      die an eigenen Buchungen beteiligt sind (Engel sieht Kunden-Namen)

-- Alte permissive Policies entfernen
DROP POLICY IF EXISTS "Herkes profilleri okuyabilir" ON profiles;
DROP POLICY IF EXISTS "profiles_select" ON profiles;

-- 1) Eigenes Profil lesen
CREATE POLICY "profiles_select_own" ON profiles
  FOR SELECT
  USING (auth.uid() = id);

-- 2) Admin/Superadmin darf alle Profile lesen
CREATE POLICY "profiles_select_admin" ON profiles
  FOR SELECT
  USING (
    ((auth.jwt() -> 'user_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'superadmin'::text])
  );

-- 3) Angemeldete Nutzer koennen Profile von Engeln lesen (Marktplatz-Discovery)
CREATE POLICY "profiles_select_engels" ON profiles
  FOR SELECT
  USING (
    auth.role() = 'authenticated' AND role = 'engel'
  );

-- 4) Booking-Partner sichtbar (Engel sieht Kunde / Kunde sieht Engel an eigenen Buchungen)
CREATE POLICY "profiles_select_booking_partner" ON profiles
  FOR SELECT
  USING (
    auth.role() = 'authenticated' AND (
      EXISTS (
        SELECT 1 FROM bookings b
        WHERE (b.customer_id = profiles.id AND b.angel_id = auth.uid())
           OR (b.angel_id = profiles.id AND b.customer_id = auth.uid())
      )
      OR EXISTS (
        SELECT 1 FROM krankenfahrten k
        WHERE k.customer_id = profiles.id
          AND k.provider_id IN (
            SELECT id FROM krankenfahrt_providers WHERE user_id = auth.uid()
          )
      )
    )
  );

-- Doppelte Admin-Policy fuer profiles_select auch beibehalten (war vorher ueber user_metadata)
-- Die zweite Admin-Policy ist oben schon abgedeckt.
