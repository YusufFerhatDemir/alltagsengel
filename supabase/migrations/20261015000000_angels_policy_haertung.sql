-- ═══════════════════════════════════════════════════════════════════════
-- Track 9: Personalverwaltung-Audit — angels-Tabelle Policy-Härtung
--
-- BEFUND B1 (P0): „Angels can update own profile" FOR UPDATE
--   USING (auth.uid() = id) — KEINE Spalteneinschränkung.
--   Ein Engel konnte seinen eigenen hourly_rate, qualification,
--   is_certified und is_45b_capable per PostgREST-PATCH beliebig setzen.
--   Der Stundensatz bestimmt, was der Engel pro Einsatz verdient —
--   eine unkontrollierte Selbständerung ist ein finanzieller Befund.
--
-- BEFUND B3 (P2): „Admins can manage all angels" FOR ALL
--   USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
--          AND role IN ('admin','superadmin')))
--   — profiles-Subquery in einer Policy, bekannter 42P17-Rekursions-
--   Auslöser (Track 4). Redundant mit „Admin engelleri yönetebilir"
--   (is_admin() + nutzer_in_aktiver_org).
--
-- ABHILFE:
--   1. UPDATE-Spalten für authenticated einschränken: nur is_online,
--      bio, services, availability — das sind die Felder, die der
--      Engel über die Oberfläche selbst pflegt (toggleOnlineStatus,
--      Profil-Bearbeitung). hourly_rate, qualification, is_certified,
--      is_45b_capable gehen NUR noch über den Admin-Client (Registration
--      und Stammdaten-Verwaltung).
--   2. INSERT von authenticated entziehen — die Registrierung läuft
--      jetzt über createAdminClient() (siehe register/actions.ts).
--   3. Stale Admin-Policy mit profiles-Subquery entfernen.
--   4. Stale INSERT-Policy entfernen (wirkungslos nach REVOKE INSERT).
--
-- Die UPDATE-Policy „Angels can update own profile" BLEIBT — sie
-- steuert die ZEILEN-Ebene (nur eigene Zeile). Die SPALTEN-Ebene
-- steuert der GRANT.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Stale admin-Policy mit profiles-Subquery entfernen
DROP POLICY IF EXISTS "Admins can manage all angels" ON public.angels;

-- 2. Stale INSERT-Policy entfernen
DROP POLICY IF EXISTS "Angels can create own profile" ON public.angels;

-- 3. UPDATE-Spalten einschränken
--    REVOKE auf Tabellenebene, dann GRANT auf die erlaubten Spalten.
--    Reihenfolge: erst REVOKE (entzieht das implizite table-level),
--    dann GRANT (gibt nur die Spalten zurück).
REVOKE UPDATE ON public.angels FROM authenticated;
GRANT UPDATE (is_online, bio, services, availability) ON public.angels TO authenticated;

-- 4. INSERT für authenticated entziehen
--    Die Registrierung geht jetzt über den Admin-Client.
REVOKE INSERT ON public.angels FROM authenticated;

COMMIT;
