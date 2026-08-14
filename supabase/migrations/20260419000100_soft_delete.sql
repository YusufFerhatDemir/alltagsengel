-- ════════════════════════════════════════════════════════════════════
-- AUTH-003: Soft-Delete + 60-Tage-Grace-Period + Widerruf-Token
-- ════════════════════════════════════════════════════════════════════
--
-- Vorher: DELETE-API hat sofort hart gelöscht (Auth + alle Tabellen).
-- Nachher: profiles.deleted_at = now() wird gesetzt; ein Token wird
--          generiert und per Mail verschickt; nach 60 Tagen kommt eine
--          pg_cron-Edge-Function und löscht endgültig.
--
-- Vorteile:
--   1. Senior-friendly: Versehentliches "Konto löschen" lässt sich 60
--      Tage lang per Klick zurückholen.
--   2. DSGVO Art. 17: 30-60 Tage Grace gilt als angemessen, weil der
--      User aktiv eingeloggt war + Mail bestätigt das.
--   3. Audit-Trail bleibt erhalten — wir wissen wer/wann gelöscht hat.
--   4. Hard-Delete läuft asynchron in einer Cron-Function — kein
--      User-Request blockt 5 Sekunden auf Cascading-Deletes.
--
-- Analogie: Wie ein Papierkorb beim Mac. Drag-to-Trash = Soft-Delete.
--           Der Mac selbst leert den Trash erst nach 30 Tagen oder
--           wenn der Nutzer "Endgültig löschen" klickt.
-- ════════════════════════════════════════════════════════════════════

BEGIN;

-- 1) Spalte deleted_at auf profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

COMMENT ON COLUMN public.profiles.deleted_at IS
  'Soft-Delete Marker. NULL = aktiver Account. Gesetzt = Grace-Period laeuft, '
  'Hard-Delete erfolgt nach 60 Tagen via pg_cron Edge-Function.';

-- Schneller Index fuer Cron-Scan ("welche Accounts >60 Tage soft-deleted?")
CREATE INDEX IF NOT EXISTS idx_profiles_deleted_at
  ON public.profiles(deleted_at)
  WHERE deleted_at IS NOT NULL;

-- 2) Token-Tabelle fuer Widerruf-Links per Mail
CREATE TABLE IF NOT EXISTS public.account_deletion_tokens (
  user_id      uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  token        text NOT NULL UNIQUE,
  expires_at   timestamptz NOT NULL,
  confirmed_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.account_deletion_tokens IS
  'Widerruf-Tokens fuer Soft-Deleted-Accounts. Ein Token pro User. '
  'Wird per Mail verschickt — User klickt Link → Konto wird reaktiviert. '
  'Eintrag wird beim Hard-Delete oder beim Widerruf entfernt.';

CREATE INDEX IF NOT EXISTS idx_account_deletion_tokens_token
  ON public.account_deletion_tokens(token);

ALTER TABLE public.account_deletion_tokens ENABLE ROW LEVEL SECURITY;

-- Token-Tabelle: Nur Service-Role darf direkt rein. Nutzer haben keinen
-- direkten Zugriff — die Validierung passiert serverseitig in der
-- /api/user/delete/undo Route.
DROP POLICY IF EXISTS "Service role only on deletion tokens" ON public.account_deletion_tokens;
CREATE POLICY "Service role only on deletion tokens"
  ON public.account_deletion_tokens
  FOR ALL
  USING (false)
  WITH CHECK (false);

-- 3) RLS-Update: Soft-Deleted Profile sind unsichtbar
--    Wir patchen die "Anyone can view public profiles" Policy:
--    statt USING (true) jetzt USING (deleted_at IS NULL).
--    Dadurch verschwindet der User effektiv ueberall (Engel-Directory,
--    Chat-Lookups, Buchungs-Joins), aber die Daten bleiben in der DB.

DROP POLICY IF EXISTS "Anyone can view public profiles" ON public.profiles;
CREATE POLICY "Anyone can view public profiles" ON public.profiles
  FOR SELECT USING (deleted_at IS NULL);

-- Self-Update darf weiter funktionieren — sonst koennte man nicht mal
-- eigene Profil-Felder ansehen waehrend die Mail noch aussteht.
-- Aber: Auth-Session ist eh schon weg nach Soft-Delete (signOut).

-- Admins sehen weiterhin ALLES (inkl. soft-deleted) — wichtig fuer
-- Recovery-Support.
--
-- WICHTIG (Fix 2026-08-03): Die Admin-Pruefung darf profiles NICHT
-- direkt in der eigenen Policy abfragen — das ergibt "infinite
-- recursion detected in policy for relation profiles" (42P17) bei
-- JEDEM authenticated/anon SELECT auf profiles (auf der Shadow-DB
-- real nachgewiesen; live nur durch Policy-Drift maskiert). Stattdessen
-- laeuft der Check ueber is_admin() (SECURITY DEFINER, seit 20260414
-- vorhanden — umgeht RLS und bricht damit die Rekursion). Wir ziehen
-- die Soft-Delete-Semantik in die Funktion: ein soft-deleted Admin
-- verliert ueberall seine Admin-Rechte.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role = ANY (ARRAY['admin','superadmin'])
      AND deleted_at IS NULL
  );
