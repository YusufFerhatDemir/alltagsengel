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
--
-- Fix 2026-08-02 (Shadow-DB-Replay): Postgres benennt den inline oben
-- erzeugten FK (user_id -> auth.users) automatisch ebenfalls
-- "page_views_user_id_fkey". Das unbedingte ADD CONSTRAINT hier lief
-- deshalb auf einer leeren DB IMMER in
--   ERROR: constraint "page_views_user_id_fkey" ... already exists
-- Live existiert nur ein FK auf user_id. Der Block ist jetzt idempotent
-- und legt den profiles-FK nur an, wenn der Name noch frei ist.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'page_views_user_id_fkey'
  ) THEN
    ALTER TABLE page_views
      ADD CONSTRAINT page_views_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_page_views_viewed_at ON page_views (viewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_page_views_user_id   ON page_views (user_id);
CREATE INDEX IF NOT EXISTS idx_page_views_path      ON page_views (path);

-- RLS: Anyone can insert (tracking), only admins can read
ALTER TABLE page_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can insert page views" ON page_views;
CREATE POLICY "Anyone can insert page views"
  ON page_views FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Admins can read all page views" ON page_views;
CREATE POLICY "Admins can read all page views"
  ON page_views FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );
