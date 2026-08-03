-- ════════════════════════════════════════════════════════════════════
-- P0/DSGVO: Bookings RLS Policy Consolidation — Soft-Delete-Bypass
-- ════════════════════════════════════════════════════════════════════
--
-- Befund: Auf public.bookings existieren 15 RLS-Policies, darunter
-- 4 permissive SELECT-Policies. Zwei davon (bookings_select,
-- Kullanıcı kendi bookinglerini okuyabilir) prüfen deleted_at NICHT.
-- Da Postgres permissive Policies per OR verknüpft, wird der
-- Soft-Delete-Filter der neueren Policy "Users can view own bookings"
-- (20260419_soft_delete.sql) komplett wirkungslos:
--
--   Ergebnis = Policy_A(kein deleted_at-Check) OR Policy_B(mit Check)
--            = Policy_A  ← Soft-Delete umgangen
--
-- Auswirkung: Ein Nutzer mit soft-gelöschtem Profil kann weiterhin
-- eigene Buchungen lesen. Buchungspartner sehen Buchungen mit
-- soft-gelöschten Gegenparteien. Beides verstößt gegen die
-- DSGVO-Löschsemantik (Art. 17 Recht auf Löschung).
--
-- Lösung: ALLE 15 bestehenden Policies droppen und durch 5 klar
-- benannte, konsolidierte Policies ersetzen. Jede SELECT-Policy
-- erzwingt den Soft-Delete-Check über is_profile_soft_deleted()
-- (SECURITY DEFINER — umgeht RLS auf profiles, bricht 42P17-Zyklus).
--
-- Vorher: 15 Policies (4 SELECT, 3 INSERT, 5 UPDATE, 3 ALL)
-- Nachher:  5 Policies (1 SELECT, 1 INSERT, 1 UPDATE, 1 ALL + 1 RESTRICTIVE)
-- ════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1) ALLE bestehenden Policies idempotent droppen ─────────────────
-- ALL-Policies (3)
DROP POLICY IF EXISTS "Admin bookingleri yönetebilir"                ON public.bookings;
DROP POLICY IF EXISTS "Admins can manage all bookings"               ON public.bookings;
DROP POLICY IF EXISTS "bookings_org_fence"                           ON public.bookings;

-- INSERT-Policies (3)
DROP POLICY IF EXISTS "Customers can insert bookings"                ON public.bookings;
DROP POLICY IF EXISTS "Müşteri booking oluşturabilir"                ON public.bookings;
DROP POLICY IF EXISTS "bookings_insert"                              ON public.bookings;

-- SELECT-Policies (4) — hier steckt die DSGVO-Lücke
DROP POLICY IF EXISTS "Admins can read all bookings"                 ON public.bookings;
DROP POLICY IF EXISTS "Kullanıcı kendi bookinglerini okuyabilir"     ON public.bookings;
DROP POLICY IF EXISTS "Users can view own bookings"                  ON public.bookings;
DROP POLICY IF EXISTS "bookings_select"                              ON public.bookings;

-- UPDATE-Policies (5)
DROP POLICY IF EXISTS "Admins can update all bookings"               ON public.bookings;
DROP POLICY IF EXISTS "Angels can update own bookings"               ON public.bookings;
DROP POLICY IF EXISTS "Customers can update own bookings"            ON public.bookings;
DROP POLICY IF EXISTS "bookings_update"                              ON public.bookings;
DROP POLICY IF EXISTS "İlgili kişi bookingi güncelleyebilir"         ON public.bookings;

-- Sicherheitsnetz: Policies die nur live existieren könnten
DROP POLICY IF EXISTS "Customers can create bookings"                ON public.bookings;
DROP POLICY IF EXISTS "Involved parties can update bookings"         ON public.bookings;
DROP POLICY IF EXISTS "Involved parties can delete pending bookings" ON public.bookings;