$$;

DROP POLICY IF EXISTS "Admins can manage all profiles" ON public.profiles;
CREATE POLICY "Admins can manage all profiles" ON public.profiles
  FOR ALL USING (public.is_admin());

-- 4) Helper fuer die Policies 5-9 (Fix 2026-08-03): Ein direktes
--    Sub-SELECT auf profiles in Policies anderer Tabellen bildet mit
--    profiles_select_booking_partner (20260414: profiles → bookings)
--    einen Zyklus (bookings → profiles → bookings → …) und wirft
--    42P17 "infinite recursion" — auf der Shadow-DB nachgewiesen:
--    JEDER authenticated SELECT auf profiles UND bookings schlug fehl.
--    SECURITY DEFINER umgeht RLS im Funktions-Body und bricht den
--    Zyklus. Boolean-Rueckgabe pro UUID, keine Datenpreisgabe.
CREATE OR REPLACE FUNCTION public.is_profile_soft_deleted(uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = uid AND deleted_at IS NOT NULL
  );
$$;
REVOKE ALL ON FUNCTION public.is_profile_soft_deleted(uuid) FROM public;
-- anon braucht EXECUTE, weil "Anyone can view angels" (Directory ist
-- oeffentlich) die Funktion in der Policy auswertet.
GRANT EXECUTE ON FUNCTION public.is_profile_soft_deleted(uuid) TO authenticated, anon, service_role;

--    Angels: Wenn das verknuepfte Profil soft-deleted ist, soll der
--    Engel nicht mehr im Directory auftauchen.
DROP POLICY IF EXISTS "Anyone can view angels" ON public.angels;
CREATE POLICY "Anyone can view angels" ON public.angels
  FOR SELECT USING (
    NOT public.is_profile_soft_deleted(angels.id)
  );

-- 5) Bookings: Soft-deleted User soll keine seiner Buchungen mehr sehen.
--    Sicherheits-Backstop fuer den Fall, dass die Auth-Session nach
--    dem signOut() doch noch lebt (z.B. anderer Browser-Tab).
DROP POLICY IF EXISTS "Users can view own bookings" ON public.bookings;
CREATE POLICY "Users can view own bookings" ON public.bookings
  FOR SELECT USING (
    (auth.uid() = customer_id OR auth.uid() = angel_id)
    AND NOT public.is_profile_soft_deleted(auth.uid())
  );

-- 6) Messages: gleiche Logik
DROP POLICY IF EXISTS "Users can view own messages" ON public.messages;
CREATE POLICY "Users can view own messages" ON public.messages
  FOR SELECT USING (
    (auth.uid() = sender_id OR auth.uid() = receiver_id)
    AND NOT public.is_profile_soft_deleted(auth.uid())
  );

-- 7) Documents: gleiche Logik (DSGVO — gesperrte Daten nicht mehr lesen)
-- GUARD: documents-Tabelle existiert derzeit nicht in Produktion.
-- Policy wird nur angelegt, wenn die Tabelle vorhanden ist.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'documents') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Users can view own documents" ON public.documents';
    EXECUTE $pol$CREATE POLICY "Users can view own documents" ON public.documents
      FOR SELECT USING (
        auth.uid() = user_id
        AND NOT public.is_profile_soft_deleted(auth.uid())
      )$pol$;
  END IF;
END
$$;

-- 8) Notifications: gleiche Logik
DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
CREATE POLICY "Users can view own notifications" ON public.notifications
  FOR SELECT USING (
    auth.uid() = user_id
    AND NOT public.is_profile_soft_deleted(auth.uid())
  );

-- 9) Care-Eligibility: gleiche Logik
DROP POLICY IF EXISTS "Users can view own eligibility" ON public.care_eligibility;
CREATE POLICY "Users can view own eligibility" ON public.care_eligibility
  FOR SELECT USING (
    auth.uid() = user_id
    AND NOT public.is_profile_soft_deleted(auth.uid())
  );

-- 10) Audit-Log: neue Action-Typen zulassen (Soft-Delete + Undelete + Cron-Hard-Delete)
--     Wir ersetzen den CHECK-Constraint, der aus 20260417 kommt.
ALTER TABLE public.mis_audit_log
  DROP CONSTRAINT IF EXISTS mis_audit_log_action_check;

ALTER TABLE public.mis_audit_log
  ADD CONSTRAINT mis_audit_log_action_check
  CHECK (action IN (
    -- Legacy MIS-Actions
    'create','read','update','delete','download','approve','reject','share','archive',
    -- Auth-Events
    'password_reset',
    'role_grant',
    'role_revoke',
    'user_delete',
    'user_self_delete',
    'user_self_soft_delete',   -- NEW (AUTH-003 v2)
    'user_self_undelete',      -- NEW (AUTH-003 v2 Widerruf)
    'user_hard_delete_cron',   -- NEW (Edge-Function nach 60 Tagen)
    'data_export',
    'admin_login',
    'rate_limit_reset'
  ));

COMMIT;

