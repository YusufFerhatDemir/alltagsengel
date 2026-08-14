-- Rollback: M-1 + M-2 REVOKE anon
-- ACHTUNG: Nur ausführen wenn bewusst anon-Zugriff wieder gewünscht

DO $$ BEGIN
  GRANT SELECT ON public.angels TO anon;
  GRANT SELECT ON public.pflege_aufnahmen TO anon;
  GRANT SELECT ON public.pflege_diagnosen TO anon;
  GRANT SELECT ON public.chat_messages TO anon;
  GRANT SELECT ON public.messages TO anon;
  GRANT SELECT ON public.wf_audit_log TO anon;
  GRANT SELECT ON public.wf_aktionen TO anon;
  GRANT SELECT ON public.dunning_entries TO anon;
  GRANT SELECT ON public.invoice_snapshots TO anon;
  GRANT SELECT ON public.budget_reservations TO anon;
  GRANT SELECT ON public.personal_arbeitszeiten TO anon;
  GRANT SELECT ON public.personal_schulungen TO anon;
  GRANT SELECT ON public.klaerfaelle TO anon;
  GRANT SELECT ON public.payment_allocations TO anon;
  GRANT SELECT ON public.payment_differences TO anon;
  GRANT SELECT ON public.invoice_corrections TO anon;
END $$;