-- ── 2) RESTRICTIVE Org-Fence (Multi-Mandant) ───────────────────────
-- Schneidet ALLE permissiven Policies auf die aktive Organisation zu.
-- Identisch zu 20260801_phase3_multi_mandant_saas.sql, hier explizit
-- re-erstellt damit die Migration idempotent ist.
DROP POLICY IF EXISTS "bookings_org_fence"                           ON public.bookings;
CREATE POLICY "bookings_org_fence" ON public.bookings
  AS RESTRICTIVE FOR ALL
  USING  (organization_id = public.current_org_id())
  WITH CHECK (organization_id = public.current_org_id());


-- ── 3) Admin-Zugriff (ALL) ──────────────────────────────────────────
-- is_admin() ist SECURITY DEFINER (umgeht RLS), prüft:
--   profiles.role IN ('admin','superadmin') AND profiles.deleted_at IS NULL
-- → soft-gelöschte Admins verlieren alle Rechte automatisch.
-- → kein 42P17, weil der Profiles-Zugriff innerhalb der Funktion
--   nicht durch RLS geschützt wird (SECURITY DEFINER).
-- Ersetzt: "Admin bookingleri yönetebilir", "Admins can manage all
-- bookings", "Admins can read all bookings", "Admins can update all
-- bookings" (4 Policies → 1).
DROP POLICY IF EXISTS "bookings_admin"                               ON public.bookings;
CREATE POLICY "bookings_admin" ON public.bookings
  FOR ALL
  USING (public.is_admin());


-- ── 4) SELECT für beteiligte Parteien ───────────────────────────────
-- Prüft drei Bedingungen:
--   a) auth.uid() ist Customer ODER Angel der Buchung
--   b) Customer-Profil ist NICHT soft-gelöscht
--   c) Angel-Profil ist NICHT soft-gelöscht
-- Warum beide Seiten prüfen? DSGVO Art. 17: wenn ein Nutzer sein
-- Konto löscht, dürfen seine Daten (inkl. Buchungsreferenzen) nicht
-- mehr für Dritte sichtbar sein. Der Buchungspartner sieht die
-- Buchung erst wieder, wenn der Account innerhalb der 60-Tage-
-- Grace-Period reaktiviert wird.
-- is_profile_soft_deleted() ist SECURITY DEFINER → kein 42P17-Zyklus,
-- da der Sub-SELECT auf profiles ohne RLS-Check läuft.
-- Ersetzt: "bookings_select", "Kullanıcı kendi bookinglerini
-- okuyabilir", "Users can view own bookings", "Admins can read all
-- bookings" (4 Policies → 1 + Admin-ALL).
DROP POLICY IF EXISTS "bookings_select_own"                          ON public.bookings;
CREATE POLICY "bookings_select_own" ON public.bookings
  FOR SELECT
  USING (
    (auth.uid() = customer_id OR auth.uid() = angel_id)
    AND NOT public.is_profile_soft_deleted(customer_id)
    AND NOT public.is_profile_soft_deleted(angel_id)
  );


-- ── 5) INSERT für Kunden ────────────────────────────────────────────
-- Nur der Customer darf eine Buchung erstellen (nicht der Engel).
-- Soft-Delete-Check: ein gelöschter Nutzer darf keine neuen Buchungen
-- anlegen (Session sollte eh weg sein, aber Defense-in-Depth).
-- Ersetzt: "Customers can insert bookings", "Müşteri booking
-- oluşturabilir", "bookings_insert" (3 Policies → 1).
DROP POLICY IF EXISTS "bookings_insert_customer"                     ON public.bookings;
CREATE POLICY "bookings_insert_customer" ON public.bookings
  FOR INSERT
  WITH CHECK (
    auth.uid() = customer_id
    AND NOT public.is_profile_soft_deleted(auth.uid())
  );


