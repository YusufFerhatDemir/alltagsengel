-- ═══════════════════════════════════════════════════════════════════════
-- E-Mail-Entwürfe  (P5 / P6)
-- ═══════════════════════════════════════════════════════════════════════
--
-- WOZU
-- Die Vorgabe lautet: KEINE automatisch versendeten E-Mails. Auslöser wie
-- „Wartelisten-Eintrag" oder „Bewerbung eingegangen" dürfen also nicht
-- senden — sie sollen aber auch nicht folgenlos verpuffen, sonst muss die
-- Verwaltung jeden Vorgang von Hand suchen.
--
-- Diese Tabelle ist der Zwischenschritt: Der Auslöser legt einen ENTWURF
-- an, die Verwaltung sieht ihn in der Liste und entscheidet. Erst der Klauf
-- auf „Senden" erzeugt eine echte Mail.
--
-- ── WARUM NICHT `notification_delivery_log` ───────────────────────────
-- Die Zustellspur beantwortet „ist es rausgegangen und angekommen?". Ein
-- Entwurf ist das Gegenteil: er ist ausdrücklich NICHT rausgegangen. Beides
-- in eine Tabelle zu legen hieße, jede Auswertung der Zustellspur um
-- „…außer den Zeilen, die gar keine Zustellung sind" zu ergänzen — und
-- genau das vergisst irgendwann jemand.
--
-- ── RECHTE ────────────────────────────────────────────────────────────
-- Kein anon-Recht. Geschrieben wird ausschließlich mit dem
-- Dienstschlüssel (aus /api/waitlist und /api/apply), gelesen und
-- geändert von der Verwaltung über is_admin() — dieselbe Grenze wie bei
-- `lead_inquiries` und `waitlist_customers`.
--
-- Rollback: 20261101000001_rollback_email_entwuerfe.sql
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS public.email_entwuerfe (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL DEFAULT public.current_org_id(),

  -- Vorlagen-Kennung aus lib/email/templates.ts. Bewusst KEIN Fremdschlüssel
  -- und kein CHECK: der Katalog lebt im Code und ändert sich dort. Ein
  -- CHECK hier hieße, dass eine neue Vorlage eine Migration braucht.
  vorlage_id        text NOT NULL,

  -- Wer die Mail bekommen soll.
  empfaenger_email  text,
  empfaenger_name   text,

  -- Woher der Entwurf stammt: 'waitlist_customers' | 'lead_inquiries' | 'manuell'.
  -- Zusammen mit bezug_id die Rückverbindung zum Vorgang.
  bezug_tabelle     text,
  bezug_id          uuid,

  -- Die eingesetzten Werte (Vorname, Termin, …) — als jsonb, weil sie je
  -- Vorlage anders heißen.
  werte             jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Betreff und Rumpf zum Zeitpunkt der Erzeugung. Eingefroren, nicht
  -- nachgerechnet: ändert sich die Vorlage im Code, darf sich ein bereits
  -- geprüfter Entwurf nicht mitändern.
  betreff           text NOT NULL,
  rumpf_html        text NOT NULL,

  status            text NOT NULL DEFAULT 'entwurf',

  -- Belege des Versands. `provider_id` ist die Resend-Kennung; ohne sie
  -- gilt ein Versand nicht als bewiesen.
  gesendet_am       timestamptz,
  gesendet_von      uuid,
  provider_id       text,
  fehler            text,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'email_entwuerfe_status_check') THEN
    ALTER TABLE public.email_entwuerfe
      ADD CONSTRAINT email_entwuerfe_status_check
      CHECK (status IN ('entwurf', 'gesendet', 'fehlgeschlagen', 'verworfen'));
  END IF;

  -- Ein Entwurf ohne Empfängeradresse ist nicht sendbar. Er darf trotzdem
  -- entstehen (das Website-Formular fragt bei Bewerbungen keine E-Mail ab),
  -- deshalb NULL erlaubt — aber ein Versand ohne Adresse wird verhindert.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'email_entwuerfe_versand_check') THEN
    ALTER TABLE public.email_entwuerfe
      ADD CONSTRAINT email_entwuerfe_versand_check
      CHECK (
        status <> 'gesendet'
        OR (empfaenger_email IS NOT NULL AND gesendet_am IS NOT NULL AND provider_id IS NOT NULL)
      );
  END IF;
END;
$$;

-- Genau EIN automatischer Entwurf je Vorgang und Vorlage. Ein zweiter
-- Formularabsendevorgang oder ein wiederholter Request erzeugte sonst
-- zwei identische Entwürfe — und die Verwaltung schriebe zweimal.
CREATE UNIQUE INDEX IF NOT EXISTS uq_email_entwuerfe_bezug
  ON public.email_entwuerfe (bezug_tabelle, bezug_id, vorlage_id)
  WHERE bezug_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_email_entwuerfe_offen
  ON public.email_entwuerfe (organization_id, created_at DESC)
  WHERE status = 'entwurf';

CREATE OR REPLACE FUNCTION public.tg_email_entwuerfe_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_email_entwuerfe_updated_at ON public.email_entwuerfe;
CREATE TRIGGER trg_email_entwuerfe_updated_at
  BEFORE UPDATE ON public.email_entwuerfe
  FOR EACH ROW EXECUTE FUNCTION public.tg_email_entwuerfe_updated_at();

ALTER TABLE public.email_entwuerfe ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.email_entwuerfe FROM PUBLIC;
REVOKE ALL ON public.email_entwuerfe FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.email_entwuerfe TO authenticated;

DROP POLICY IF EXISTS "Admin full access email_entwuerfe" ON public.email_entwuerfe;
CREATE POLICY "Admin full access email_entwuerfe"
  ON public.email_entwuerfe FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

COMMENT ON TABLE public.email_entwuerfe IS
  'Vorbereitete, NICHT versendete E-Mails. Auslöser legen hier ab statt zu '
  'senden; der Versand erfolgt ausschließlich über den Knopf in der '
  'Verwaltung (POST /api/email/send, modus=senden).';

COMMENT ON COLUMN public.email_entwuerfe.rumpf_html IS
  'Eingefroren zum Zeitpunkt der Erzeugung — eine spätere Änderung der '
  'Vorlage im Code darf einen geprüften Entwurf nicht verändern.';

COMMIT;
