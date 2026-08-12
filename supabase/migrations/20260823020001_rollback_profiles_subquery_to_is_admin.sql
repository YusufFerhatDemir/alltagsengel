-- Rollback: profiles-Subquery-Policies wiederherstellen
-- ACHTUNG: Stellt den 42P17-anfaelligen Zustand wieder her.
-- Nur im Notfall verwenden.

BEGIN;

-- 1. Workflow
DROP POLICY IF EXISTS wf_events_admin_all ON public.wf_events;
CREATE POLICY wf_events_admin_all ON public.wf_events
  FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS wf_regeln_admin_all ON public.wf_regeln;
CREATE POLICY wf_regeln_admin_all ON public.wf_regeln
  FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS wf_aktionen_admin_all ON public.wf_aktionen;
CREATE POLICY wf_aktionen_admin_all ON public.wf_aktionen
  FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS wf_ausfuehrungen_admin_all ON public.wf_ausfuehrungen;
CREATE POLICY wf_ausfuehrungen_admin_all ON public.wf_ausfuehrungen
  FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS wf_warteschlange_admin_all ON public.wf_warteschlange;
CREATE POLICY wf_warteschlange_admin_all ON public.wf_warteschlange
  FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS wf_dead_letter_admin_all ON public.wf_dead_letter;
CREATE POLICY wf_dead_letter_admin_all ON public.wf_dead_letter
  FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS wf_audit_admin_all ON public.wf_audit_log;
CREATE POLICY wf_audit_admin_all ON public.wf_audit_log
  FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- 2. Pflegedoku
DROP POLICY IF EXISTS admin_pflege_aufnahmen ON public.pflege_aufnahmen;
CREATE POLICY admin_pflege_aufnahmen ON public.pflege_aufnahmen
  FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS admin_pflege_anamnesen ON public.pflege_anamnesen;
CREATE POLICY admin_pflege_anamnesen ON public.pflege_anamnesen
  FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS admin_pflege_diagnosen ON public.pflege_diagnosen;
CREATE POLICY admin_pflege_diagnosen ON public.pflege_diagnosen
  FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS admin_pflege_risiken ON public.pflege_risiken;
CREATE POLICY admin_pflege_risiken ON public.pflege_risiken
  FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS admin_pflege_massnahmenplaene ON public.pflege_massnahmenplaene;
CREATE POLICY admin_pflege_massnahmenplaene ON public.pflege_massnahmenplaene
  FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS admin_pflege_massnahmen ON public.pflege_massnahmen;
CREATE POLICY admin_pflege_massnahmen ON public.pflege_massnahmen
  FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS admin_pflege_verlauf ON public.pflege_verlauf;
CREATE POLICY admin_pflege_verlauf ON public.pflege_verlauf
  FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS admin_pflege_doku_perioden ON public.pflege_doku_perioden;
CREATE POLICY admin_pflege_doku_perioden ON public.pflege_doku_perioden
  FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- 3. Aufgaben (13 Policies)
DROP POLICY IF EXISTS "ops_aufgaben_admin_all" ON public.ops_aufgaben;
CREATE POLICY "ops_aufgaben_admin_all" ON public.ops_aufgaben
  FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "ops_checklisten_admin_all" ON public.ops_aufgaben_checklisten;
CREATE POLICY "ops_checklisten_admin_all" ON public.ops_aufgaben_checklisten
  FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "ops_kommentare_admin_all" ON public.ops_aufgaben_kommentare;
CREATE POLICY "ops_kommentare_admin_all" ON public.ops_aufgaben_kommentare
  FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "ops_anhaenge_admin_all" ON public.ops_aufgaben_anhaenge;
CREATE POLICY "ops_anhaenge_admin_all" ON public.ops_aufgaben_anhaenge
  FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "ops_wiedervorlagen_admin_all" ON public.ops_wiedervorlagen;
CREATE POLICY "ops_wiedervorlagen_admin_all" ON public.ops_wiedervorlagen
  FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "ops_eskalationsregeln_admin_all" ON public.ops_eskalationsregeln;
CREATE POLICY "ops_eskalationsregeln_admin_all" ON public.ops_eskalationsregeln
  FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "ops_eskalation_admin_all" ON public.ops_eskalationshistorie;
CREATE POLICY "ops_eskalation_admin_all" ON public.ops_eskalationshistorie
  FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "ops_nachrichten_admin_all" ON public.ops_nachrichten;
