-- ═══════════════════════════════════════════════════════════════════════
-- Push als echter Zustellkanal — Geraete-Token, Opt-out, Provider 'fcm'
-- ═══════════════════════════════════════════════════════════════════════
--
-- AUSGANGSLAGE
-- notification_delivery_log (20260923000000) kennt den Kanal 'push', aber
-- nur den Provider 'web_push'. Native Push laeuft ueber FCM und wurde
-- deshalb bewusst GAR NICHT protokolliert — der Kommentar in
-- lib/notifications.ts sagte es woertlich: ein Eintrag waere eine
-- Falschaussage gewesen. Ergebnis: der einzige Kanal ohne Zustellspur.
--
-- WARUM KEINE NEUE TABELLE push_device_tokens
-- public.fcm_tokens existiert bereits live, traegt Daten, hat RLS und
-- eine Policy (20260808190000). Eine zweite Token-Tabelle danebenzustellen
-- haette zwei Wahrheiten ueber dieselbe Sache erzeugt — die eine von der
-- nativen App befuellt, die andere vom neuen Weg. Diese Migration baut
-- die bestehende Tabelle aus, statt sie zu verdoppeln.
--
-- WAS DAZUKOMMT
--   1. fcm_tokens.organization_id  — Mandantengrenze (RESTRICTIVE Fence).
--      Bisher gab es keine: jeder Admin-Blick auf Geraete war org-blind.
--   2. UNIQUE (user_id, token)     — ohne den ist die Registrierung nicht
--      idempotent. Der bestehende Upsert in app/api/push/fcm-register
--      nennt onConflict 'user_id,token' und lief damit ins Leere: ohne
--      passenden Index legt PostgREST bei jedem App-Start eine neue Zeile
--      an. Ein Nutzer haette nach 50 Starts 50 Zeilen und bekaeme jede
--      Nachricht 50-mal.
--   3. last_used_at                — Grundlage fuers Aufraeumen toter
--      Geraete; ein Token ohne Nutzung ueber Monate ist Altlast.
--   4. platform-CHECK              — 'android' | 'ios' | 'web'.
--   5. notification_preferences    — der Opt-out. Ein Token ist die
--      Einwilligung des Geraets (das Betriebssystem hat gefragt); die
--      Zeile hier ist der Widerspruch des Nutzers. KEINE Zeile bedeutet
--      deshalb "erlaubt" — sonst waere jede bestehende Registrierung
--      ueber Nacht stumm.
--   6. Provider 'fcm' im CHECK von notification_delivery_log.
--
-- WARUM DER TOKEN IM KLARTEXT BLEIBT
-- Ein FCM-Registration-Token ist keine Kennung des Nutzers und kein
-- Geheimnis, mit dem sich jemand ausweisen kann — er ist die Adresse, an
-- die Google zustellt. Er MUSS im Klartext vorliegen, sonst laesst sich
-- nicht senden. Geschuetzt wird er ueber RLS und den anon-Entzug, nicht
-- ueber Verschluesselung.
--
-- Rollback: 20260930000001_rollback_push_geraete_token.sql
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════
-- 1) fcm_tokens — Mandant, Eindeutigkeit, Nutzungszeitpunkt
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  hat_orgs boolean;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'fcm_tokens'
  ) THEN
    RAISE EXCEPTION 'public.fcm_tokens fehlt — Baseline nicht eingespielt';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'organizations'
  ) INTO hat_orgs;

  -- ── organization_id ──
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'fcm_tokens'
      AND column_name = 'organization_id'
  ) THEN
    IF hat_orgs THEN
      ALTER TABLE public.fcm_tokens
        ADD COLUMN organization_id uuid REFERENCES public.organizations(id);
    ELSE
      ALTER TABLE public.fcm_tokens ADD COLUMN organization_id uuid;
    END IF;

    -- Backfill: erste Mitgliedschaft des Nutzers, sonst Stamm-Org.
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'organization_members'
    ) THEN
      UPDATE public.fcm_tokens t
         SET organization_id = m.organization_id
        FROM (
          SELECT DISTINCT ON (user_id) user_id, organization_id
            FROM public.organization_members
           ORDER BY user_id, created_at
        ) m
       WHERE m.user_id = t.user_id
         AND t.organization_id IS NULL;
    END IF;

    UPDATE public.fcm_tokens
       SET organization_id = '00000000-0000-4000-8000-000460629986'
     WHERE organization_id IS NULL;

    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'current_org_id'
    ) THEN
      ALTER TABLE public.fcm_tokens
        ALTER COLUMN organization_id SET DEFAULT public.current_org_id();
    END IF;

    ALTER TABLE public.fcm_tokens ALTER COLUMN organization_id SET NOT NULL;
  END IF;

  -- ── last_used_at ──
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'fcm_tokens'
      AND column_name = 'last_used_at'
  ) THEN
    ALTER TABLE public.fcm_tokens ADD COLUMN last_used_at timestamptz;
    UPDATE public.fcm_tokens SET last_used_at = updated_at WHERE last_used_at IS NULL;
  END IF;
END $$;

-- ── Dubletten aufloesen, BEVOR der Unique-Index kommt ──
-- Die aelteste Zeile je (user_id, token) gewinnt: sie traegt das echte
-- created_at. Alles andere ist genau die Altlast, die der fehlende Index
-- entstehen liess.
DELETE FROM public.fcm_tokens a
 USING public.fcm_tokens b
 WHERE a.user_id = b.user_id
   AND a.token   = b.token
   AND a.created_at > b.created_at;

DELETE FROM public.fcm_tokens a
 USING public.fcm_tokens b
 WHERE a.user_id = b.user_id
   AND a.token   = b.token
   AND a.created_at = b.created_at
   AND a.id > b.id;

