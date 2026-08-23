-- ═══════════════════════════════════════════════════════════════
-- Rechnungsversand: Zustellprotokoll
-- ═══════════════════════════════════════════════════════════════
--
-- Bis hierhin gab es im gesamten Abrechnungspfad keinen einzigen
-- E-Mail-Versand — die Rechnung wurde erzeugt, als PDF abgelegt und
-- erreichte den Kunden nie (FUNKTIONALE_LUECKENANALYSE, Bereich 5).
--
-- Der Versandzustand selbst haengt an invoices.sent_at /
-- invoices.versand_elektronisch (beide existieren live). Diese Tabelle
-- ist das ZUSATZ-Protokoll: jeder Versuch mit Empfaenger, Betreff,
-- Ergebnis, Fehlertext und Versuchszaehler. Ohne sie funktioniert der
-- Versand weiterhin (die Idempotenz haengt an sent_at), es fehlt dann
-- nur die Versuchshistorie.
--
-- status:
--   versendet      — Resend hat die Mail angenommen
--   fehlgeschlagen — Resend-Fehler oder Ausnahme
--   uebersprungen  — kein RESEND_API_KEY oder keine E-Mail-Adresse;
--                    sent_at bleibt in dem Fall bewusst leer, damit
--                    spaeter nachversendet wird
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.invoice_email_log (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES public.organizations(id),
  invoice_id          uuid NOT NULL REFERENCES public.invoices(id),
  empfaenger_email    text,
  empfaenger_name     text,
  betreff             text,
  status              text NOT NULL
    CHECK (status IN ('versendet', 'fehlgeschlagen', 'uebersprungen')),
  grund               text,
  versuch             integer NOT NULL DEFAULT 1,
  provider_message_id text,
  pdf_checksum        text,
  pdf_seiten          integer,
  versendet_am        timestamptz,
  created_by          uuid,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoice_email_log_invoice
  ON public.invoice_email_log(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_email_log_org
  ON public.invoice_email_log(organization_id);
CREATE INDEX IF NOT EXISTS idx_invoice_email_log_status
  ON public.invoice_email_log(status) WHERE status <> 'versendet';

ALTER TABLE public.invoice_email_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'invoice_email_log' AND policyname = 'invoice_email_log_admin'
  ) THEN
    CREATE POLICY invoice_email_log_admin ON public.invoice_email_log
      FOR ALL USING (public.is_admin());
  END IF;
END;
$$;

-- Mandantengrenze als RESTRICTIVE Policy — greift zusaetzlich zur
-- Admin-Policy, nicht statt ihrer (siehe org_fence_dunning_email_queue).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'invoice_email_log' AND policyname = 'org_fence_invoice_email_log'
  ) THEN
    CREATE POLICY org_fence_invoice_email_log
      ON public.invoice_email_log
      AS RESTRICTIVE
      FOR ALL
      USING (organization_id = current_org_id());
  END IF;
END;
$$;