-- ════════════════════════════════════════════════════════════════════
-- ROLLBACK-Plan (falls Migration ein Problem macht):
--
-- Reihenfolge ist wichtig:
--   1. Die 6 Policies, die is_profile_soft_deleted() aufrufen, per
--      DROP+CREATE auf ihre Vor-Soft-Delete-Definition (Stand
--      20260319000000_fix_rls_policies.sql) zurücksetzen. Sie hängen
--      NICHT via CASCADE an der Spalte (Funktions-Body wird erst zur
--      Laufzeit geparst) und würden nach dem DROP COLUMN bei jedem
--      Query fehlschlagen.
--   2. is_admin() auf den 20260414-Stand zurücksetzen und
--      is_profile_soft_deleted() droppen — beide referenzieren
--      deleted_at im Body.
--   3. Erst DANN Spalte + Tabelle droppen (CASCADE räumt nur noch
--      "Anyone can view public profiles" ab → neu anlegen).
--
-- NICHT die ganze fix_rls_policies.sql erneut ausführen — die würde
-- ~60 weitere Policies auf einen veralteten Stand zurückdrehen.
-- "Admins can manage all profiles" bleibt auf USING (public.is_admin())
-- stehen — die alte Selbstreferenz-Variante wirft 42P17 (s.o.).
--
-- Der mis_audit_log-Check-Constraint bleibt absichtlich stehen: er ist
-- additiv, und ein Zurückdrehen würde vorhandene Audit-Zeilen mit den
-- neuen Action-Werten verletzen (Datenverlust-Risiko).
--
-- Getestet auf der Shadow-DB am 2026-08-03 (kein Zeilenverlust in
-- profiles/bookings/messages; Re-Apply dieser Migration stellt das
-- Feature danach vollständig wieder her).
--
--   BEGIN;
--   DROP POLICY IF EXISTS "Anyone can view angels" ON public.angels;
--   CREATE POLICY "Anyone can view angels" ON public.angels
--     FOR SELECT USING (true);
--   DROP POLICY IF EXISTS "Users can view own bookings" ON public.bookings;
--   CREATE POLICY "Users can view own bookings" ON public.bookings
--     FOR SELECT USING (auth.uid() = customer_id OR auth.uid() = angel_id);
--   DROP POLICY IF EXISTS "Users can view own messages" ON public.messages;
--   CREATE POLICY "Users can view own messages" ON public.messages
--     FOR SELECT USING (auth.uid() = sender_id OR auth.uid() = receiver_id);
--   DROP POLICY IF EXISTS "Users can view own documents" ON public.documents;
--   CREATE POLICY "Users can view own documents" ON public.documents
--     FOR SELECT USING (auth.uid() = user_id);
--   DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
--   CREATE POLICY "Users can view own notifications" ON public.notifications
--     FOR SELECT USING (auth.uid() = user_id);
--   DROP POLICY IF EXISTS "Users can view own eligibility" ON public.care_eligibility;
--   CREATE POLICY "Users can view own eligibility" ON public.care_eligibility
--     FOR SELECT USING (auth.uid() = user_id);
--   CREATE OR REPLACE FUNCTION public.is_admin()
--   RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
--   SET search_path TO 'public'
--   AS $fn$
--     SELECT EXISTS (
--       SELECT 1 FROM public.profiles
--       WHERE id = auth.uid() AND role = ANY (ARRAY['admin','superadmin'])
--     );
--   $fn$;
--   DROP FUNCTION IF EXISTS public.is_profile_soft_deleted(uuid);
--   -- CASCADE räumt alle Policies mit direktem deleted_at-Bezug ab:
--   -- "Anyone can view public profiles" sowie profiles_select_engels
--   -- und profiles_select_booking_partner (deleted_at-Filter aus
--   -- 20260803000000) — die drei danach im Vor-Soft-Delete-Stand
--   -- (20260319 bzw. 20260414) neu anlegen:
--   ALTER TABLE public.profiles DROP COLUMN IF EXISTS deleted_at CASCADE;
--   DROP TABLE IF EXISTS public.account_deletion_tokens;
--   CREATE POLICY "Anyone can view public profiles" ON public.profiles
--     FOR SELECT USING (true);
--   CREATE POLICY "profiles_select_engels" ON public.profiles
--     FOR SELECT USING (auth.role() = 'authenticated' AND role = 'engel');
--   CREATE POLICY "profiles_select_booking_partner" ON public.profiles
--     FOR SELECT USING (
--       auth.role() = 'authenticated' AND (
--         EXISTS (
--           SELECT 1 FROM public.bookings b
--           WHERE (b.customer_id = profiles.id AND b.angel_id = auth.uid())
--              OR (b.angel_id = profiles.id AND b.customer_id = auth.uid())
--         )
--         OR EXISTS (
--           SELECT 1 FROM public.krankenfahrten k
--           WHERE k.customer_id = profiles.id
--             AND k.provider_id IN (
--               SELECT id FROM public.krankenfahrt_providers
--               WHERE user_id = auth.uid()
--             )
--         )
--       )
--     );
--   COMMIT;
-- ════════════════════════════════════════════════════════════════════
