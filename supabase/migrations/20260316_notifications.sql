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

CREATE INDEX idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX idx_notifications_created_at ON public.notifications(created_at DESC);
CREATE INDEX idx_notifications_unread ON public.notifications(user_id, is_read) WHERE is_read = false;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Authenticated users can create notifications"
  ON public.notifications FOR INSERT
  WITH CHECK (true);
