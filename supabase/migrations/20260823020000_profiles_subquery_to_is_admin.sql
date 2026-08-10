-- ════════════════════════════════════════════════════════════════════════════
-- Migration: profiles-Subquery in RLS-Policies → is_admin()
-- Datum:     2026-08-10
-- Branch:    staging/expansion-abnahme
--
-- BEFUND (audit/STAGING_STATUS_2026-08-10.md §3.3):
--   44 aktive RLS-Policies nutzen
--     EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
--   statt public.is_admin().
--
--   Risiko: 42P17 Infinite-Recursion wenn profiles-RLS aktiv ist und die
--   Policy-Auswertung transitiv ueber profiles zuruecklaeuft.
--   is_admin() ist SECURITY DEFINER und umgeht RLS — kein Zyklus.
--
-- BETROFFENE MODULE:
--   1. Workflow-Engine   (7 wf_*-Tabellen)        — 20260813010000
--   2. Pflegedokumentation (8 pflege_*-Tabellen)   — 20260810010000
--   3. Aufgaben/Kommunikation (13 ops_*-Tabellen)  — 20260812010000
--   4. Personalmanagement (7 personal_*-Tabellen)  — 20260811010000
--   5. Legacy-Tabellen   (9 Tabellen)              — 20260319000000
--
-- STRATEGIE: DROP POLICY IF EXISTS + CREATE POLICY mit is_admin().
-- Idempotent. Rollback: 20260823020001_rollback_profiles_subquery_to_is_admin.sql
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. WORKFLOW-ENGINE — 7 Policies
-- ════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS wf_events_admin_all ON public.wf_events;
CREATE POLICY wf_events_admin_all ON public.wf_events
  FOR ALL TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS wf_regeln_admin_all ON public.wf_regeln;
CREATE POLICY wf_regeln_admin_all ON public.wf_regeln
  FOR ALL TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS wf_aktionen_admin_all ON public.wf_aktionen;
CREATE POLICY wf_aktionen_admin_all ON public.wf_aktionen
  FOR ALL TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS wf_ausfuehrungen_admin_all ON public.wf_ausfuehrungen;
CREATE POLICY wf_ausfuehrungen_admin_all ON public.wf_ausfuehrungen
  FOR ALL TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS wf_warteschlange_admin_all ON public.wf_warteschlange;
CREATE POLICY wf_warteschlange_admin_all ON public.wf_warteschlange
  FOR ALL TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS wf_dead_letter_admin_all ON public.wf_dead_letter;
CREATE POLICY wf_dead_letter_admin_all ON public.wf_dead_letter
  FOR ALL TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS wf_audit_admin_all ON public.wf_audit_log;
CREATE POLICY wf_audit_admin_all ON public.wf_audit_log
  FOR ALL TO authenticated
  USING (public.is_admin());

-- ════════════════════════════════════════════════════════════════════════════
-- 2. PFLEGEDOKUMENTATION — 8 Policies
-- ════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS admin_pflege_aufnahmen ON public.pflege_aufnahmen;
CREATE POLICY admin_pflege_aufnahmen ON public.pflege_aufnahmen
  FOR ALL TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS admin_pflege_anamnesen ON public.pflege_anamnesen;
CREATE POLICY admin_pflege_anamnesen ON public.pflege_anamnesen
  FOR ALL TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS admin_pflege_diagnosen ON public.pflege_diagnosen;
CREATE POLICY admin_pflege_diagnosen ON public.pflege_diagnosen
  FOR ALL TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS admin_pflege_risiken ON public.pflege_risiken;
CREATE POLICY admin_pflege_risiken ON public.pflege_risiken
  FOR ALL TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS admin_pflege_massnahmenplaene ON public.pflege_massnahmenplaene;
CREATE POLICY admin_pflege_massnahmenplaene ON public.pflege_massnahmenplaene
  FOR ALL TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS admin_pflege_massnahmen ON public.pflege_massnahmen;
CREATE POLICY admin_pflege_massnahmen ON public.pflege_massnahmen
  FOR ALL TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS admin_pflege_verlauf ON public.pflege_verlauf;
CREATE POLICY admin_pflege_verlauf ON public.pflege_verlauf
  FOR ALL TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS admin_pflege_doku_perioden ON public.pflege_doku_perioden;
CREATE POLICY admin_pflege_doku_perioden ON public.pflege_doku_perioden
  FOR ALL TO authenticated
  USING (public.is_admin());

