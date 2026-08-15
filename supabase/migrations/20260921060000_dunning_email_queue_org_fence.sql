-- org_fence RESTRICTIVE Policy für dunning_email_queue
-- Tabelle hat organization_id (uuid, NOT NULL), 0 Rows aktuell = safe
-- Applied via Supabase MCP 2026-08-15

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'dunning_email_queue'
    AND policyname = 'org_fence_dunning_email_queue'
  ) THEN
    CREATE POLICY org_fence_dunning_email_queue
      ON public.dunning_email_queue
      AS RESTRICTIVE
      FOR ALL
      USING (organization_id = current_org_id());
  END IF;
END $$;
