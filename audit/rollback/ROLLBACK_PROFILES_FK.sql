-- ============================================================================
-- ROLLBACK: profiles FKs zurück auf NO ACTION + NOT NULL wiederherstellen
-- Anwenden: Wenn Migration 20260804400000 zurückgerollt werden muss
-- ============================================================================

-- 1. krankenfahrten.customer_id → NO ACTION + NOT NULL
ALTER TABLE public.krankenfahrten DROP CONSTRAINT IF EXISTS krankenfahrten_customer_id_fkey;
ALTER TABLE public.krankenfahrten
  ADD CONSTRAINT krankenfahrten_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES public.profiles(id);
ALTER TABLE public.krankenfahrten ALTER COLUMN customer_id SET NOT NULL;

-- 2. bookings.customer_id → NO ACTION + NOT NULL
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_customer_id_fkey;
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES public.profiles(id);
ALTER TABLE public.bookings ALTER COLUMN customer_id SET NOT NULL;

-- 3. hygienebox_orders.user_id → NO ACTION + NOT NULL
ALTER TABLE public.hygienebox_orders DROP CONSTRAINT IF EXISTS hygienebox_orders_user_id_fkey;
ALTER TABLE public.hygienebox_orders
  ADD CONSTRAINT hygienebox_orders_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id);
ALTER TABLE public.hygienebox_orders ALTER COLUMN user_id SET NOT NULL;

-- 4. krankenfahrt_providers.user_id → NO ACTION + NOT NULL
ALTER TABLE public.krankenfahrt_providers DROP CONSTRAINT IF EXISTS krankenfahrt_providers_user_id_fkey;
ALTER TABLE public.krankenfahrt_providers
  ADD CONSTRAINT krankenfahrt_providers_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id);
ALTER TABLE public.krankenfahrt_providers ALTER COLUMN user_id SET NOT NULL;

-- 5. krankenfahrt_reviews.customer_id → NO ACTION + NOT NULL
ALTER TABLE public.krankenfahrt_reviews DROP CONSTRAINT IF EXISTS krankenfahrt_reviews_customer_id_fkey;
ALTER TABLE public.krankenfahrt_reviews
  ADD CONSTRAINT krankenfahrt_reviews_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES public.profiles(id);
ALTER TABLE public.krankenfahrt_reviews ALTER COLUMN customer_id SET NOT NULL;

-- 6. kf_booking_reviews.assigned_to → NO ACTION (war bereits NULLABLE)
ALTER TABLE public.kf_booking_reviews DROP CONSTRAINT IF EXISTS kf_booking_reviews_assigned_to_fkey;
ALTER TABLE public.kf_booking_reviews
  ADD CONSTRAINT kf_booking_reviews_assigned_to_fkey
  FOREIGN KEY (assigned_to) REFERENCES public.profiles(id);

-- 7. kf_booking_reviews.reviewed_by → NO ACTION (war bereits NULLABLE)
ALTER TABLE public.kf_booking_reviews DROP CONSTRAINT IF EXISTS kf_booking_reviews_reviewed_by_fkey;
ALTER TABLE public.kf_booking_reviews
  ADD CONSTRAINT kf_booking_reviews_reviewed_by_fkey
  FOREIGN KEY (reviewed_by) REFERENCES public.profiles(id);

-- 8. kf_partners.user_id → NO ACTION (war bereits NULLABLE)
ALTER TABLE public.kf_partners DROP CONSTRAINT IF EXISTS kf_partners_user_id_fkey;
ALTER TABLE public.kf_partners
  ADD CONSTRAINT kf_partners_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id);

-- 9. kf_pricing_rules.created_by → NO ACTION (war bereits NULLABLE)
ALTER TABLE public.kf_pricing_rules DROP CONSTRAINT IF EXISTS kf_pricing_rules_created_by_fkey;
ALTER TABLE public.kf_pricing_rules
  ADD CONSTRAINT kf_pricing_rules_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.profiles(id);

-- 10. profiles.referred_by → NO ACTION (war bereits NULLABLE)
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_referred_by_fkey;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_referred_by_fkey
  FOREIGN KEY (referred_by) REFERENCES public.profiles(id);

-- 11. referrals.referred_id → NO ACTION + NOT NULL
ALTER TABLE public.referrals DROP CONSTRAINT IF EXISTS referrals_referred_id_fkey;
ALTER TABLE public.referrals
  ADD CONSTRAINT referrals_referred_id_fkey
  FOREIGN KEY (referred_id) REFERENCES public.profiles(id);
ALTER TABLE public.referrals ALTER COLUMN referred_id SET NOT NULL;

-- 12. referrals.referrer_id → NO ACTION + NOT NULL
ALTER TABLE public.referrals DROP CONSTRAINT IF EXISTS referrals_referrer_id_fkey;
ALTER TABLE public.referrals
  ADD CONSTRAINT referrals_referrer_id_fkey
  FOREIGN KEY (referrer_id) REFERENCES public.profiles(id);
ALTER TABLE public.referrals ALTER COLUMN referrer_id SET NOT NULL;

-- 13. reviews.reviewer_id → NO ACTION + NOT NULL
ALTER TABLE public.reviews DROP CONSTRAINT IF EXISTS reviews_reviewer_id_fkey;
ALTER TABLE public.reviews
  ADD CONSTRAINT reviews_reviewer_id_fkey
  FOREIGN KEY (reviewer_id) REFERENCES public.profiles(id);
ALTER TABLE public.reviews ALTER COLUMN reviewer_id SET NOT NULL;

-- ============================================================================
-- DONE: Alle 13 FKs zurück auf NO ACTION, NOT NULL wiederhergestellt
-- ============================================================================