-- ════════════════════════════════════════════════════════════════════════════
-- 3. AUFGABEN & KOMMUNIKATION — 13 Policies
-- ════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "ops_aufgaben_admin_all" ON public.ops_aufgaben;
CREATE POLICY "ops_aufgaben_admin_all" ON public.ops_aufgaben
  FOR ALL TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "ops_checklisten_admin_all" ON public.ops_aufgaben_checklisten;
CREATE POLICY "ops_checklisten_admin_all" ON public.ops_aufgaben_checklisten
  FOR ALL TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "ops_kommentare_admin_all" ON public.ops_aufgaben_kommentare;
CREATE POLICY "ops_kommentare_admin_all" ON public.ops_aufgaben_kommentare
  FOR ALL TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "ops_anhaenge_admin_all" ON public.ops_aufgaben_anhaenge;
CREATE POLICY "ops_anhaenge_admin_all" ON public.ops_aufgaben_anhaenge
  FOR ALL TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "ops_wiedervorlagen_admin_all" ON public.ops_wiedervorlagen;
CREATE POLICY "ops_wiedervorlagen_admin_all" ON public.ops_wiedervorlagen
  FOR ALL TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "ops_eskalationsregeln_admin_all" ON public.ops_eskalationsregeln;
CREATE POLICY "ops_eskalationsregeln_admin_all" ON public.ops_eskalationsregeln
  FOR ALL TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "ops_eskalation_admin_all" ON public.ops_eskalationshistorie;
CREATE POLICY "ops_eskalation_admin_all" ON public.ops_eskalationshistorie
  FOR ALL TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "ops_nachrichten_admin_all" ON public.ops_nachrichten;
CREATE POLICY "ops_nachrichten_admin_all" ON public.ops_nachrichten
  FOR ALL TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "ops_empfaenger_admin_all" ON public.ops_nachrichten_empfaenger;
CREATE POLICY "ops_empfaenger_admin_all" ON public.ops_nachrichten_empfaenger
  FOR ALL TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "ops_benach_admin_all" ON public.ops_benachrichtigungen;
CREATE POLICY "ops_benach_admin_all" ON public.ops_benachrichtigungen
  FOR ALL TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "ops_praef_admin_all" ON public.ops_benachrichtigungs_praeferenzen;
CREATE POLICY "ops_praef_admin_all" ON public.ops_benachrichtigungs_praeferenzen
  FOR ALL TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "ops_ereignis_admin_all" ON public.ops_ereignis_regeln;
CREATE POLICY "ops_ereignis_admin_all" ON public.ops_ereignis_regeln
  FOR ALL TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "ops_log_admin_all" ON public.ops_aktivitaetslog;
CREATE POLICY "ops_log_admin_all" ON public.ops_aktivitaetslog
  FOR ALL TO authenticated
  USING (public.is_admin());

-- ════════════════════════════════════════════════════════════════════════════
-- 4. PERSONALMANAGEMENT — 7 Policies
-- ════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS admin_personal_schulungen ON public.personal_schulungen;
CREATE POLICY admin_personal_schulungen ON public.personal_schulungen
  FOR ALL TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS admin_dienstplan_schichten ON public.dienstplan_schichten;
CREATE POLICY admin_dienstplan_schichten ON public.dienstplan_schichten
  FOR ALL TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS admin_dienstplan_eintraege ON public.dienstplan_eintraege;
CREATE POLICY admin_dienstplan_eintraege ON public.dienstplan_eintraege
  FOR ALL TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS admin_personal_urlaubskonto ON public.personal_urlaubskonto;
CREATE POLICY admin_personal_urlaubskonto ON public.personal_urlaubskonto
  FOR ALL TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS admin_personal_arbeitszeiten ON public.personal_arbeitszeiten;
CREATE POLICY admin_personal_arbeitszeiten ON public.personal_arbeitszeiten
  FOR ALL TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS admin_personal_zeitkorrekturen ON public.personal_zeitkorrekturen;
CREATE POLICY admin_personal_zeitkorrekturen ON public.personal_zeitkorrekturen
  FOR ALL TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS admin_personal_audit_log ON public.personal_audit_log;
CREATE POLICY admin_personal_audit_log ON public.personal_audit_log
  FOR ALL TO authenticated
  USING (public.is_admin());

-- ════════════════════════════════════════════════════════════════════════════
-- 5. LEGACY-TABELLEN — 9 Policies (einige Tabellen existieren nur bedingt)
-- ════════════════════════════════════════════════════════════════════════════