CREATE POLICY "ops_nachrichten_admin_all" ON public.ops_nachrichten
  FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "ops_empfaenger_admin_all" ON public.ops_nachrichten_empfaenger;
CREATE POLICY "ops_empfaenger_admin_all" ON public.ops_nachrichten_empfaenger
  FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "ops_benach_admin_all" ON public.ops_benachrichtigungen;
CREATE POLICY "ops_benach_admin_all" ON public.ops_benachrichtigungen
  FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "ops_praef_admin_all" ON public.ops_benachrichtigungs_praeferenzen;
CREATE POLICY "ops_praef_admin_all" ON public.ops_benachrichtigungs_praeferenzen
  FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "ops_ereignis_admin_all" ON public.ops_ereignis_regeln;
CREATE POLICY "ops_ereignis_admin_all" ON public.ops_ereignis_regeln
  FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "ops_log_admin_all" ON public.ops_aktivitaetslog;
CREATE POLICY "ops_log_admin_all" ON public.ops_aktivitaetslog
  FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- 4. Personal (7 Policies)
DROP POLICY IF EXISTS admin_personal_schulungen ON public.personal_schulungen;
CREATE POLICY admin_personal_schulungen ON public.personal_schulungen
  FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS admin_dienstplan_schichten ON public.dienstplan_schichten;
CREATE POLICY admin_dienstplan_schichten ON public.dienstplan_schichten
  FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS admin_dienstplan_eintraege ON public.dienstplan_eintraege;
CREATE POLICY admin_dienstplan_eintraege ON public.dienstplan_eintraege
  FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS admin_personal_urlaubskonto ON public.personal_urlaubskonto;
CREATE POLICY admin_personal_urlaubskonto ON public.personal_urlaubskonto
  FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS admin_personal_arbeitszeiten ON public.personal_arbeitszeiten;
CREATE POLICY admin_personal_arbeitszeiten ON public.personal_arbeitszeiten
  FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS admin_personal_zeitkorrekturen ON public.personal_zeitkorrekturen;
CREATE POLICY admin_personal_zeitkorrekturen ON public.personal_zeitkorrekturen
  FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS admin_personal_audit_log ON public.personal_audit_log;
CREATE POLICY admin_personal_audit_log ON public.personal_audit_log
  FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- 5. Legacy
DROP POLICY IF EXISTS "messages_admin_all" ON public.messages;
CREATE POLICY "Admins can manage all messages" ON public.messages
  FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin')));

DROP POLICY IF EXISTS "notifications_admin_all" ON public.notifications;
CREATE POLICY "Admins can manage all notifications" ON public.notifications
  FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin')));

DROP POLICY IF EXISTS "reviews_admin_all" ON public.reviews;
CREATE POLICY "Admins can manage all reviews" ON public.reviews
  FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin')));

DROP POLICY IF EXISTS "angel_reviews_admin_all" ON public.angel_reviews;
CREATE POLICY "Admin kann alle Bewertungen verwalten" ON public.angel_reviews
  FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin')));

DROP POLICY IF EXISTS "page_views_admin_select" ON public.page_views;
CREATE POLICY "Admins can read page views" ON public.page_views
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin')));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'care_eligibility') THEN
    EXECUTE 'DROP POLICY IF EXISTS "care_eligibility_admin_all" ON public.care_eligibility';
    EXECUTE $x$CREATE POLICY "Admins can manage all eligibility" ON public.care_eligibility FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin')))$x$;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'carebox_cart') THEN
    EXECUTE 'DROP POLICY IF EXISTS "carebox_cart_admin_all" ON public.carebox_cart';
    EXECUTE $x$CREATE POLICY "Admins can manage all carts" ON public.carebox_cart FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin')))$x$;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'carebox_order_requests') THEN
    EXECUTE 'DROP POLICY IF EXISTS "carebox_orders_admin_all" ON public.carebox_order_requests';
    EXECUTE $x$CREATE POLICY "Admins can manage all orders" ON public.carebox_order_requests FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin')))$x$;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'carebox_catalog_items') THEN
    EXECUTE 'DROP POLICY IF EXISTS "carebox_catalog_admin_all" ON public.carebox_catalog_items';
    EXECUTE $x$CREATE POLICY "Admins can manage catalog" ON public.carebox_catalog_items FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin')))$x$;
  END IF;
END $$;

COMMIT;
