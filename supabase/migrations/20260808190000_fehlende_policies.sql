-- ════════════════════════════════════════════════════════════════════════════
-- Migration: Policies für Tabellen mit RLS, aber ohne jede Regel
-- Datum:     2026-08-08
-- Branch:    staging/expansion-abnahme
--
-- BEFUND (tests/audit-rls-vollstaendig.sql, Abschnitt A2)
--   Neun Tabellen in `public` haben RLS aktiviert und KEINE einzige
--   Policy. Damit sind sie fuer alles ausser service_role vollstaendig
--   gesperrt. Sicher — aber fuenf davon werden im Code mit dem
--   Nutzer-Client angesprochen:
--
--     app_settings           app/admin/settings/page.tsx            ('use client')
--     datenannahmestellen    app/admin/abrechnung/einstellungen/…   ('use client')
--     fcm_tokens             app/api/push/fcm-register/route.ts     (createClient)
--     push_subscriptions     app/api/push/subscribe/route.ts        (createClient)
--     referrals              app/api/referral/route.ts, …/complete  (createClient)
--
--   Auf einer aus diesem Repo aufgebauten Datenbank liefern diese
--   Zugriffe still nichts zurueck: Admin-Einstellungen bleiben leer,
--   Push-Tokens werden nicht gespeichert, das Empfehlungsprogramm
--   verbucht nichts. Ob die Produktionsdatenbank von Hand angelegte
--   Policies traegt, ist von hier aus nicht pruefbar — genau diese
--   Ungewissheit ist das Problem. Ab hier steht die Regel im Repo.
--
--   login_rate_limits, conversions und notfall_access_attempts bleiben
--   BEWUSST ohne Policy: sie werden ausschliesslich ueber
--   createAdminClient (service_role) angefasst und haben in Kundenhand
--   nichts verloren.
--
--   whatsapp_conversations bleibt ebenfalls gesperrt. Der Webhook
--   gehoert auf den Admin-Client umgestellt statt die Tabelle zu
--   oeffnen — eine Policy waere hier die falsche Antwort.
--
-- SCHUTZ VOR ABWEICHUNG ZUR PRODUKTION
--   Jeder Block legt seine Policy NUR an, wenn auf der Tabelle noch
--   GAR KEINE Policy existiert. Traegt die Zieldatenbank bereits
--   eigene Regeln, passiert nichts. So kann diese Migration eine
--   bestehende, womoeglich strengere Absicherung nicht aufweichen.
--
-- KEINE Datenaenderung. KEINE Production-Migration.
-- Rollback: 20260808190001_rollback_fehlende_policies.sql
-- ════════════════════════════════════════════════════════════════════════════

-- ── app_settings: nur Admins, lesen und schreiben ───────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='app_settings') THEN
    CREATE POLICY app_settings_admin_all ON public.app_settings
      FOR ALL TO authenticated
      USING (public.is_admin()) WITH CHECK (public.is_admin());
  END IF;
END $$;

-- ── datenannahmestellen: Abrechnungs-Stammdaten, nur Admins ─────────────────
-- Enthaelt SFTP-Hosts und -Benutzer der Datenannahmestellen. Niemals anon.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='datenannahmestellen') THEN
    CREATE POLICY datenannahmestellen_admin_all ON public.datenannahmestellen
      FOR ALL TO authenticated
      USING (public.is_admin()) WITH CHECK (public.is_admin());
  END IF;
END $$;

-- ── fcm_tokens: jeder nur seine eigenen Geräte ──────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='fcm_tokens') THEN
    CREATE POLICY fcm_tokens_eigene ON public.fcm_tokens
      FOR ALL TO authenticated
      USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

-- ── push_subscriptions: jeder nur seine eigenen Abos ────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='push_subscriptions') THEN
    CREATE POLICY push_subscriptions_eigene ON public.push_subscriptions
      FOR ALL TO authenticated
      USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

-- ── referrals: als Werbender oder Geworbener lesen ──────────────────────────
-- Das Verbuchen (Status, Gutschriften) laeuft ueber /api/referral/complete
-- mit service_role; deshalb hier NUR Leserecht. Ein Kunde soll seinen
-- eigenen Bonus nicht selbst auf „ausgezahlt" setzen koennen.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='referrals') THEN
    CREATE POLICY referrals_beteiligte_lesen ON public.referrals
      FOR SELECT TO authenticated
      USING (referrer_id = auth.uid() OR referred_id = auth.uid());
  END IF;
END $$;

-- anon hat auf keiner dieser Tabellen etwas zu suchen.
REVOKE ALL ON public.app_settings         FROM anon;
REVOKE ALL ON public.datenannahmestellen  FROM anon;
REVOKE ALL ON public.fcm_tokens           FROM anon;
REVOKE ALL ON public.push_subscriptions   FROM anon;
REVOKE ALL ON public.referrals            FROM anon;
