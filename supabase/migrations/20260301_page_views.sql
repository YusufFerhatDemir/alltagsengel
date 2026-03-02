-- AlltagsEngel: Sayfa görüntüleme takibi (Page View Tracking)
-- Bu SQL'i Supabase Dashboard > SQL Editor'de çalıştırın.

CREATE TABLE IF NOT EXISTS page_views (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  path          TEXT NOT NULL,
  page_label    TEXT NOT NULL DEFAULT '',
  user_agent    TEXT,
  referrer      TEXT,
  screen_width  INT,
  viewed_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Foreign key for joining profiles
ALTER TABLE page_views
  ADD CONSTRAINT page_views_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL;

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_page_views_viewed_at ON page_views (viewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_page_views_user_id   ON page_views (user_id);
CREATE INDEX IF NOT EXISTS idx_page_views_path      ON page_views (path);

-- RLS: Anyone can insert (tracking), only admins can read
ALTER TABLE page_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert page views"
  ON page_views FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Admins can read all page views"
  ON page_views FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );
