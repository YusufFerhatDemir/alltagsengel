-- ═══════════════════════════════════════════════════════════════
-- Angehörigenzugang — dediziertes Portal für Angehörige
-- Zugänge, Nachrichten, Audit-Log, Benachrichtigungen
-- ═══════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Angehörigen-Zugänge ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.angehoerigen_zugaenge (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id   uuid NOT NULL REFERENCES public.organizations(id),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id         uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  rolle             text NOT NULL CHECK (rolle IN ('angehoeriger','betreuer','bevollmaechtigter')),
  status            text NOT NULL DEFAULT 'aktiv' CHECK (status IN ('aktiv','widerrufen','abgelaufen')),
  freigegebene_bereiche text[] NOT NULL DEFAULT '{}',
  pflegeberichte_freigegeben boolean NOT NULL DEFAULT false,
  erteilt_von       uuid REFERENCES auth.users(id),
  erteilt_am        timestamptz NOT NULL DEFAULT now(),
  widerrufen_von    uuid REFERENCES auth.users(id),
  widerrufen_am     timestamptz,
  widerruf_grund    text,
  gueltig_bis       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bereiche_nicht_leer CHECK (array_length(freigegebene_bereiche, 1) > 0),
  CONSTRAINT unique_user_client UNIQUE (user_id, client_id)
);

CREATE INDEX IF NOT EXISTS idx_angeh_zugaenge_org ON public.angehoerigen_zugaenge(organization_id);
CREATE INDEX IF NOT EXISTS idx_angeh_zugaenge_client ON public.angehoerigen_zugaenge(client_id);
CREATE INDEX IF NOT EXISTS idx_angeh_zugaenge_user ON public.angehoerigen_zugaenge(user_id);
CREATE INDEX IF NOT EXISTS idx_angeh_zugaenge_status ON public.angehoerigen_zugaenge(status) WHERE status = 'aktiv';

