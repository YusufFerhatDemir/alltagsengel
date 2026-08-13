-- ════════════════════════════════════════════════════════════════════
-- BEWERTUNGEN: RLS-Fence fuer angel_reviews + reviews
-- ════════════════════════════════════════════════════════════════════
-- Befund (live verifiziert am 13.08.2026 per PostgREST):
--
--   curl "$URL/rest/v1/reviews?select=comment,reviewer_id" -H "apikey: $ANON"
--     → 200 mit Klartext-Kommentar + reviewer_id
--
-- Die SELECT-Policy beider Bewertungstabellen ist USING (true). Damit
-- ist JEDE Bewertung mit dem oeffentlichen Anon-Key lesbar, der im
-- Browser-Bundle ausgeliefert wird — inklusive Freitext-Kommentar und
-- der Profil-UUID des Verfassers, ueber alle Mandanten hinweg.
-- Der Auth-Check in GET /api/reviews war damit wirkungslos: dieselben
-- Daten waren an der API vorbei direkt ueber PostgREST abrufbar.
--
-- Diese Migration:
--   1. legt zwei SECURITY-DEFINER-Helper an (kein Subquery auf
--      profiles/bookings in der Policy selbst → keine 42P17-Rekursion),
--   2. raeumt ALLE bestehenden Policies beider Tabellen ab — nur so ist
--      garantiert, dass keine vergessene USING(true)-Policy ueberlebt —
--      und legt einen vollstaendigen, gefencten Satz neu an.
--
-- Sichtbarkeitsmodell nach dieser Migration:
--   Kunde  → eigene Bewertungen
--   Engel  → Bewertungen ueber sich selbst
--   Admin  → nur Bewertungen, deren Buchung in seiner aktiven Org liegt
--   anon   → nichts
--
-- Die oeffentliche Anzeige auf der Engel-Profilseite laeuft ueber
-- lib/reviews.ts (Service-Role + expliziter Org-Fence + Feld-Whitelist).
-- ════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1) Helper ───────────────────────────────────────────────────────

-- Darf der aktuelle User diese Buchung mit genau diesem Engel bewerten?
-- Deckt beide Bedingungen ab, die die API prueft, damit ein direkter
-- PostgREST-Insert dieselben Schranken sieht.
CREATE OR REPLACE FUNCTION public.darf_buchung_bewerten(p_booking_id uuid, p_angel_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.id = p_booking_id
      AND b.customer_id = auth.uid()
      AND b.angel_id = p_angel_id
  );
$$;

-- Liegt die Buchung in der aktiven Organisation des Requests?
-- Fail-closed: NULL-Buchung (Legacy-Zeilen in `reviews`) → false.
CREATE OR REPLACE FUNCTION public.buchung_in_aktiver_org(p_booking_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.id = p_booking_id
      AND b.organization_id = public.current_org_id()
  );
$$;