CREATE UNIQUE INDEX IF NOT EXISTS fcm_tokens_user_token_uniq
  ON public.fcm_tokens (user_id, token);

CREATE INDEX IF NOT EXISTS idx_fcm_tokens_org
  ON public.fcm_tokens (organization_id);

CREATE INDEX IF NOT EXISTS idx_fcm_tokens_user
  ON public.fcm_tokens (user_id);

-- ── platform auf die drei tatsaechlichen Werte begrenzen ──
DO $$
BEGIN
  UPDATE public.fcm_tokens
     SET platform = 'android'
   WHERE platform IS NULL OR platform NOT IN ('android', 'ios', 'web');

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'fcm_tokens_platform_check'
       AND conrelid = 'public.fcm_tokens'::regclass
  ) THEN
    ALTER TABLE public.fcm_tokens
      ADD CONSTRAINT fcm_tokens_platform_check
      CHECK (platform IN ('android', 'ios', 'web'));
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- 2) fcm_tokens — RLS: eigene Geraete, Admin nur im eigenen Mandanten
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.fcm_tokens ENABLE ROW LEVEL SECURITY;

-- Bestandspolicy (20260808190000) bleibt: jeder sieht seine eigenen
-- Geraete. Ergaenzt wird der Admin-Blick — bewusst NUR lesend und NUR im
-- eigenen Mandanten. Ein Admin muss sehen koennen, ob ein Nutzer
-- ueberhaupt ein Geraet registriert hat; er hat aber keinen Grund,
-- fremde Token zu aendern.
DROP POLICY IF EXISTS fcm_tokens_admin_lesen ON public.fcm_tokens;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'is_admin'
  ) THEN
    EXECUTE
      'CREATE POLICY fcm_tokens_admin_lesen ON public.fcm_tokens '
      || 'FOR SELECT USING (public.is_admin())';
  END IF;
END $$;

-- RESTRICTIVE Fence: schneidet JEDE permissive Policy auf die aktive
-- Organisation zu. Damit wird der Admin-Blick oben org-gebunden, ohne
-- dass die Policy selbst davon wissen muss.
DROP POLICY IF EXISTS fcm_tokens_org_fence ON public.fcm_tokens;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'current_org_id'
  ) THEN
    EXECUTE
      'CREATE POLICY fcm_tokens_org_fence ON public.fcm_tokens AS RESTRICTIVE FOR ALL '
      || 'USING (organization_id = public.current_org_id()) '
      || 'WITH CHECK (organization_id = public.current_org_id())';
  END IF;
END $$;

REVOKE ALL ON public.fcm_tokens FROM anon;

-- ═══════════════════════════════════════════════════════════════════
-- 3) notification_preferences — der Widerspruch des Nutzers
-- ═══════════════════════════════════════════════════════════════════
--
-- Fehlende Zeile = erlaubt. Begruendung im Kopf dieser Datei.

CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id         uuid        NOT NULL,
  organization_id uuid        NOT NULL,
  channel         text        NOT NULL
                    CHECK (channel IN ('email', 'push', 'in_app', 'whatsapp')),
  enabled         boolean     NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, channel)
);

CREATE INDEX IF NOT EXISTS idx_notification_preferences_org
  ON public.notification_preferences (organization_id);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notification_preferences_eigene ON public.notification_preferences;
CREATE POLICY notification_preferences_eigene ON public.notification_preferences
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS notification_preferences_org_fence ON public.notification_preferences;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'current_org_id'
  ) THEN
    EXECUTE
      'CREATE POLICY notification_preferences_org_fence ON public.notification_preferences '
      || 'AS RESTRICTIVE FOR ALL '
      || 'USING (organization_id = public.current_org_id()) '
      || 'WITH CHECK (organization_id = public.current_org_id())';
  END IF;
END $$;

REVOKE ALL ON public.notification_preferences FROM anon;

COMMENT ON TABLE public.notification_preferences IS
  'Kanal-Widerspruch je Nutzer. KEINE Zeile bedeutet erlaubt — nur eine '
  'Zeile mit enabled=false schaltet den Kanal ab.';

-- ═══════════════════════════════════════════════════════════════════
-- 4) notification_delivery_log — Provider 'fcm'
-- ═══════════════════════════════════════════════════════════════════
--
-- Ohne diesen Wert wuerde jede Protokollzeile eines nativen Push am
-- CHECK scheitern (23514) und stillschweigend verworfen — der Kanal
-- haette eine Zustellspur, die genau dann leer bleibt, wenn sie
-- gebraucht wird.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'notification_delivery_log'
  ) THEN
    ALTER TABLE public.notification_delivery_log
      DROP CONSTRAINT IF EXISTS notification_delivery_log_provider_check;
    ALTER TABLE public.notification_delivery_log
      ADD CONSTRAINT notification_delivery_log_provider_check
      CHECK (provider IS NULL OR provider IN
        ('resend', 'web_push', 'supabase', 'whatsapp_api', 'fcm'));
  END IF;
END $$;

COMMIT;

-- ════════════════════════════════════════════════════════════════════
-- VERIFIKATION (nach Apply):
--   select count(*) from fcm_tokens where organization_id is null;   -- 0
--   select indexname from pg_indexes
--    where tablename='fcm_tokens' and indexname='fcm_tokens_user_token_uniq';
--   select policyname, permissive from pg_policies
--    where tablename in ('fcm_tokens','notification_preferences');
--   insert into notification_delivery_log (organization_id, channel,
--     recipient, status, provider)
--   values ('00000000-0000-4000-8000-000460629986','push','x','sent','fcm');
--                                                     -- muss durchgehen
-- ════════════════════════════════════════════════════════════════════
