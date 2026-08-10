-- ═══════════════════════════════════════════════════════════════
-- Digitale Signaturen — Dokument-Hashing, Signatur-Hashing,
-- Audit Trail, QES-Hook-Vorbereitung
-- ═══════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Signatur-Dokumente ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.signatur_dokumente (
  id                    uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id       uuid NOT NULL REFERENCES public.organizations(id),
  dokument_typ          text NOT NULL CHECK (dokument_typ IN (
    'leistungsnachweis','vertrag','pflegebericht',
    'protokoll','einwilligung','sonstiges'
  )),
  titel                 text NOT NULL,
  beschreibung          text,
  referenz_tabelle      text,
  referenz_id           uuid,
  dokument_hash_sha256  text NOT NULL CHECK (dokument_hash_sha256 ~ '^[a-f0-9]{64}$'),
  dokument_inhalt_snapshot text,
  erstellt_von          uuid NOT NULL REFERENCES auth.users(id),
  version               integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sig_dok_org ON public.signatur_dokumente(organization_id);
CREATE INDEX IF NOT EXISTS idx_sig_dok_typ ON public.signatur_dokumente(dokument_typ);
CREATE INDEX IF NOT EXISTS idx_sig_dok_ref ON public.signatur_dokumente(referenz_tabelle, referenz_id)
  WHERE referenz_tabelle IS NOT NULL;

-- ── 2. Signaturen ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.signaturen (
  id                    uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id       uuid NOT NULL REFERENCES public.organizations(id),
  dokument_id           uuid NOT NULL REFERENCES public.signatur_dokumente(id) ON DELETE CASCADE,
  signatar_id           uuid NOT NULL REFERENCES auth.users(id),
  signatar_name         text NOT NULL,
  signatar_rolle        text,
  status                text NOT NULL DEFAULT 'offen' CHECK (status IN ('offen','signiert','abgelehnt')),
  methode               text CHECK (methode IS NULL OR methode IN ('signaturepad','pin','checkbox','qes_extern')),
  signatur_hash_sha256  text CHECK (signatur_hash_sha256 IS NULL OR signatur_hash_sha256 ~ '^[a-f0-9]{64}$'),
  signatur_daten        text,
  signiert_am           timestamptz,
  abgelehnt_am          timestamptz,
  ablehnung_grund       text,
  ip_adresse            inet,
  user_agent            text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT signiert_hat_hash CHECK (
    status != 'signiert' OR signatur_hash_sha256 IS NOT NULL
  ),
  CONSTRAINT signiert_hat_zeitstempel CHECK (
    status != 'signiert' OR signiert_am IS NOT NULL
  ),
  CONSTRAINT abgelehnt_hat_grund CHECK (
    status != 'abgelehnt' OR ablehnung_grund IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_signaturen_org ON public.signaturen(organization_id);
CREATE INDEX IF NOT EXISTS idx_signaturen_dok ON public.signaturen(dokument_id);
CREATE INDEX IF NOT EXISTS idx_signaturen_signatar ON public.signaturen(signatar_id);
CREATE INDEX IF NOT EXISTS idx_signaturen_status ON public.signaturen(status);

-- ── 3. Signatur-Audit-Log ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.signatur_audit_log (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id   uuid NOT NULL REFERENCES public.organizations(id),
  dokument_id       uuid REFERENCES public.signatur_dokumente(id) ON DELETE SET NULL,
  signatur_id       uuid REFERENCES public.signaturen(id) ON DELETE SET NULL,
  aktion            text NOT NULL CHECK (aktion IN (
    'signatur_angefordert','signatur_geleistet','signatur_abgelehnt',
    'dokument_erstellt','hash_verifiziert','hash_ungueltig',
    'signatur_widerrufen'
  )),
  akteur_id         uuid NOT NULL REFERENCES auth.users(id),
  akteur_name       text,
  details           jsonb,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sig_audit_org ON public.signatur_audit_log(organization_id);
CREATE INDEX IF NOT EXISTS idx_sig_audit_dok ON public.signatur_audit_log(dokument_id);
CREATE INDEX IF NOT EXISTS idx_sig_audit_sig ON public.signatur_audit_log(signatur_id);
CREATE INDEX IF NOT EXISTS idx_sig_audit_created ON public.signatur_audit_log(created_at DESC);

-- ── 4. QES-Hooks (externe Provider-Integration) ────────────────

CREATE TABLE IF NOT EXISTS public.qes_hooks (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id   uuid NOT NULL REFERENCES public.organizations(id),
  provider          text NOT NULL,
  endpoint_url      text NOT NULL,
  api_key_ref       text,
  aktiv             boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_qes_hooks_org ON public.qes_hooks(organization_id);

-- ── 5. RLS ─────────────────────────────────────────────────────

ALTER TABLE public.signatur_dokumente ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signaturen ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signatur_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qes_hooks ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  -- Org-Fence (RESTRICTIVE)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'signatur_dokumente' AND policyname = 'org_fence_sig_dokumente') THEN
    CREATE POLICY org_fence_sig_dokumente ON signatur_dokumente AS RESTRICTIVE FOR ALL
      USING (organization_id = current_org_id());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'signaturen' AND policyname = 'org_fence_signaturen') THEN
    CREATE POLICY org_fence_signaturen ON signaturen AS RESTRICTIVE FOR ALL
      USING (organization_id = current_org_id());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'signatur_audit_log' AND policyname = 'org_fence_sig_audit') THEN
    CREATE POLICY org_fence_sig_audit ON signatur_audit_log AS RESTRICTIVE FOR ALL
      USING (organization_id = current_org_id());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'qes_hooks' AND policyname = 'org_fence_qes_hooks') THEN
    CREATE POLICY org_fence_qes_hooks ON qes_hooks AS RESTRICTIVE FOR ALL
      USING (organization_id = current_org_id());
  END IF;

  -- Admin: Vollzugriff
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'signatur_dokumente' AND policyname = 'admin_sig_dok_all') THEN
    CREATE POLICY admin_sig_dok_all ON signatur_dokumente FOR ALL
      USING (is_admin());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'signaturen' AND policyname = 'admin_signaturen_all') THEN
    CREATE POLICY admin_signaturen_all ON signaturen FOR ALL
      USING (is_admin());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'signatur_audit_log' AND policyname = 'admin_sig_audit_all') THEN
    CREATE POLICY admin_sig_audit_all ON signatur_audit_log FOR ALL
      USING (is_admin());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'qes_hooks' AND policyname = 'admin_qes_hooks_all') THEN
    CREATE POLICY admin_qes_hooks_all ON qes_hooks FOR ALL
      USING (is_admin());
  END IF;

  -- Signatare: Eigene offene Signaturen sehen + signieren/ablehnen
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'signaturen' AND policyname = 'signatar_eigene_select') THEN
    CREATE POLICY signatar_eigene_select ON signaturen FOR SELECT
      USING (signatar_id = auth.uid());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'signaturen' AND policyname = 'signatar_eigene_update') THEN
    CREATE POLICY signatar_eigene_update ON signaturen FOR UPDATE
      USING (signatar_id = auth.uid() AND status = 'offen')
      WITH CHECK (signatar_id = auth.uid());
  END IF;

  -- Signatare: Zugehörige Dokumente lesen
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'signatur_dokumente' AND policyname = 'signatar_dok_select') THEN
    CREATE POLICY signatar_dok_select ON signatur_dokumente FOR SELECT
      USING (id IN (
        SELECT dokument_id FROM signaturen WHERE signatar_id = auth.uid()
      ));
  END IF;

END $$;

COMMIT;