-- ── 6) UPDATE für beteiligte Parteien ───────────────────────────────
-- Beide Seiten (Customer + Angel) dürfen Buchungen aktualisieren
-- (z.B. Status-Änderungen, Stornierungen). Soft-Delete-Check nur
-- auf den aufrufenden Nutzer — ein aktiver Customer soll eine
-- Buchung auch dann stornieren können, wenn der Engel gelöscht ist.
-- Ersetzt: "Angels can update own bookings", "Customers can update
-- own bookings", "bookings_update", "İlgili kişi bookingi
-- güncelleyebilir" (4 Policies → 1 + Admin-ALL).
DROP POLICY IF EXISTS "bookings_update_own"                          ON public.bookings;
CREATE POLICY "bookings_update_own" ON public.bookings
  FOR UPDATE
  USING (
    (auth.uid() = customer_id OR auth.uid() = angel_id)
    AND NOT public.is_profile_soft_deleted(auth.uid())
  );

-- Kein DELETE-Policy für reguläre Nutzer: Buchungen werden nicht
-- gelöscht, sondern per Status auf 'cancelled' gesetzt. Admins
-- können über bookings_admin löschen falls nötig.

COMMIT;

-- ════════════════════════════════════════════════════════════════════
-- ROLLBACK-Plan (manuell, nicht automatisch):
--
-- 1. Diese Migration revertieren:
--    DROP POLICY IF EXISTS "bookings_org_fence"        ON public.bookings;
--    DROP POLICY IF EXISTS "bookings_admin"             ON public.bookings;
--    DROP POLICY IF EXISTS "bookings_select_own"        ON public.bookings;
--    DROP POLICY IF EXISTS "bookings_insert_customer"   ON public.bookings;
--    DROP POLICY IF EXISTS "bookings_update_own"        ON public.bookings;
--
-- 2. Alte Policies wiederherstellen (aus vorherigen Migrationen):
--    -- Org-Fence (20260801):
--    CREATE POLICY "bookings_org_fence" ON public.bookings
--      AS RESTRICTIVE FOR ALL
--      USING (organization_id = public.current_org_id())
--      WITH CHECK (organization_id = public.current_org_id());
--
--    -- Admin (20260803000000):
--    CREATE POLICY "Admins can manage all bookings" ON public.bookings
--      FOR ALL USING (public.is_admin());
--
--    -- SELECT mit Soft-Delete (20260419):
--    CREATE POLICY "Users can view own bookings" ON public.bookings
--      FOR SELECT
--      USING (((auth.uid() = customer_id) OR (auth.uid() = angel_id))
--             AND (NOT is_profile_soft_deleted(auth.uid())));
--
--    -- Admin-Read (20260414):
--    CREATE POLICY "Admins can read all bookings" ON public.bookings
--      FOR SELECT USING (is_admin());
--
--    -- INSERT (20260319):
--    CREATE POLICY "Customers can insert bookings" ON public.bookings
--      FOR INSERT WITH CHECK (auth.uid() = customer_id);
--
--    -- UPDATE (20260414):
--    CREATE POLICY "Admins can update all bookings" ON public.bookings
--      FOR UPDATE USING (is_admin());
--    CREATE POLICY "Angels can update own bookings" ON public.bookings
--      FOR UPDATE USING (auth.uid() = angel_id);
--    CREATE POLICY "Customers can update own bookings" ON public.bookings
--      FOR UPDATE USING (auth.uid() = customer_id);
--
-- 3. ACHTUNG: Die alten Dashboard-Policies (bookings_select,
--    bookings_insert, bookings_update, türkischsprachige) NICHT
--    wiederherstellen — die waren die Ursache der DSGVO-Lücke.
--    Falls sie trotzdem benötigt werden, deleted_at-Check hinzufügen.
--
-- 4. Empfehlung: NICHT blind rollbacken. Zuerst den Grund für den
--    Rollback klären. Die alte Policy-Landschaft hat eine bestätigte
--    DSGVO-Lücke — ein Rollback stellt diese wieder her.
-- ════════════════════════════════════════════════════════════════════
