-- Welle-1 Foundation: zentrale Analytics-Event-Tabelle
-- NICHT automatisch ausführen — manuell im Supabase SQL-Editor anstoßen.
--
-- Zweck: Web-Vitals + Custom-Events (sign_up, krankenfahrt_booking, …) für
-- Reports unabhängig von GA4/Meta/TikTok speichern. RUM-Daten landen primär
-- hier, der GA4-Stream bleibt zusätzlich aktiv.

CREATE TABLE IF NOT EXISTS analytics_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name   TEXT NOT NULL,
  event_props  JSONB NOT NULL DEFAULT '{}'::jsonb,
  page_path    TEXT,
  user_id      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id   TEXT,
  user_agent   TEXT,
  ip_hash      TEXT,        -- gehashte IP, nie roh speichern
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_created_at
  ON analytics_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_analytics_events_event_name
  ON analytics_events (event_name);

CREATE INDEX IF NOT EXISTS idx_analytics_events_user_id
  ON analytics_events (user_id);

CREATE INDEX IF NOT EXISTS idx_analytics_events_page_path
  ON analytics_events (page_path);

CREATE INDEX IF NOT EXISTS idx_analytics_events_props_gin
  ON analytics_events USING GIN (event_props);

ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

-- Server-only schreibend (Service-Role-Key umgeht RLS) — anon/auth dürfen
-- direkt NICHT inserten. API-Route /api/analytics/vitals nutzt Admin-Client.
DROP POLICY IF EXISTS "analytics_events_no_anon_insert" ON analytics_events;
CREATE POLICY "analytics_events_no_anon_insert"
  ON analytics_events FOR INSERT
  TO authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS "analytics_events_admin_select" ON analytics_events;
CREATE POLICY "analytics_events_admin_select"
  ON analytics_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

COMMENT ON TABLE analytics_events IS
  'Welle-1 RUM + Custom-Events. Inserts nur via Service-Role-Key (API-Routes).';
