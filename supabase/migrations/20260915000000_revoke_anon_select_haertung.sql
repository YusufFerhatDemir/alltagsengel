-- M-1 + M-2: REVOKE anon SELECT/INSERT/UPDATE/DELETE auf 16 Tabellen
-- angels: Geschäftsdaten (hourly_rate, qualification) waren für anon lesbar
-- 15 weitere: RLS filterte zwar, aber kein expliziter REVOKE → Defense-in-Depth
-- Applied to Production 14.08.2026 via Supabase MCP apply_migration

DO $$ BEGIN
  REVOKE SELECT, INSERT, UPDATE, DELETE ON public.angels FROM anon;
  REVOKE SELECT, INSERT, UPDATE, DELETE ON public.pflege_aufnahmen FROM anon;
  REVOKE SELECT, INSERT, UPDATE, DELETE ON public.pflege_diagnosen FROM anon;
  REVOKE SELECT, INSERT, UPDATE, DELETE ON public.chat_messages FROM anon;
  REVOKE SELECT, INSERT, UPDATE, DELETE ON public.messages FROM anon;
  REVOKE SELECT, INSERT, UPDATE, DELETE ON public.wf_audit_log FROM anon;
  REVOKE SELECT, INSERT, UPDATE, DELETE ON public.wf_aktionen FROM anon;
  REVOKE SELECT, INSERT, UPDATE, DELETE ON public.dunning_entries FROM anon;
  REVOKE SELECT, INSERT, UPDATE, DELETE ON public.invoice_snapshots FROM anon;
  REVOKE SELECT, INSERT, UPDATE, DELETE ON public.budget_reservations FROM anon;
  REVOKE SELECT, INSERT, UPDATE, DELETE ON public.personal_arbeitszeiten FROM anon;
  REVOKE SELECT, INSERT, UPDATE, DELETE ON public.personal_schulungen FROM anon;
  REVOKE SELECT, INSERT, UPDATE, DELETE ON public.klaerfaelle FROM anon;
  REVOKE SELECT, INSERT, UPDATE, DELETE ON public.payment_allocations FROM anon;
  REVOKE SELECT, INSERT, UPDATE, DELETE ON public.payment_differences FROM anon;
  REVOKE SELECT, INSERT, UPDATE, DELETE ON public.invoice_corrections FROM anon;
END $$;
