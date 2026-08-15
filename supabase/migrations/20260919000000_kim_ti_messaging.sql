-- ═══════════════════════════════════════════════════════════════
-- KIM (Kommunikation im Medizinwesen) — Fachlogik + Provider-Abstraktion
--
-- Baut die komplette Datenbasis für den sicheren TI-Kommunikationskanal
-- (Ärzte, Kassen, Leistungserbringer). Der echte TI-Konnektor ist extern
-- und wird über lib/kim/provider-factory.ts angebunden — dieses Schema
-- kennt nur "Nachrichten", nicht wie sie technisch zugestellt werden.
--
-- Verhältnis zu Block 18 (20260830010000_kim_ti_geruest.sql):
--   kim_konfiguration/kim_formatversionen/kim_karten bleiben unverändert
--   bestehen (Postfach-/Karten-Verwaltung + TA5-Fail-Closed-Gate). Dieses
--   Schema hier ist die operative Nachrichtenschicht darüber. kim_nachrichten
--   (die alte Warteschlange mit Status entwurf/wartend/gesperrt, NIE
--   versendet) wird durch kim_messages fachlich abgelöst, bleibt aber
--   unangetastet stehen (kein DROP ohne Rücksprache — sie ist leer, da nie
--   produktiv genutzt). lib/kim/provider-factory.ts respektiert weiterhin
--   das TA5-Gate: ein echter Provider (kim_plus/kim_basis) wird nur
--   konstruiert, wenn kim_formatversionen.spec_bestaetigt = true vorliegt —
--   bis dahin wirft die Factory für diese Typen ausnahmslos.
-- ═══════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. kim_addresses — Adressbuch ────────────────────────────────

CREATE TABLE IF NOT EXISTS public.kim_addresses (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT current_org_id() REFERENCES public.organizations(id),
  kim_address     text NOT NULL,
  display_name    text NOT NULL,
  address_type    text NOT NULL DEFAULT 'sonstig'
                  CHECK (address_type IN ('arzt', 'kasse', 'leistungserbringer', 'sonstig')),
  lanr            text,
  bsnr            text,
  ik_nummer       text,
  is_active       boolean NOT NULL DEFAULT true,
  verified_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kim_addresses_format CHECK (kim_address ~ '^[^@]+@[^@]+\.[^@]+$'),
  CONSTRAINT kim_addresses_unique UNIQUE (organization_id, kim_address)
);

CREATE INDEX IF NOT EXISTS idx_kim_addresses_org ON public.kim_addresses(organization_id);
CREATE INDEX IF NOT EXISTS idx_kim_addresses_type ON public.kim_addresses(address_type) WHERE is_active;

-- ── 2. kim_provider_config — pro Org ein aktiver Provider ────────

CREATE TABLE IF NOT EXISTS public.kim_provider_config (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT current_org_id() REFERENCES public.organizations(id),
  provider_type   text NOT NULL DEFAULT 'mock'
                  CHECK (provider_type IN ('mock', 'test', 'kim_plus', 'kim_basis')),
  -- Optionaler Bezug zum tatsächlichen Postfach aus Block 18 (nur bei
  -- kim_plus/kim_basis sinnvoll befüllt).
  konfiguration_id uuid REFERENCES public.kim_konfiguration(id),
  config          jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kim_provider_config_unique UNIQUE (organization_id, provider_type)
);

CREATE INDEX IF NOT EXISTS idx_kim_provider_config_org ON public.kim_provider_config(organization_id) WHERE is_active;

-- ── 3. kim_messages — Kernentität ─────────────────────────────────

