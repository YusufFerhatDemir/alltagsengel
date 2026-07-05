-- CRM Module: Activity tracking + client pipeline fields + lead status tracking
-- Applied via Supabase MCP

-- Add pipeline fields to lead_inquiries
ALTER TABLE lead_inquiries
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS assigned_to text,
  ADD COLUMN IF NOT EXISTS follow_up_date date,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS converted_client_id uuid REFERENCES clients(id),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- CRM Activity log (calls, emails, visits, notes)
CREATE TABLE IF NOT EXISTS mis_crm_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES lead_inquiries(id) ON DELETE CASCADE,
  partner_id uuid REFERENCES cooperation_partners(id) ON DELETE CASCADE,
  activity_type text NOT NULL CHECK (activity_type IN ('call','email','visit','note','follow_up','status_change')),
  title text NOT NULL,
  description text,
  performed_by text,
  created_at timestamptz DEFAULT now()
);

-- Add pipeline_status to clients for CRM pipeline tracking
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS pipeline_status text DEFAULT 'active'
    CHECK (pipeline_status IN ('lead','erstgespraech','active','paused','ended')),
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS assigned_engel text,
  ADD COLUMN IF NOT EXISTS monthly_hours numeric(5,1),
  ADD COLUMN IF NOT EXISTS contract_start date,
  ADD COLUMN IF NOT EXISTS last_contact date;

-- Update existing clients to have pipeline_status = 'active'
UPDATE clients SET pipeline_status = 'active' WHERE pipeline_status IS NULL;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_crm_activities_client ON mis_crm_activities(client_id);
CREATE INDEX IF NOT EXISTS idx_crm_activities_lead ON mis_crm_activities(lead_id);
CREATE INDEX IF NOT EXISTS idx_crm_activities_type ON mis_crm_activities(activity_type);
CREATE INDEX IF NOT EXISTS idx_lead_inquiries_status ON lead_inquiries(status);
CREATE INDEX IF NOT EXISTS idx_clients_pipeline ON clients(pipeline_status);
