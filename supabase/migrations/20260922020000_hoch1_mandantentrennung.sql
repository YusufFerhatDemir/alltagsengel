-- ════════════════════════════════════════════════════════════════════════════
-- Migration: Mandantentrennung fuer die personenbezogenen Tabellen ohne org_id
-- Datum:     2026-08-19 (Security-Audit 2026-08-19 — HOCH-1)
--
-- BEFUND
--   82 von 298 Tabellen haben keine organization_id; bei 52 ist die einzige
--   Admin-Policy ein org-blindes `is_admin()`. Ein Administrator einer
--   beliebigen Organisation sieht dort die Daten ALLER Organisationen —
--   darunter profiles, messages, krankenfahrten, angels, mis_privacy_* und
--   audit_logs.
--   Realwirkung heute begrenzt, weil produktiv praktisch nur die Stamm-Org
--   genutzt wird. Mit dem ersten echten Fremdmandanten ist es ein Blocker.
--
-- KLASSIFIZIERUNG
--   Alle 82 Tabellen sind in scripts/org-id-klassifizierung.json eingeordnet
--   und in docs/security/ORG_ID_KLASSIFIZIERUNG.md begruendet.
--   __tests__/security/org-id-klassifizierung.test.ts haelt die Einordnung
--   vollstaendig und ueberschneidungsfrei.
--   Diese Migration behandelt die beiden Klassen, die etwas brauchen:
--     * org_fence            (18 Tabellen) — Spalte + RESTRICTIVE Fence
--     * admin_policy_verengt ( 9 Tabellen) — is_admin() auf Org-Nachweis verengt
--
-- ═══ TEIL 1: current_org_id() aufloesen wie die Anwendung ═══════════════════
--   current_org_id() kannte bisher nur organization_members. Diese Tabelle
--   wurde 2026-08-01 aber ausschliesslich mit den damaligen Plattform-Admins
--   befuellt — Engel und Kundschaft haben dort KEINE Zeile und landeten
--   deshalb ausnahmslos im Stamm-Org-Fallback. Damit waere jeder org_fence auf
--   einer Tabelle, deren Zeilen Endnutzer selbst erzeugen, entweder wirkungslos
--   (alles Stamm-Org) oder wuerde die Nutzer aus den eigenen Zeilen aussperren.
--
--   Die Funktion loest jetzt genauso auf wie resolveUserOrgId() in
--   lib/organizations/server.ts:
--     1. JWT app_metadata.org_id (nur serverseitig setzbar)
--     2. organization_members            (Admins/Staff)
--     3. caregivers.organization_id      (Engel)
--     4. clients.organization_id         (Kundschaft)
--     5. Stamm-Org                       (anon, frisch Registrierte)
--
--   Der Stamm-Org-Fallback in Schritt 5 bleibt bewusst stehen: ohne ihn
--   scheitern die WITH-CHECK-Zweige aller bestehenden Fences fuer anonyme
--   Schreibpfade (Tracking, Lead-Formulare) und fuer Nutzer, die noch keine
--   Rollen-Zeile haben. Er ist kein Leseleck — die permissiven Policies
--   entscheiden weiterhin, WER ueberhaupt etwas sieht.
--
-- ═══ TEIL 2: org_fence-Klasse ══════════════════════════════════════════════
--   Spalte + Backfill Stamm-Org + DEFAULT current_org_id() + NOT NULL + Index
--   + RESTRICTIVE Fence — exakt das Muster aus
--   20260801_phase3_multi_mandant_saas.sql.
--
-- ═══ TEIL 3: admin_policy_verengt-Klasse ═══════════════════════════════════
--   Hier entstehen die Zeilen durch die Endnutzer selbst (Registrierung,
--   Nachrichten, Bewertungen). Ein RESTRICTIVE Fence wuerde sie aus den
--   eigenen Zeilen aussperren, sobald sich ihre Org-Zuordnung nachtraeglich
--   aendert (Profil entsteht vor der clients/caregivers-Zeile). Deshalb wird
--   NUR die org-blinde Admin-Policy verengt — die Selbstzugriffs-Policies
--   bleiben unangetastet. Das ist das Muster, das bei reviews/angel_reviews
--   schon steht (`is_admin() AND buchung_in_aktiver_org(booking_id)`).
--
--   Helfer: nutzer_in_aktiver_org(uuid)
--     true, wenn der Nutzer zur aktiven Org gehoert ODER ueberhaupt keine
--     Org-Bindung hat. Der zweite Zweig ist bewusst so: frisch Registrierte
--     haben noch keine Zeile in organization_members/caregivers/clients und
--     wuerden sonst fuer JEDEN Admin unsichtbar — die Nutzerverwaltung waere
--     kaputt. Dokumentierter Restpunkt: bindungslose Nutzer sind bis zur
--     ersten Zuordnung fuer alle Admins sichtbar.
--
-- ROLLBACK: 20260922020001_rollback_hoch1_mandantentrennung.sql
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- TEIL 1 — current_org_id() erweitern
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.current_org_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    NULLIF(auth.jwt() -> 'app_metadata' ->> 'org_id', '')::uuid,
    (SELECT om.organization_id
       FROM public.organization_members om
      WHERE om.user_id = auth.uid()
      ORDER BY om.created_at
      LIMIT 1),
    (SELECT cg.organization_id
       FROM public.caregivers cg
      WHERE cg.user_id = auth.uid()
        AND cg.organization_id IS NOT NULL
      LIMIT 1),
    (SELECT cl.organization_id
       FROM public.clients cl
      WHERE cl.user_id = auth.uid()
        AND cl.organization_id IS NOT NULL
      LIMIT 1),
    '00000000-0000-4000-8000-000460629986'::uuid
  );