-- ── 2. Nachrichten ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.angehoerigen_nachrichten (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id   uuid NOT NULL REFERENCES public.organizations(id),
  zugang_id         uuid NOT NULL REFERENCES public.angehoerigen_zugaenge(id) ON DELETE CASCADE,
  client_id         uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  absender_id       uuid NOT NULL REFERENCES auth.users(id),
  absender_typ      text NOT NULL CHECK (absender_typ IN ('angehoeriger','pflegedienst')),
  betreff           text NOT NULL,
  inhalt            text NOT NULL,
  status            text NOT NULL DEFAULT 'gesendet' CHECK (status IN ('gesendet','gelesen')),
  gelesen_am        timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_angeh_nachr_org ON public.angehoerigen_nachrichten(organization_id);
CREATE INDEX IF NOT EXISTS idx_angeh_nachr_zugang ON public.angehoerigen_nachrichten(zugang_id);
CREATE INDEX IF NOT EXISTS idx_angeh_nachr_client ON public.angehoerigen_nachrichten(client_id);

-- ── 3. Audit-Log ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.angehoerigen_audit_log (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id   uuid NOT NULL REFERENCES public.organizations(id),
  zugang_id         uuid NOT NULL REFERENCES public.angehoerigen_zugaenge(id) ON DELETE CASCADE,
  user_id           uuid NOT NULL REFERENCES auth.users(id),
  client_id         uuid NOT NULL REFERENCES public.clients(id),
  aktion            text NOT NULL CHECK (aktion IN (
    'login','logout',
    'termine_eingesehen','leistungen_eingesehen',
    'pflegebericht_eingesehen','dokument_eingesehen',
    'dokument_heruntergeladen',
    'nachricht_gesendet','nachricht_gelesen',
    'profil_aktualisiert',
    'zugang_erteilt','zugang_widerrufen',
    'freigabe_geaendert'
  )),
  details           jsonb,
  ip_adresse        inet,
  user_agent        text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_angeh_audit_org ON public.angehoerigen_audit_log(organization_id);
CREATE INDEX IF NOT EXISTS idx_angeh_audit_zugang ON public.angehoerigen_audit_log(zugang_id);
CREATE INDEX IF NOT EXISTS idx_angeh_audit_user ON public.angehoerigen_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_angeh_audit_aktion ON public.angehoerigen_audit_log(aktion);
CREATE INDEX IF NOT EXISTS idx_angeh_audit_created ON public.angehoerigen_audit_log(created_at DESC);

-- ── 4. Benachrichtigungen ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.angehoerigen_benachrichtigungen (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id   uuid NOT NULL REFERENCES public.organizations(id),
  zugang_id         uuid NOT NULL REFERENCES public.angehoerigen_zugaenge(id) ON DELETE CASCADE,
  typ               text NOT NULL CHECK (typ IN ('push','email')),
  betreff           text NOT NULL,
  inhalt            text NOT NULL,
  gesendet_am       timestamptz,
  gelesen_am        timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_angeh_benachr_org ON public.angehoerigen_benachrichtigungen(organization_id);
CREATE INDEX IF NOT EXISTS idx_angeh_benachr_zugang ON public.angehoerigen_benachrichtigungen(zugang_id);

-- ── 5. RLS ─────────────────────────────────────────────────────

ALTER TABLE public.angehoerigen_zugaenge ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.angehoerigen_nachrichten ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.angehoerigen_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.angehoerigen_benachrichtigungen ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  -- Org-Fence (RESTRICTIVE)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'angehoerigen_zugaenge' AND policyname = 'org_fence_angeh_zugaenge') THEN
    CREATE POLICY org_fence_angeh_zugaenge ON angehoerigen_zugaenge AS RESTRICTIVE FOR ALL
      USING (organization_id = current_org_id());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'angehoerigen_nachrichten' AND policyname = 'org_fence_angeh_nachrichten') THEN
    CREATE POLICY org_fence_angeh_nachrichten ON angehoerigen_nachrichten AS RESTRICTIVE FOR ALL
      USING (organization_id = current_org_id());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'angehoerigen_audit_log' AND policyname = 'org_fence_angeh_audit') THEN
    CREATE POLICY org_fence_angeh_audit ON angehoerigen_audit_log AS RESTRICTIVE FOR ALL
      USING (organization_id = current_org_id());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'angehoerigen_benachrichtigungen' AND policyname = 'org_fence_angeh_benachr') THEN
    CREATE POLICY org_fence_angeh_benachr ON angehoerigen_benachrichtigungen AS RESTRICTIVE FOR ALL
      USING (organization_id = current_org_id());
  END IF;

  -- Admin: Vollzugriff
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'angehoerigen_zugaenge' AND policyname = 'admin_angeh_zugaenge_all') THEN
    CREATE POLICY admin_angeh_zugaenge_all ON angehoerigen_zugaenge FOR ALL
      USING (is_admin());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'angehoerigen_nachrichten' AND policyname = 'admin_angeh_nachr_all') THEN
    CREATE POLICY admin_angeh_nachr_all ON angehoerigen_nachrichten FOR ALL
      USING (is_admin());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'angehoerigen_audit_log' AND policyname = 'admin_angeh_audit_all') THEN
    CREATE POLICY admin_angeh_audit_all ON angehoerigen_audit_log FOR ALL
      USING (is_admin());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'angehoerigen_benachrichtigungen' AND policyname = 'admin_angeh_benachr_all') THEN
    CREATE POLICY admin_angeh_benachr_all ON angehoerigen_benachrichtigungen FOR ALL
      USING (is_admin());
  END IF;

  -- Angehörige: Eigene Daten lesen + Nachrichten senden
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'angehoerigen_zugaenge' AND policyname = 'angeh_eigene_zugaenge_select') THEN
    CREATE POLICY angeh_eigene_zugaenge_select ON angehoerigen_zugaenge FOR SELECT
      USING (user_id = auth.uid() AND status = 'aktiv');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'angehoerigen_nachrichten' AND policyname = 'angeh_eigene_nachr_select') THEN
    CREATE POLICY angeh_eigene_nachr_select ON angehoerigen_nachrichten FOR SELECT
      USING (zugang_id IN (
        SELECT id FROM angehoerigen_zugaenge WHERE user_id = auth.uid() AND status = 'aktiv'
      ));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'angehoerigen_nachrichten' AND policyname = 'angeh_nachr_insert') THEN
    CREATE POLICY angeh_nachr_insert ON angehoerigen_nachrichten FOR INSERT
      WITH CHECK (
        absender_id = auth.uid()
        AND absender_typ = 'angehoeriger'
        AND zugang_id IN (
          SELECT id FROM angehoerigen_zugaenge WHERE user_id = auth.uid() AND status = 'aktiv'
        )
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'angehoerigen_benachrichtigungen' AND policyname = 'angeh_eigene_benachr_select') THEN
    CREATE POLICY angeh_eigene_benachr_select ON angehoerigen_benachrichtigungen FOR SELECT
      USING (zugang_id IN (
        SELECT id FROM angehoerigen_zugaenge WHERE user_id = auth.uid() AND status = 'aktiv'
      ));
  END IF;

  -- Audit-Log: Nur Admin lesen (oben bereits via admin_angeh_audit_all)
  -- Angehörige haben KEINEN Zugriff auf den Audit-Log

END $$;

COMMIT;