CREATE TABLE IF NOT EXISTS public.kim_messages (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL DEFAULT current_org_id() REFERENCES public.organizations(id),
  direction           text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  kim_address_from    text NOT NULL,
  kim_address_to      text NOT NULL,
  subject             text NOT NULL,
  body_text           text,
  body_html           text,
  status              text NOT NULL DEFAULT 'entwurf'
                      CHECK (status IN ('entwurf', 'wartend', 'gesendet', 'zugestellt', 'gelesen', 'fehler', 'storniert')),
  priority            text NOT NULL DEFAULT 'normal' CHECK (priority IN ('niedrig', 'normal', 'hoch')),
  message_type        text NOT NULL DEFAULT 'sonstig'
                      CHECK (message_type IN ('arztbrief', 'verordnung', 'befund', 'abrechnung', 'sonstig')),
  related_client_id    uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  related_caregiver_id uuid REFERENCES public.caregivers(id) ON DELETE SET NULL,
  sent_at             timestamptz,
  delivered_at        timestamptz,
  read_at             timestamptz,
  error_details       text,
  retry_count         integer NOT NULL DEFAULT 0,
  max_retries         integer NOT NULL DEFAULT 5,
  next_retry_at       timestamptz,
  metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,
  provider_message_id text,
  created_by          uuid REFERENCES auth.users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kim_messages_betreff CHECK (char_length(subject) > 0),
  CONSTRAINT kim_messages_retry_bounds CHECK (retry_count >= 0 AND retry_count <= max_retries + 1)
);

