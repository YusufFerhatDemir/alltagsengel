-- ═══════════════════════════════════════════════════════════════
-- Mahnwesen: E-Mail-Versand-Queue
-- ═══════════════════════════════════════════════════════════════
--
-- Mahnschreiben werden in eine Queue geschrieben und dann per
-- Cron/Edge Function versendet. Das entkoppelt den Mahnlauf
-- vom tatsächlichen Mailversand.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.dunning_email_queue (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizations(id),
  invoice_id       uuid NOT NULL REFERENCES public.invoices(id),
  dunning_entry_id uuid REFERENCES public.dunning_entries(id),
  dunning_document_id uuid REFERENCES public.dunning_documents(id),
  empfaenger_email text NOT NULL,
  empfaenger_name  text,
  betreff          text NOT NULL,
  inhalt           text NOT NULL,
  status           text NOT NULL DEFAULT 'wartend'
    CHECK (status IN ('wartend', 'versendet', 'fehlgeschlagen', 'storniert')),
  fehler_details   text,
  versendet_am     timestamptz,
  created_by       uuid,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dunning_email_queue_status
  ON public.dunning_email_queue(status) WHERE status = 'wartend';
CREATE INDEX IF NOT EXISTS idx_dunning_email_queue_org
  ON public.dunning_email_queue(organization_id);

ALTER TABLE public.dunning_email_queue ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'dunning_email_queue' AND policyname = 'dunning_email_queue_admin') THEN
    CREATE POLICY "dunning_email_queue_admin" ON public.dunning_email_queue
      FOR ALL USING (public.is_admin());
  END IF;
END;
$$;
