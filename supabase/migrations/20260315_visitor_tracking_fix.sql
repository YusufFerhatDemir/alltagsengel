-- ============================================
-- FIX: Visitor Tracking & Auth Log
-- Tabellen + RLS-Policies für MIS Analytics
-- ============================================

-- ====== VISITOR LOCATIONS (für MIS Analytics) ======
CREATE TABLE IF NOT EXISTS public.visitor_locations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  portal text DEFAULT 'landing',
  city text,
  country text,
  region text,
  latitude double precision,
  longitude double precision,
  source text DEFAULT 'fallback',  -- gps | ip | fallback
  ip_address text,
  user_agent text,
  page_path text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_visitor_locations_created ON public.visitor_locations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_visitor_locations_portal ON public.visitor_locations(portal);
CREATE INDEX IF NOT EXISTS idx_visitor_locations_user ON public.visitor_locations(user_id);

-- ====== VISITORS (für /api/track Endpoint) ======
CREATE TABLE IF NOT EXISTS public.visitors (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  ip text,
  country text,
  city text,
  region text,
  user_agent text,
  referrer text,
  page text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_visitors_created ON public.visitors(created_at DESC);

-- ====== AUTH LOG (für Login-Tracking) ======
CREATE TABLE IF NOT EXISTS public.mis_auth_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  user_email text,
  user_name text,
  action text NOT NULL DEFAULT 'login',
  ip_address text,
  user_agent text,
  location text,
  device text,
  status text DEFAULT 'success',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auth_log_created ON public.mis_auth_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_log_user ON public.mis_auth_log(user_id);

-- ====== RLS POLICIES ======

-- visitor_locations: Jeder kann einfügen, Admins können alles lesen
ALTER TABLE public.visitor_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can insert visitor_locations" ON public.visitor_locations;
CREATE POLICY "Anyone can insert visitor_locations" ON public.visitor_locations
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Admin read visitor_locations" ON public.visitor_locations;
CREATE POLICY "Admin read visitor_locations" ON public.visitor_locations
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- visitors: Jeder kann einfügen (auch anon), Admins können lesen
ALTER TABLE public.visitors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can insert visitors" ON public.visitors;
CREATE POLICY "Anyone can insert visitors" ON public.visitors
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Admin read visitors" ON public.visitors;
CREATE POLICY "Admin read visitors" ON public.visitors
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- mis_auth_log: Jeder authentifizierte Nutzer kann einfügen, Admins können lesen
ALTER TABLE public.mis_auth_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can insert auth_log" ON public.mis_auth_log;
CREATE POLICY "Anyone can insert auth_log" ON public.mis_auth_log
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Admin read auth_log" ON public.mis_auth_log;
CREATE POLICY "Admin read auth_log" ON public.mis_auth_log
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Service Role kann immer schreiben (für /api/track)
-- (Service Role umgeht RLS automatisch)