REVOKE ALL ON FUNCTION public.darf_buchung_bewerten(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.darf_buchung_bewerten(uuid, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.buchung_in_aktiver_org(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.buchung_in_aktiver_org(uuid) TO authenticated, service_role;

-- ── 2) Alle Alt-Policies abraeumen ──────────────────────────────────
-- Bewusst dynamisch statt per Namensliste: die Tabellen haben ueber
-- mehrere Migrationen hinweg tuerkische, deutsche und englische
-- Policy-Namen angesammelt (u. a. "Jeder kann Bewertungen lesen",
-- "Anyone can view reviews", "Herkes reviewleri okuyabilir"). Eine
-- vergessene davon wuerde den kompletten Fence aushebeln.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('angel_reviews', 'reviews')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

ALTER TABLE public.angel_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews       ENABLE ROW LEVEL SECURITY;

-- ── 3) angel_reviews ────────────────────────────────────────────────

-- Lesen: Verfasser, bewerteter Engel, Admin (org-gefenced).
-- angels.id ist identisch mit der profiles/auth-UUID, deshalb greift
-- der direkte Vergleich angel_id = auth.uid().
CREATE POLICY "angel_reviews_select_beteiligte" ON public.angel_reviews
  FOR SELECT TO authenticated
  USING (
    customer_id = auth.uid()
    OR angel_id = auth.uid()
    OR (public.is_admin() AND public.buchung_in_aktiver_org(booking_id))
  );

-- Schreiben: nur der Kunde der Buchung, und nur fuer den Engel, der
-- tatsaechlich zu dieser Buchung gehoert.
CREATE POLICY "angel_reviews_insert_eigene" ON public.angel_reviews
  FOR INSERT TO authenticated
  WITH CHECK (
    customer_id = auth.uid()
    AND public.darf_buchung_bewerten(booking_id, angel_id)
  );

-- Aendern: nur die eigene Bewertung, und der Buchungs-/Engelbezug darf
-- dabei nicht auf eine fremde Buchung umgebogen werden.
CREATE POLICY "angel_reviews_update_eigene" ON public.angel_reviews
  FOR UPDATE TO authenticated
  USING (customer_id = auth.uid())
  WITH CHECK (
    customer_id = auth.uid()
    AND public.darf_buchung_bewerten(booking_id, angel_id)
  );

-- Loeschen: eigene Bewertung (DSGVO Art. 17) oder Admin in eigener Org.
CREATE POLICY "angel_reviews_delete_eigene" ON public.angel_reviews
  FOR DELETE TO authenticated
  USING (
    customer_id = auth.uid()
    OR (public.is_admin() AND public.buchung_in_aktiver_org(booking_id))
  );

-- ── 4) reviews (Legacy) ─────────────────────────────────────────────
-- Wird von der App nicht mehr beschrieben — angel_reviews hat sie
-- abgeloest. Bis zur Konsolidierung bekommt sie denselben Fence.
-- booking_id ist hier nullable; Zeilen ohne Buchung sind fuer Admins
-- damit nicht sichtbar (fail-closed).
CREATE POLICY "reviews_select_beteiligte" ON public.reviews
  FOR SELECT TO authenticated
  USING (
    reviewer_id = auth.uid()
    OR angel_id = auth.uid()
    OR (public.is_admin() AND public.buchung_in_aktiver_org(booking_id))
  );

CREATE POLICY "reviews_insert_eigene" ON public.reviews
  FOR INSERT TO authenticated
  WITH CHECK (reviewer_id = auth.uid());

CREATE POLICY "reviews_update_eigene" ON public.reviews
  FOR UPDATE TO authenticated
  USING (reviewer_id = auth.uid())
  WITH CHECK (reviewer_id = auth.uid());

CREATE POLICY "reviews_delete_eigene" ON public.reviews
  FOR DELETE TO authenticated
  USING (
    reviewer_id = auth.uid()
    OR (public.is_admin() AND public.buchung_in_aktiver_org(booking_id))
  );

COMMIT;

-- ════════════════════════════════════════════════════════════════════
-- VERIFIKATION nach dem Apply (manuell ausfuehren):
--
--   a) anon sieht nichts mehr (muss [] liefern, nicht die Demo-Zeile):
--      curl "$URL/rest/v1/reviews?select=id,comment" \
--        -H "apikey: $ANON" -H "Authorization: Bearer $ANON"
--      curl "$URL/rest/v1/angel_reviews?select=id,comment" \
--        -H "apikey: $ANON" -H "Authorization: Bearer $ANON"
--
--   b) keine offene Policy mehr uebrig (muss 0 liefern):
--      SELECT count(*) FROM pg_policies
--       WHERE schemaname='public' AND tablename IN ('angel_reviews','reviews')
--         AND (qual = 'true' OR with_check = 'true');
--
--   c) Kunde sieht weiterhin die eigene Bewertung (/kunde/buchungen zeigt
--      den Haken "bereits bewertet"), Engel-Profil zeigt Bewertungen.
-- ════════════════════════════════════════════════════════════════════
