-- ═══════════════════════════════════════════════════════════════════════
-- Benachrichtigungen: Zustellspur (notification_delivery_log)
-- ═══════════════════════════════════════════════════════════════════════
--
-- AUSGANGSLAGE
-- Das Benachrichtigungssystem (lib/notifications.ts) hat vier Kanaele —
-- E-Mail (Resend), Web-Push, In-App und WhatsApp. Bis hierhin war von
-- aussen NICHT feststellbar, ob eine Nachricht das Haus verlassen hat:
--
--   * sendEmailNotification() gab bei jedem Fehler `false` zurueck und
--     loggte nur in die Konsole — nach dem Request ist das weg.
--   * createNotification() setzte eine Zeile in `notifications`; ob der
--     Empfaenger sie je gesehen hat, stand nirgends.
--   * sendWhatsAppMessage() lieferte `{ ok:false, error }` an den
--     Aufrufer und war damit nach dem Webhook-Request vergessen.
--
-- Fuer den Rechnungsversand existiert seit 20260823000000 mit
-- invoice_email_log genau so ein Protokoll. Diese Tabelle ist das
-- Gegenstueck fuer ALLE Benachrichtigungskanaele — bewusst als eigene
-- Tabelle und nicht als Erweiterung von invoice_email_log: dort haengt
-- jede Zeile per NOT NULL an einer Rechnung.
--
-- ABGRENZUNG
-- Diese Tabelle ist ein PROTOKOLL, kein Zustand. Der fachliche Zustand
-- bleibt, wo er ist (notifications.email_sent, invoices.sent_at). Faellt
-- das Protokoll aus, funktioniert der Versand weiter; es fehlt dann nur
-- die Historie. Aufrufer duerfen deshalb NIE einen Versand abbrechen,
-- weil das Protokoll nicht schreibbar war.
--
-- IDEMPOTENZ
-- Der Retry-Weg (lib/notifications/retry.ts) entscheidet ueber
-- (correlation_id, channel): existiert dort schon eine Zeile mit
-- status 'sent' oder 'delivered', wird NICHT erneut versendet. Der
-- Partial-Unique-Index unten macht das auch bei parallelen Laeufen dicht
-- — zwei gleichzeitige Versender koennen nicht beide eine Erfolgszeile
-- fuer denselben Geschaeftsvorfall schreiben.
--
-- KEINE GEHEIMNISSE IM FEHLERTEXT
-- sanitized_error nimmt ausschliesslich den durch
-- lib/notifications/delivery-log.ts sanitisierten Text auf (Tokens,
-- Schluessel, E-Mail-Adressen und Telefonnummern werden dort ersetzt).
-- Der Spaltenname ist Absicht: er soll beim Lesen des Codes daran
-- erinnern.
--
-- Rollback: 20260923000001_rollback_notification_delivery_log.sql
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1) Tabelle ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notification_delivery_log (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES public.organizations(id),
  notification_id     uuid,
  channel             text NOT NULL
    CHECK (channel IN ('email', 'push', 'in_app', 'whatsapp')),
  recipient           text NOT NULL,
  status              text NOT NULL
    CHECK (status IN ('queued', 'sent', 'delivered', 'failed', 'skipped')),
  attempt_count       integer NOT NULL DEFAULT 1 CHECK (attempt_count >= 1),
  provider            text
    CHECK (provider IS NULL OR provider IN ('resend', 'web_push', 'supabase', 'whatsapp_api')),
  provider_message_id text,
  sanitized_error     text,
  correlation_id      uuid,
  queued_at           timestamptz,
  attempted_at        timestamptz,
  delivered_at        timestamptz,
  failed_at           timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- notification_id verweist auf public.notifications, sofern die Tabelle
-- existiert. Sie ist Teil des Baselines, wird hier aber defensiv geprueft,
-- damit die Migration auf einer Shadow-DB ohne dieses Modul nicht bricht.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'notifications'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'notification_delivery_log_notification_id_fkey'
  ) THEN
    ALTER TABLE public.notification_delivery_log
      ADD CONSTRAINT notification_delivery_log_notification_id_fkey
      FOREIGN KEY (notification_id) REFERENCES public.notifications(id)
      ON DELETE SET NULL;
  END IF;
END;
$$;