CREATE INDEX IF NOT EXISTS idx_kim_messages_org        ON public.kim_messages(organization_id);
CREATE INDEX IF NOT EXISTS idx_kim_messages_status      ON public.kim_messages(status);
CREATE INDEX IF NOT EXISTS idx_kim_messages_direction   ON public.kim_messages(organization_id, direction, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_kim_messages_client      ON public.kim_messages(related_client_id) WHERE related_client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_kim_messages_caregiver   ON public.kim_messages(related_caregiver_id) WHERE related_caregiver_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_kim_messages_retry_queue ON public.kim_messages(next_retry_at) WHERE status = 'fehler' AND next_retry_at IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_kim_messages_provider_dedup
  ON public.kim_messages(organization_id, provider_message_id) WHERE provider_message_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.kim_messages_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_kim_messages_updated_at ON public.kim_messages;
CREATE TRIGGER trg_kim_messages_updated_at
  BEFORE UPDATE ON public.kim_messages
  FOR EACH ROW EXECUTE FUNCTION public.kim_messages_set_updated_at();

-- ── 4. kim_attachments ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.kim_attachments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id      uuid NOT NULL REFERENCES public.kim_messages(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL DEFAULT current_org_id() REFERENCES public.organizations(id),
  filename        text NOT NULL,
  mime_type       text NOT NULL,
  size_bytes      bigint NOT NULL CHECK (size_bytes > 0),
  storage_path    text NOT NULL,
  checksum_sha256 text NOT NULL CHECK (checksum_sha256 ~ '^[a-f0-9]{64}$'),
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kim_attachments_path_unique UNIQUE (storage_path)
);

CREATE INDEX IF NOT EXISTS idx_kim_attachments_message ON public.kim_attachments(message_id);
CREATE INDEX IF NOT EXISTS idx_kim_attachments_org      ON public.kim_attachments(organization_id);

-- ── 4b. kim_audit_log — DSGVO-Protokoll aller Aktionen ────────────
-- Eigene Tabelle statt Wiederverwendung von mis_audit_log, analog
-- personal_audit_log — hält die Aktionsliste modul-eigen erweiterbar.

CREATE TABLE IF NOT EXISTS public.kim_audit_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT current_org_id() REFERENCES public.organizations(id),
  message_id      uuid REFERENCES public.kim_messages(id) ON DELETE SET NULL,
  aktion          text NOT NULL
                  CHECK (aktion IN (
                    'erstellt', 'bearbeitet', 'gesendet', 'sendefehler',
                    'zugestellt', 'gelesen', 'storniert', 'wiederholt',
                    'empfangen', 'anhang_hochgeladen', 'anhang_heruntergeladen',
                    'adresse_angelegt', 'adresse_geaendert', 'adresse_verifiziert',
                    'provider_konfiguriert'
                  )),
  actor_id        uuid REFERENCES auth.users(id),
  details         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kim_audit_log_org     ON public.kim_audit_log(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_kim_audit_log_message ON public.kim_audit_log(message_id) WHERE message_id IS NOT NULL;

ALTER TABLE public.kim_audit_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'kim_audit_log' AND policyname = 'org_fence_kim_audit_log') THEN
    CREATE POLICY org_fence_kim_audit_log ON public.kim_audit_log AS RESTRICTIVE FOR ALL
      USING (organization_id = current_org_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'kim_audit_log' AND policyname = 'admin_kim_audit_log_all') THEN
    CREATE POLICY admin_kim_audit_log_all ON public.kim_audit_log FOR ALL USING (is_admin());
  END IF;
END $$;

-- ── 5. RLS ──────────────────────────────────────────────────────

ALTER TABLE public.kim_addresses       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kim_provider_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kim_messages        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kim_attachments     ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  -- Org-Fence (RESTRICTIVE) — auf allen vier Tabellen
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'kim_addresses' AND policyname = 'org_fence_kim_addresses') THEN
    CREATE POLICY org_fence_kim_addresses ON public.kim_addresses AS RESTRICTIVE FOR ALL
      USING (organization_id = current_org_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'kim_provider_config' AND policyname = 'org_fence_kim_provider_config') THEN
    CREATE POLICY org_fence_kim_provider_config ON public.kim_provider_config AS RESTRICTIVE FOR ALL
      USING (organization_id = current_org_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'kim_messages' AND policyname = 'org_fence_kim_messages') THEN
    CREATE POLICY org_fence_kim_messages ON public.kim_messages AS RESTRICTIVE FOR ALL
      USING (organization_id = current_org_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'kim_attachments' AND policyname = 'org_fence_kim_attachments') THEN
    CREATE POLICY org_fence_kim_attachments ON public.kim_attachments AS RESTRICTIVE FOR ALL
      USING (organization_id = current_org_id());
  END IF;

  -- Admin: Vollzugriff
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'kim_addresses' AND policyname = 'admin_kim_addresses_all') THEN
    CREATE POLICY admin_kim_addresses_all ON public.kim_addresses FOR ALL USING (is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'kim_provider_config' AND policyname = 'admin_kim_provider_config_all') THEN
    CREATE POLICY admin_kim_provider_config_all ON public.kim_provider_config FOR ALL USING (is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'kim_messages' AND policyname = 'admin_kim_messages_all') THEN
    CREATE POLICY admin_kim_messages_all ON public.kim_messages FOR ALL USING (is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'kim_attachments' AND policyname = 'admin_kim_attachments_all') THEN
    CREATE POLICY admin_kim_attachments_all ON public.kim_attachments FOR ALL USING (is_admin());
  END IF;

  -- Engel: nur eigene zugeordnete Nachrichten lesen (eigener Klient ODER
  -- Nachricht ist ihnen selbst als Betreuungskraft zugeordnet)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'kim_messages' AND policyname = 'engel_kim_messages_select') THEN
    CREATE POLICY engel_kim_messages_select ON public.kim_messages FOR SELECT
      USING (
        (related_client_id IS NOT NULL AND public.engel_hat_aktiven_klienten(related_client_id))
        OR related_caregiver_id IN (SELECT public.eigene_caregiver_ids())
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'kim_attachments' AND policyname = 'engel_kim_attachments_select') THEN
    CREATE POLICY engel_kim_attachments_select ON public.kim_attachments FOR SELECT
      USING (EXISTS (
        SELECT 1 FROM public.kim_messages m
        WHERE m.id = message_id
          AND (
            (m.related_client_id IS NOT NULL AND public.engel_hat_aktiven_klienten(m.related_client_id))
            OR m.related_caregiver_id IN (SELECT public.eigene_caregiver_ids())
          )
      ));
  END IF;
END $$;

-- ── 6. Storage-Bucket kim-attachments (PRIVATE) ──────────────────
-- Analog wound-photos: kein direkter Client-Zugriff, nur service_role
-- + kurzlebige Signed URLs über lib/kim/attachment-service.ts.

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('kim-attachments', 'kim-attachments', false, 26214400)
ON CONFLICT (id) DO NOTHING;

COMMIT;
