-- ============================================================================
-- Migration: Alle blockierenden FKs auf public.profiles → ON DELETE SET NULL
-- Zweck:     DSGVO-Profil-Löschung ermöglichen
-- Datum:     2026-08-04
-- Kontext:   auth.users FKs bereits auf SET NULL (PR #29 + #30)
--            Jetzt: public.profiles FKs die Löschung blockieren (NO ACTION)
-- ============================================================================
-- REGEL: Geschäfts-/Abrechnungsdaten bleiben erhalten, Profilreferenz → NULL
-- Keine CASCADE auf Geschäftsdaten (Krankenfahrten, Bookings, Reviews etc.)
-- ============================================================================

-- ============================================================
-- 1. krankenfahrten.customer_id (9 Zeilen in Prod)
--    Abrechnungsdaten — MÜSSEN erhalten bleiben
-- ============================================================
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='krankenfahrten'
    AND column_name='customer_id' AND is_nullable='NO'
  ) THEN
    ALTER TABLE public.krankenfahrten ALTER COLUMN customer_id DROP NOT NULL;
  END IF;
END $$;

ALTER TABLE public.krankenfahrten DROP CONSTRAINT IF EXISTS krankenfahrten_customer_id_fkey;
ALTER TABLE public.krankenfahrten
  ADD CONSTRAINT krankenfahrten_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- ============================================================
-- 2. bookings.customer_id (10 Zeilen in Prod)
--    Buchungsdaten — erhalten bleiben
-- ============================================================
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='bookings'
    AND column_name='customer_id' AND is_nullable='NO'
  ) THEN
    ALTER TABLE public.bookings ALTER COLUMN customer_id DROP NOT NULL;
  END IF;
END $$;

ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_customer_id_fkey;
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- ============================================================
-- 3. hygienebox_orders.user_id (0 Zeilen in Prod)
--    Bestelldaten — erhalten bleiben
-- ============================================================
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='hygienebox_orders'
    AND column_name='user_id' AND is_nullable='NO'
  ) THEN
    ALTER TABLE public.hygienebox_orders ALTER COLUMN user_id DROP NOT NULL;
  END IF;
END $$;

ALTER TABLE public.hygienebox_orders DROP CONSTRAINT IF EXISTS hygienebox_orders_user_id_fkey;
ALTER TABLE public.hygienebox_orders
  ADD CONSTRAINT hygienebox_orders_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- ============================================================
-- 4. krankenfahrt_providers.user_id (2 Zeilen in Prod)
--    Provider-Zuordnung — erhalten bleiben
-- ============================================================
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='krankenfahrt_providers'
    AND column_name='user_id' AND is_nullable='NO'
  ) THEN
    ALTER TABLE public.krankenfahrt_providers ALTER COLUMN user_id DROP NOT NULL;
  END IF;
END $$;

ALTER TABLE public.krankenfahrt_providers DROP CONSTRAINT IF EXISTS krankenfahrt_providers_user_id_fkey;
ALTER TABLE public.krankenfahrt_providers
  ADD CONSTRAINT krankenfahrt_providers_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- ============================================================
-- 5. krankenfahrt_reviews.customer_id (0 Zeilen in Prod)
--    Bewertungsdaten — erhalten bleiben
-- ============================================================
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='krankenfahrt_reviews'
    AND column_name='customer_id' AND is_nullable='NO'
  ) THEN
    ALTER TABLE public.krankenfahrt_reviews ALTER COLUMN customer_id DROP NOT NULL;
  END IF;
END $$;

ALTER TABLE public.krankenfahrt_reviews DROP CONSTRAINT IF EXISTS krankenfahrt_reviews_customer_id_fkey;
ALTER TABLE public.krankenfahrt_reviews
  ADD CONSTRAINT krankenfahrt_reviews_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- ============================================================
-- 6. kf_booking_reviews.assigned_to (bereits NULLABLE)
-- ============================================================
ALTER TABLE public.kf_booking_reviews DROP CONSTRAINT IF EXISTS kf_booking_reviews_assigned_to_fkey;
ALTER TABLE public.kf_booking_reviews
  ADD CONSTRAINT kf_booking_reviews_assigned_to_fkey
  FOREIGN KEY (assigned_to) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- ============================================================
-- 7. kf_booking_reviews.reviewed_by (bereits NULLABLE)
-- ============================================================
ALTER TABLE public.kf_booking_reviews DROP CONSTRAINT IF EXISTS kf_booking_reviews_reviewed_by_fkey;
ALTER TABLE public.kf_booking_reviews
  ADD CONSTRAINT kf_booking_reviews_reviewed_by_fkey
  FOREIGN KEY (reviewed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- ============================================================
-- 8. kf_partners.user_id (bereits NULLABLE)
-- ============================================================
ALTER TABLE public.kf_partners DROP CONSTRAINT IF EXISTS kf_partners_user_id_fkey;
ALTER TABLE public.kf_partners
  ADD CONSTRAINT kf_partners_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- ============================================================
-- 9. kf_pricing_rules.created_by (bereits NULLABLE)
-- ============================================================
ALTER TABLE public.kf_pricing_rules DROP CONSTRAINT IF EXISTS kf_pricing_rules_created_by_fkey;
ALTER TABLE public.kf_pricing_rules
  ADD CONSTRAINT kf_pricing_rules_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- ============================================================
-- 10. profiles.referred_by (Self-Referenz, bereits NULLABLE)
-- ============================================================
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_referred_by_fkey;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_referred_by_fkey
  FOREIGN KEY (referred_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- ============================================================
-- 11. referrals.referred_id (0 Zeilen in Prod)
--     Empfehlungsdaten — erhalten bleiben
-- ============================================================
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='referrals'
    AND column_name='referred_id' AND is_nullable='NO'
  ) THEN
    ALTER TABLE public.referrals ALTER COLUMN referred_id DROP NOT NULL;
  END IF;
END $$;

ALTER TABLE public.referrals DROP CONSTRAINT IF EXISTS referrals_referred_id_fkey;
ALTER TABLE public.referrals
  ADD CONSTRAINT referrals_referred_id_fkey
  FOREIGN KEY (referred_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- ============================================================
-- 12. referrals.referrer_id (0 Zeilen in Prod)
--     Empfehlungsdaten — erhalten bleiben
-- ============================================================
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='referrals'
    AND column_name='referrer_id' AND is_nullable='NO'
  ) THEN
    ALTER TABLE public.referrals ALTER COLUMN referrer_id DROP NOT NULL;
  END IF;
END $$;

ALTER TABLE public.referrals DROP CONSTRAINT IF EXISTS referrals_referrer_id_fkey;
ALTER TABLE public.referrals
  ADD CONSTRAINT referrals_referrer_id_fkey
  FOREIGN KEY (referrer_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- ============================================================
-- 13. reviews.reviewer_id (1 Zeile in Prod)
--     Bewertungsdaten — erhalten bleiben
-- ============================================================
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='reviews'
    AND column_name='reviewer_id' AND is_nullable='NO'
  ) THEN
    ALTER TABLE public.reviews ALTER COLUMN reviewer_id DROP NOT NULL;
  END IF;
END $$;

ALTER TABLE public.reviews DROP CONSTRAINT IF EXISTS reviews_reviewer_id_fkey;
ALTER TABLE public.reviews
  ADD CONSTRAINT reviews_reviewer_id_fkey
  FOREIGN KEY (reviewer_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- ============================================================
-- DONE: 13 blockierende FKs → SET NULL
-- Profil-Löschung aus public.profiles ist jetzt möglich
-- ============================================================