-- ── 2) Indizes ──────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_notification_delivery_log_org
  ON public.notification_delivery_log(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_delivery_log_correlation
  ON public.notification_delivery_log(correlation_id, channel)
  WHERE correlation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notification_delivery_log_notification
  ON public.notification_delivery_log(notification_id)
  WHERE notification_id IS NOT NULL;

-- Offene Faelle: alles ausser den Endzustaenden. Genau darueber laeuft
-- der Wiederholungslauf, deshalb ein eigener Teilindex.
CREATE INDEX IF NOT EXISTS idx_notification_delivery_log_offen
  ON public.notification_delivery_log(status, created_at)
  WHERE status IN ('queued', 'failed');

-- Idempotenz-Riegel: pro (correlation_id, channel) darf es hoechstens
-- EINEN Erfolg geben. Ohne diesen Index koennten zwei parallele
-- Wiederholungslaeufe dieselbe Mail zweimal verschicken und beide
-- Zeilen als 'sent' ablegen.
CREATE UNIQUE INDEX IF NOT EXISTS uq_notification_delivery_log_erfolg
  ON public.notification_delivery_log(correlation_id, channel)
  WHERE correlation_id IS NOT NULL AND status IN ('sent', 'delivered');

-- ── 3) RLS ──────────────────────────────────────────────────────────
ALTER TABLE public.notification_delivery_log ENABLE ROW LEVEL SECURITY;

-- Lesende/schreibende Rolle: Administration. Muster wie
-- invoice_email_log_admin. service_role umgeht RLS ohnehin und schreibt
-- die Zeilen.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'notification_delivery_log'
      AND policyname = 'notification_delivery_log_admin'
  ) THEN
    CREATE POLICY notification_delivery_log_admin
      ON public.notification_delivery_log
      FOR ALL USING (public.is_admin());
  END IF;
END;
$$;

-- Mandantengrenze als RESTRICTIVE Policy — greift ZUSAETZLICH zur
-- Admin-Policy, nicht statt ihrer (siehe org_fence_invoice_email_log).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'notification_delivery_log'
      AND policyname = 'org_fence_notification_delivery_log'
  ) THEN
    CREATE POLICY org_fence_notification_delivery_log
      ON public.notification_delivery_log
      AS RESTRICTIVE
      FOR ALL
      USING (organization_id = current_org_id());
  END IF;
END;
$$;

-- Kein direkter Tabellenzugriff fuer anon. authenticated bleibt drin,
-- weil die Admin-Policy oben ueber diese Rolle laeuft.
REVOKE ALL ON TABLE public.notification_delivery_log FROM anon;

COMMENT ON TABLE public.notification_delivery_log IS
  'Zustellprotokoll aller Benachrichtigungskanaele (email/push/in_app/whatsapp). '
  'Protokoll, kein Zustand — der fachliche Zustand bleibt an notifications/invoices.';
COMMENT ON COLUMN public.notification_delivery_log.sanitized_error IS
  'Fehlertext NACH Sanitisierung durch lib/notifications/delivery-log.ts. '
  'Enthaelt weder Schluessel/Tokens noch E-Mail-Adressen oder Telefonnummern.';
COMMENT ON COLUMN public.notification_delivery_log.correlation_id IS
  'Zuordnung zum Geschaeftsvorfall (Buchung, Rechnung, Termin). Zusammen mit '
  'channel der Idempotenzschluessel des Wiederholungslaufs.';

-- ── 4) Retention ────────────────────────────────────────────────────
-- Zustellprotokolle sind Betriebsdaten, keine Aufbewahrungspflicht nach
-- HGB/AO. 400 Tage decken einen Jahreszyklus plus Puffer fuer
-- Nachfragen ab. Der Aufruf haengt am Aufraeum-Job, nicht an einem
-- DB-Cron — hier wird nur die Funktion bereitgestellt.
CREATE OR REPLACE FUNCTION public.cleanup_notification_delivery_log()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  geloescht integer;
BEGIN
  DELETE FROM public.notification_delivery_log
  WHERE created_at < now() - interval '400 days';
  GET DIAGNOSTICS geloescht = ROW_COUNT;
  RETURN geloescht;
END;
$$;

-- Jede public-Funktion ist per Default anon-ausfuehrbar (siehe
-- 20260922000000). Ohne REVOKE koennte jeder das Protokoll leeren.
REVOKE ALL ON FUNCTION public.cleanup_notification_delivery_log()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_notification_delivery_log()
  TO service_role;

COMMIT;
