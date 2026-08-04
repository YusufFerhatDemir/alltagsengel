-- ════════════════════════════════════════════════════════════════════
-- BASELINE: Kern-Tabellen (profiles, angels, bookings, reviews)
-- ════════════════════════════════════════════════════════════════════
--
-- Diese Tabellen wurden historisch über das Supabase-Dashboard
-- erstellt und hatten keine versionierte Migration.
-- Diese Datei schließt die Reproduzierbarkeits-Lücke.
--
-- Spalten-Definitionen entsprechen dem Produktions-Schema VOR
-- allen nachfolgenden Migrationen:
--   • deleted_at        → 20260419_soft_delete.sql
--   • onboarding_completed → 20260412_onboarding_column.sql
--   • is_test, referral_* → 20260101000100_baseline_live_only_functions.sql
--   • organization_id   → 20260801_phase3_multi_mandant_saas.sql
--   • is_flexible, care_recipient_id → 20260802000200
--   • responded_at, decline_reason   → 20260719
--
-- Alle Statements sind idempotent (IF NOT EXISTS / CREATE OR REPLACE).
-- ════════════════════════════════════════════════════════════════════

-- ── 1) profiles ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id           uuid REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  role         text NOT NULL
               CHECK (role IN ('kunde','engel','admin','superadmin','fahrer')),
  first_name   text NOT NULL DEFAULT '',
  last_name    text NOT NULL DEFAULT '',
  email        text NOT NULL DEFAULT '',
  phone        text DEFAULT '',
  location     text DEFAULT '',
  latitude     double precision,
  longitude    double precision,
  avatar_color text DEFAULT '#C8A45B',
  created_at   timestamptz DEFAULT now()
);

-- ── 2) angels ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.angels (
  id               uuid REFERENCES public.profiles(id) ON DELETE CASCADE PRIMARY KEY,
  hourly_rate      integer NOT NULL DEFAULT 20,
  services         text[] DEFAULT '{}',
  availability     text[] DEFAULT '{}',
  bio              text DEFAULT '',
  qualification    text DEFAULT '',
  is_certified     boolean DEFAULT false,
  is_45b_capable   boolean DEFAULT false,
  is_online        boolean DEFAULT true,
  total_jobs       integer DEFAULT 0,
  rating           numeric DEFAULT 5.0,
  satisfaction_pct integer DEFAULT 100,
  created_at       timestamptz DEFAULT now()
);

-- ── 3) bookings ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bookings (
  id                 uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id        uuid NOT NULL REFERENCES public.profiles(id),
  angel_id           uuid NOT NULL REFERENCES public.angels(id),
  service            text NOT NULL DEFAULT '',
  date               date NOT NULL DEFAULT CURRENT_DATE,
  time               time NOT NULL DEFAULT '10:00:00',
  duration_hours     integer NOT NULL DEFAULT 2,
  status             text NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','accepted','declined','completed','cancelled')),
  payment_method     text DEFAULT 'kasse'
                     CHECK (payment_method IN ('kasse','privat','kombi')),
  insurance_type     text DEFAULT '',
  insurance_provider text DEFAULT '',
  total_amount       numeric DEFAULT 0,
  platform_fee       numeric DEFAULT 0,
  notes              text DEFAULT '',
  created_at         timestamptz DEFAULT now()
);

-- ── 4) reviews ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reviews (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id  uuid REFERENCES public.bookings(id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL REFERENCES public.profiles(id),
  angel_id    uuid NOT NULL REFERENCES public.angels(id),
  rating      integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment     text DEFAULT '',
  created_at  timestamptz DEFAULT now()
);


-- ════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ════════════════════════════════════════════════════════════════════
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.angels   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews  ENABLE ROW LEVEL SECURITY;

-- ── profiles-Policies ───────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='profiles' AND policyname='Herkes profilleri okuyabilir') THEN
    CREATE POLICY "Herkes profilleri okuyabilir" ON public.profiles
      FOR SELECT USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='profiles' AND policyname='Kullanıcı kendi profilini güncelleyebilir') THEN
    CREATE POLICY "Kullanıcı kendi profilini güncelleyebilir" ON public.profiles
      FOR UPDATE USING (auth.uid() = id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='profiles' AND policyname='Kullanıcı kendi profilini oluşturabilir') THEN
    CREATE POLICY "Kullanıcı kendi profilini oluşturabilir" ON public.profiles
      FOR INSERT WITH CHECK (auth.uid() = id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='profiles' AND policyname='Admin profilleri yönetebilir') THEN
    CREATE POLICY "Admin profilleri yönetebilir" ON public.profiles
      FOR ALL USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
      );
  END IF;
END $$;

-- ── angels-Policies ─────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='angels' AND policyname='Herkes engelleri okuyabilir') THEN
    CREATE POLICY "Herkes engelleri okuyabilir" ON public.angels
      FOR SELECT USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='angels' AND policyname='Engel kendi profilini güncelleyebilir') THEN
    CREATE POLICY "Engel kendi profilini güncelleyebilir" ON public.angels
      FOR UPDATE USING (auth.uid() = id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='angels' AND policyname='Engel kendi profilini oluşturabilir') THEN
    CREATE POLICY "Engel kendi profilini oluşturabilir" ON public.angels
      FOR INSERT WITH CHECK (auth.uid() = id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='angels' AND policyname='Admin engelleri yönetebilir') THEN
    CREATE POLICY "Admin engelleri yönetebilir" ON public.angels
      FOR ALL USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
      );
  END IF;
END $$;

-- ── bookings-Policies ───────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='bookings' AND policyname='Kullanıcı kendi bookinglerini okuyabilir') THEN
    CREATE POLICY "Kullanıcı kendi bookinglerini okuyabilir" ON public.bookings
      FOR SELECT USING (auth.uid() = customer_id OR auth.uid() = angel_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='bookings' AND policyname='Müşteri booking oluşturabilir') THEN
    CREATE POLICY "Müşteri booking oluşturabilir" ON public.bookings
      FOR INSERT WITH CHECK (auth.uid() = customer_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='bookings' AND policyname='İlgili kişi bookingi güncelleyebilir') THEN
    CREATE POLICY "İlgili kişi bookingi güncelleyebilir" ON public.bookings
      FOR UPDATE USING (auth.uid() = customer_id OR auth.uid() = angel_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='bookings' AND policyname='Admin bookingleri yönetebilir') THEN
    CREATE POLICY "Admin bookingleri yönetebilir" ON public.bookings
      FOR ALL USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
      );
  END IF;
END $$;

-- ── reviews-Policies ────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='reviews' AND policyname='Herkes reviewleri okuyabilir') THEN
    CREATE POLICY "Herkes reviewleri okuyabilir" ON public.reviews
      FOR SELECT USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='reviews' AND policyname='Müşteri review yazabilir') THEN
    CREATE POLICY "Müşteri review yazabilir" ON public.reviews
      FOR INSERT WITH CHECK (auth.uid() = reviewer_id);
  END IF;
END $$;


-- ════════════════════════════════════════════════════════════════════
-- AUTH TRIGGER: Neue Registrierung → automatisch Profil erstellen
-- ════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (id, role, first_name, last_name, email)
  VALUES (
    new.id,
    coalesce(new.raw_user_meta_data->>'role', 'kunde'),
    coalesce(new.raw_user_meta_data->>'first_name', ''),
    coalesce(new.raw_user_meta_data->>'last_name', ''),
    new.email
  );
  RETURN new;
END;
$$;

-- Trigger auf auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
