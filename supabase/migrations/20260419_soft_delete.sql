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
DROP POLICY IF EXISTS "Admins can manage all profiles" ON public.profiles;
CREATE POLICY "Admins can manage all profiles" ON public.profiles
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
              AND role IN ('admin', 'superadmin')
              AND deleted_at IS NULL)
  );

-- 4) RLS-Update: Angels-Tabelle
--    Wenn das verknuepfte Profil soft-deleted ist, soll der Engel
--    nicht mehr im Directory auftauchen.
DROP POLICY IF EXISTS "Anyone can view angels" ON public.angels;
CREATE POLICY "Anyone can view angels" ON public.angels
  FOR SELECT USING (
    NOT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = angels.id AND p.deleted_at IS NOT NULL
    )
  );

-- 5) Bookings: Soft-deleted User soll keine seiner Buchungen mehr sehen.
--    Sicherheits-Backstop fuer den Fall, dass die Auth-Session nach
--    dem signOut() doch noch lebt (z.B. anderer Browser-Tab).
DROP POLICY IF EXISTS "Users can view own bookings" ON public.bookings;
CREATE POLICY "Users can view own bookings" ON public.bookings
  FOR SELECT USING (
    (auth.uid() = customer_id OR auth.uid() = angel_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.deleted_at IS NOT NULL
    )
  );

-- 6) Messages: gleiche Logik
DROP POLICY IF EXISTS "Users can view own messages" ON public.messages;
CREATE POLICY "Users can view own messages" ON public.messages
  FOR SELECT USING (
    (auth.uid() = sender_id OR auth.uid() = receiver_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.deleted_at IS NOT NULL
    )
  );

-- 7) Documents: gleiche Logik (DSGVO — gesperrte Daten nicht mehr lesen)
DROP POLICY IF EXISTS "Users can view own documents" ON public.documents;
CREATE POLICY "Users can view own documents" ON public.documents
  FOR SELECT USING (
    auth.uid() = user_id
    AND NOT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.deleted_at IS NOT NULL
    )
  );

-- 8) Notifications: gleiche Logik
DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
CREATE POLICY "Users can view own notifications" ON public.notifications
  FOR SELECT USING (
    auth.uid() = user_id
    AND NOT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.deleted_at IS NOT NULL
    )
  );

-- 9) Care-Eligibility: gleiche Logik
DROP POLICY IF EXISTS "Users can view own eligibility" ON public.care_eligibility;
CREATE POLICY "Users can view own eligibility" ON public.care_eligibility
  FOR SELECT USING (
    auth.uid() = user_id
    AND NOT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.deleted_at IS NOT NULL
    )
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
--   BEGIN;
--   ALTER TABLE public.profiles DROP COLUMN IF EXISTS deleted_at;
--   DROP TABLE IF EXISTS public.account_deletion_tokens;
--   -- Policies aus fix_rls_policies.sql neu anwenden
--   COMMIT;
-- ════════════════════════════════════════════════════════════════════