-- 5a) messages — immer vorhanden
DROP POLICY IF EXISTS "Admins can manage all messages" ON public.messages;
DROP POLICY IF EXISTS "messages_admin_all" ON public.messages;
CREATE POLICY "messages_admin_all" ON public.messages
  FOR ALL TO authenticated
  USING (public.is_admin());

-- 5b) notifications — immer vorhanden
DROP POLICY IF EXISTS "Admins can manage all notifications" ON public.notifications;
DROP POLICY IF EXISTS "notifications_admin_all" ON public.notifications;
CREATE POLICY "notifications_admin_all" ON public.notifications
  FOR ALL TO authenticated
  USING (public.is_admin());

-- 5c) reviews — "Admins can manage all reviews" hat profiles-subquery;
--     "Admins can read all reviews" (20260414, is_admin()) ist redundant
--     wenn FOR ALL existiert.
DROP POLICY IF EXISTS "Admins can manage all reviews" ON public.reviews;
DROP POLICY IF EXISTS "Admins can read all reviews" ON public.reviews;
DROP POLICY IF EXISTS "reviews_admin_all" ON public.reviews;
CREATE POLICY "reviews_admin_all" ON public.reviews
  FOR ALL TO authenticated
  USING (public.is_admin());

-- 5d) angel_reviews
DROP POLICY IF EXISTS "Admin kann alle Bewertungen verwalten" ON public.angel_reviews;
DROP POLICY IF EXISTS "Admins can manage all reviews" ON public.angel_reviews;
DROP POLICY IF EXISTS "angel_reviews_admin_all" ON public.angel_reviews;
CREATE POLICY "angel_reviews_admin_all" ON public.angel_reviews
  FOR ALL TO authenticated
  USING (public.is_admin());

-- 5e) page_views
DROP POLICY IF EXISTS "Admins can read page views" ON public.page_views;
DROP POLICY IF EXISTS "page_views_admin_select" ON public.page_views;
CREATE POLICY "page_views_admin_select" ON public.page_views
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- 5f) Bedingt existierende Tabellen
DO $$
BEGIN
  -- care_eligibility
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'care_eligibility') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Admins can manage all eligibility" ON public.care_eligibility';
    EXECUTE 'DROP POLICY IF EXISTS "care_eligibility_admin_all" ON public.care_eligibility';
    EXECUTE 'CREATE POLICY "care_eligibility_admin_all" ON public.care_eligibility FOR ALL TO authenticated USING (public.is_admin())';
    RAISE NOTICE 'care_eligibility: Policy ersetzt';
  END IF;

  -- carebox_cart
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'carebox_cart') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Admins can manage all carts" ON public.carebox_cart';
    EXECUTE 'DROP POLICY IF EXISTS "carebox_cart_admin_all" ON public.carebox_cart';
    EXECUTE 'CREATE POLICY "carebox_cart_admin_all" ON public.carebox_cart FOR ALL TO authenticated USING (public.is_admin())';
    RAISE NOTICE 'carebox_cart: Policy ersetzt';
  END IF;

  -- carebox_order_requests
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'carebox_order_requests') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Admins can manage all orders" ON public.carebox_order_requests';
    EXECUTE 'DROP POLICY IF EXISTS "carebox_orders_admin_all" ON public.carebox_order_requests';
    EXECUTE 'CREATE POLICY "carebox_orders_admin_all" ON public.carebox_order_requests FOR ALL TO authenticated USING (public.is_admin())';
    RAISE NOTICE 'carebox_order_requests: Policy ersetzt';
  END IF;

  -- carebox_catalog_items
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'carebox_catalog_items') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Admins can manage catalog" ON public.carebox_catalog_items';
    EXECUTE 'DROP POLICY IF EXISTS "carebox_catalog_admin_all" ON public.carebox_catalog_items';
    EXECUTE 'CREATE POLICY "carebox_catalog_admin_all" ON public.carebox_catalog_items FOR ALL TO authenticated USING (public.is_admin())';
    RAISE NOTICE 'carebox_catalog_items: Policy ersetzt';
  END IF;
END $$;

COMMIT;

-- ── VERIFIKATION ────────────────────────────────────────────────────────────
-- Keine Policy darf mehr profiles-Subquery nutzen:
--
-- SELECT schemaname, tablename, policyname, qual
-- FROM pg_policies
-- WHERE schemaname = 'public'
--   AND qual LIKE '%profiles%'
--   AND qual NOT LIKE '%is_admin%';
--
-- Erwartet: 0 Zeilen.
