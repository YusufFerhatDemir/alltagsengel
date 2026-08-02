-- App-weite Benachrichtigungen (für Kunden, Engel, Fahrer)
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'booking' CHECK (type IN ('booking','system','chat','payment','reminder')),
  title text NOT NULL,
  body text,
  data jsonb DEFAULT '{}',
  link text,
  is_read boolean DEFAULT false,
  email_sent boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Angleich 2026-08-02 (Shadow-DB-Replay):
-- supabase/initial-setup.sql legt public.notifications bereits in einer
-- ÄLTEREN Form an (Spalte `read` statt `is_read`, ohne link/email_sent).
-- Das CREATE TABLE IF NOT EXISTS oben greift dann nicht und der Index
-- auf is_read lief in `ERROR: column "is_read" does not exist`.
-- Der Live-Stand entspricht der Form OBEN — deshalb hier nachziehen.
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS is_read    boolean DEFAULT false;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS link       text;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS email_sent boolean DEFAULT false;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'read'
  ) THEN
    UPDATE public.notifications SET is_read = read WHERE is_read IS NULL;
    ALTER TABLE public.notifications DROP COLUMN read;
  END IF;
END $$;

-- Alte Policies aus initial-setup.sql weichen den unten definierten.
DROP POLICY IF EXISTS "Kullanıcı kendi bildirimlerini okuyabilir" ON public.notifications;
DROP POLICY IF EXISTS "Kullanıcı bildirimlerini güncelleyebilir"  ON public.notifications;
DROP POLICY IF EXISTS "Admin bildirimleri yönetebilir"            ON public.notifications;

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON public.notifications(user_id, is_read) WHERE is_read = false;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Authenticated users can create notifications" ON public.notifications;
CREATE POLICY "Authenticated users can create notifications"
  ON public.notifications FOR INSERT
  WITH CHECK (true);