$$;

COMMENT ON FUNCTION public.current_org_id() IS
  'Aktive Organisation des Requests. Reihenfolge: JWT app_metadata.org_id → organization_members → caregivers → clients → Stamm-Org. Spiegelt resolveUserOrgId() aus lib/organizations/server.ts (Security-Audit 2026-08-19, HOCH-1).';

REVOKE ALL ON FUNCTION public.current_org_id() FROM public;
GRANT EXECUTE ON FUNCTION public.current_org_id() TO anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- Helfer fuer TEIL 3 — Org-Nachweis fuer einen Nutzer
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.nutzer_hat_org_bindung(p_user uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.organization_members om WHERE om.user_id = p_user)
      OR EXISTS (SELECT 1 FROM public.caregivers cg WHERE cg.user_id = p_user AND cg.organization_id IS NOT NULL)
      OR EXISTS (SELECT 1 FROM public.clients cl   WHERE cl.user_id = p_user AND cl.organization_id IS NOT NULL);
$$;

CREATE OR REPLACE FUNCTION public.nutzer_in_aktiver_org(p_user uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_user IS NULL
      OR EXISTS (
           SELECT 1 FROM public.organization_members om
            WHERE om.user_id = p_user AND om.organization_id = public.current_org_id())
      OR EXISTS (
           SELECT 1 FROM public.caregivers cg
            WHERE cg.user_id = p_user AND cg.organization_id = public.current_org_id())
      OR EXISTS (
           SELECT 1 FROM public.clients cl
            WHERE cl.user_id = p_user AND cl.organization_id = public.current_org_id())
      -- Bindungslose Nutzer bleiben fuer jeden Admin sichtbar, sonst waere die
      -- Nutzerverwaltung direkt nach der Registrierung blind. Dokumentierter
      -- Restpunkt (siehe Kopf dieser Migration).
      OR NOT public.nutzer_hat_org_bindung(p_user);
$$;

COMMENT ON FUNCTION public.nutzer_in_aktiver_org(uuid) IS
  'Org-Nachweis fuer nutzerbezogene Zeilen ohne eigene organization_id (Security-Audit 2026-08-19, HOCH-1). Bindungslose Nutzer geben true zurueck — bewusst, damit frisch Registrierte sichtbar bleiben.';

REVOKE ALL ON FUNCTION public.nutzer_hat_org_bindung(uuid) FROM public;
REVOKE ALL ON FUNCTION public.nutzer_in_aktiver_org(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.nutzer_hat_org_bindung(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.nutzer_in_aktiver_org(uuid) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- TEIL 2 — organization_id + RESTRICTIVE Fence
-- ─────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  t text;
  fence_tables text[] := ARRAY[
    'approved_locations',
    'audit_logs',
    'kf_booking_reviews',
    'kf_partner_availability',
    'kf_partners',
    'krankenfahrt_providers',
    'krankenfahrt_reviews',
    'krankenfahrten',
    'lead_inquiries',
    'mis_auth_log',
    'mis_dataroom_access',
    'mis_privacy_audit_log',
    'mis_privacy_consents',
    'mis_privacy_records',
    'mis_privacy_requests',
    'newsletter_subscribers',
    'notfall_access_attempts',
    'whatsapp_conversations'
  ];
BEGIN
  FOREACH t IN ARRAY fence_tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      RAISE NOTICE 'Tabelle % existiert nicht — uebersprungen', t;
      CONTINUE;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND column_name = 'organization_id'
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD COLUMN organization_id uuid REFERENCES public.organizations(id)', t);
      EXECUTE format(
        'UPDATE public.%I SET organization_id = ''00000000-0000-4000-8000-000460629986'' WHERE organization_id IS NULL', t);
      EXECUTE format(
        'ALTER TABLE public.%I ALTER COLUMN organization_id SET DEFAULT public.current_org_id()', t);
      EXECUTE format(
        'ALTER TABLE public.%I ALTER COLUMN organization_id SET NOT NULL', t);
      RAISE NOTICE 'organization_id ergaenzt: %', t;
    END IF;

    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_%s_org ON public.%I (organization_id)', t, t);

    EXECUTE format('DROP POLICY IF EXISTS "%s_org_fence" ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY "%s_org_fence" ON public.%I AS RESTRICTIVE FOR ALL '
      || 'USING (organization_id = public.current_org_id()) '
      || 'WITH CHECK (organization_id = public.current_org_id())', t, t);
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- TEIL 3 — org-blinde Admin-Policies verengen
--   Jede Policy wird 1:1 mit demselben Namen und derselben Bedingung neu
--   angelegt, ergaenzt um den Org-Nachweis. Die Selbstzugriffs-Policies
--   bleiben unberuehrt.
-- ─────────────────────────────────────────────────────────────────────────

-- profiles: die Zeile IST der Nutzer
DROP POLICY IF EXISTS "Admins can manage all profiles" ON public.profiles;
CREATE POLICY "Admins can manage all profiles" ON public.profiles
  FOR ALL TO public
  USING (is_admin() AND public.nutzer_in_aktiver_org(id));

DROP POLICY IF EXISTS "profiles_select_admin" ON public.profiles;
CREATE POLICY "profiles_select_admin" ON public.profiles
  FOR SELECT TO public
  USING (is_admin() AND public.nutzer_in_aktiver_org(id));

DROP POLICY IF EXISTS "Admin can delete profiles" ON public.profiles;
CREATE POLICY "Admin can delete profiles" ON public.profiles
  FOR DELETE TO public
  USING (is_admin() AND public.nutzer_in_aktiver_org(id));

DROP POLICY IF EXISTS "Admin can update all profiles" ON public.profiles;
CREATE POLICY "Admin can update all profiles" ON public.profiles
  FOR UPDATE TO public
  USING ((auth.uid() = id) OR (is_admin() AND public.nutzer_in_aktiver_org(id)));

-- angels: angels.id = profiles.id
DROP POLICY IF EXISTS "Admin engelleri yönetebilir" ON public.angels;
CREATE POLICY "Admin engelleri yönetebilir" ON public.angels
  FOR ALL TO public
  USING (is_admin() AND public.nutzer_in_aktiver_org(id));

-- angel_availability: angel_id = auth.uid() des Engels
DROP POLICY IF EXISTS "angel_availability_delete" ON public.angel_availability;
CREATE POLICY "angel_availability_delete" ON public.angel_availability
  FOR DELETE TO authenticated
  USING ((angel_id = auth.uid()) OR (is_admin() AND public.nutzer_in_aktiver_org(angel_id)));

DROP POLICY IF EXISTS "angel_availability_insert" ON public.angel_availability;
CREATE POLICY "angel_availability_insert" ON public.angel_availability
  FOR INSERT TO authenticated
  WITH CHECK ((angel_id = auth.uid()) OR (is_admin() AND public.nutzer_in_aktiver_org(angel_id)));

DROP POLICY IF EXISTS "angel_availability_update" ON public.angel_availability;
CREATE POLICY "angel_availability_update" ON public.angel_availability
  FOR UPDATE TO authenticated
  USING ((angel_id = auth.uid()) OR (is_admin() AND public.nutzer_in_aktiver_org(angel_id)))
  WITH CHECK ((angel_id = auth.uid()) OR (is_admin() AND public.nutzer_in_aktiver_org(angel_id)));

-- messages: Absender/Empfaenger sind Nutzer
DROP POLICY IF EXISTS "messages_admin_all" ON public.messages;
CREATE POLICY "messages_admin_all" ON public.messages
  FOR ALL TO authenticated
  USING (is_admin() AND public.nutzer_in_aktiver_org(sender_id));

-- notifications: an einen Nutzer adressiert
DROP POLICY IF EXISTS "notifications_admin_all" ON public.notifications;
CREATE POLICY "notifications_admin_all" ON public.notifications
  FOR ALL TO authenticated
  USING (is_admin() AND public.nutzer_in_aktiver_org(user_id));

-- referrals: Werber und Geworbener sind Nutzer
DROP POLICY IF EXISTS "Admins sehen alle Referrals" ON public.referrals;
CREATE POLICY "Admins sehen alle Referrals" ON public.referrals
  FOR SELECT TO authenticated
  USING (is_admin() AND public.nutzer_in_aktiver_org(referrer_id));

-- chat_messages hat keine Admin-Policy (nur Fahrt-Beteiligte) und
-- reviews/angel_reviews sind bereits ueber buchung_in_aktiver_org() verengt —
-- beide bleiben unveraendert, sind aber in der Klassifizierung gefuehrt,
-- damit die Vollstaendigkeitspruefung greift.

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- VERIFIKATION (nach Apply):
--   select public.current_org_id();
--   select count(*) from krankenfahrten where organization_id is null;   -- 0
--   select tablename, policyname from pg_policies
--    where policyname like '%\_org\_fence' order by tablename;
--   select policyname, qual from pg_policies
--    where tablename = 'profiles' and policyname = 'profiles_select_admin';
--     -> muss nutzer_in_aktiver_org enthalten
-- ════════════════════════════════════════════════════════════════════════════
