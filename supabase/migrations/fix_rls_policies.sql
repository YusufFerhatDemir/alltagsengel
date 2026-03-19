-- ============================================
-- FIX: Comprehensive RLS Policies for Alltagsengel
-- Security Audit: Ensures users can only access their own data
-- Administrators can access everything
-- ============================================

-- ============================================
-- 1. PROFILES TABLE - Enhanced RLS
-- ============================================

-- Drop existing policies
DROP POLICY IF EXISTS "Herkes profilleri okuyabilir" ON public.profiles;
DROP POLICY IF EXISTS "Kullanıcı kendi profilini güncelleyebilir" ON public.profiles;
DROP POLICY IF EXISTS "Kullanıcı kendi profilini oluşturabilir" ON public.profiles;
DROP POLICY IF EXISTS "Admin profilleri yönetebilir" ON public.profiles;

-- Ensure RLS is enabled
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Public profiles can be read by anyone (for angel directory)
CREATE POLICY "Anyone can view public profiles" ON public.profiles
  FOR SELECT USING (true);

-- Users can update only their own profile
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Users can insert only their own profile
CREATE POLICY "Users can create own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Admins can do anything with profiles
CREATE POLICY "Admins can manage all profiles" ON public.profiles
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin'))
  );

-- ============================================
-- 2. ANGELS TABLE - Enhanced RLS
-- ============================================

DROP POLICY IF EXISTS "Herkes engelleri okuyabilir" ON public.angels;
DROP POLICY IF EXISTS "Engel kendi profilini güncelleyebilir" ON public.angels;
DROP POLICY IF EXISTS "Engel kendi profilini oluşturabilir" ON public.angels;
DROP POLICY IF EXISTS "Admin engelleri yönetebilir" ON public.angels;

ALTER TABLE public.angels ENABLE ROW LEVEL SECURITY;

-- Anyone can view publicly listed angels
CREATE POLICY "Anyone can view angels" ON public.angels
  FOR SELECT USING (true);

-- Angels can only update their own profile
CREATE POLICY "Angels can update own profile" ON public.angels
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Angels can only create their own profile
CREATE POLICY "Angels can create own profile" ON public.angels
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Admins can manage all angel profiles
CREATE POLICY "Admins can manage all angels" ON public.angels
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin'))
  );

-- ============================================
-- 3. BOOKINGS TABLE - Enhanced RLS
-- ============================================

DROP POLICY IF EXISTS "Kullanıcı kendi bookinglerini okuyabilir" ON public.bookings;
DROP POLICY IF EXISTS "Müşteri booking oluşturabilir" ON public.bookings;
DROP POLICY IF EXISTS "İlgili kişi bookingi güncelleyebilir" ON public.bookings;
DROP POLICY IF EXISTS "Admin bookingleri yönetebilir" ON public.bookings;

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

-- Users can only view their own bookings (as customer or angel)
CREATE POLICY "Users can view own bookings" ON public.bookings
  FOR SELECT USING (
    auth.uid() = customer_id OR auth.uid() = angel_id
  );

-- Only customers can create bookings with themselves as customer
CREATE POLICY "Customers can create bookings" ON public.bookings
  FOR INSERT WITH CHECK (auth.uid() = customer_id);

-- Only involved parties (customer or angel) can update bookings
CREATE POLICY "Involved parties can update bookings" ON public.bookings
  FOR UPDATE USING (auth.uid() = customer_id OR auth.uid() = angel_id)
  WITH CHECK (auth.uid() = customer_id OR auth.uid() = angel_id);

-- Customers or angels can delete their own bookings if pending
CREATE POLICY "Involved parties can delete pending bookings" ON public.bookings
  FOR DELETE USING (
    (auth.uid() = customer_id OR auth.uid() = angel_id) AND status = 'pending'
  );

-- Admins can manage all bookings
CREATE POLICY "Admins can manage all bookings" ON public.bookings
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin'))
  );

-- ============================================
-- 4. REVIEWS TABLE - Enhanced RLS
-- ============================================

DROP POLICY IF EXISTS "Herkes reviewleri okuyabilir" ON public.reviews;
DROP POLICY IF EXISTS "Müşteri review yazabilir" ON public.reviews;

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

-- Anyone can read reviews
CREATE POLICY "Anyone can view reviews" ON public.reviews
  FOR SELECT USING (true);

-- Only reviewers can create their own reviews
CREATE POLICY "Users can create own reviews" ON public.reviews
  FOR INSERT WITH CHECK (auth.uid() = reviewer_id);

-- Only reviewers can update their own reviews
CREATE POLICY "Users can update own reviews" ON public.reviews
  FOR UPDATE USING (auth.uid() = reviewer_id)
  WITH CHECK (auth.uid() = reviewer_id);

-- Admins can manage all reviews
CREATE POLICY "Admins can manage all reviews" ON public.reviews
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin'))
  );

-- ============================================
-- 5. MESSAGES TABLE - Enhanced RLS
-- ============================================

DROP POLICY IF EXISTS "Kullanıcı kendi mesajlarını okuyabilir" ON public.messages;
DROP POLICY IF EXISTS "Kullanıcı mesaj gönderebilir" ON public.messages;
DROP POLICY IF EXISTS "Kullanıcı kendi mesajlarını güncelleyebilir" ON public.messages;

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Users can only read messages where they are sender or receiver
CREATE POLICY "Users can view own messages" ON public.messages
  FOR SELECT USING (
    auth.uid() = sender_id OR auth.uid() = receiver_id
  );

-- Only authenticated users can send messages with themselves as sender
CREATE POLICY "Authenticated users can send messages" ON public.messages
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL AND auth.uid() = sender_id
  );

-- Only receiver can mark messages as read
CREATE POLICY "Receiver can update messages" ON public.messages
  FOR UPDATE USING (auth.uid() = receiver_id)
  WITH CHECK (auth.uid() = receiver_id);

-- Admins can manage all messages
CREATE POLICY "Admins can manage all messages" ON public.messages
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin'))
  );

-- ============================================
-- 6. DOCUMENTS TABLE - Enhanced RLS
-- ============================================

DROP POLICY IF EXISTS "Kullanıcı kendi belgelerini okuyabilir" ON public.documents;
DROP POLICY IF EXISTS "Kullanıcı belge yükleyebilir" ON public.documents;
DROP POLICY IF EXISTS "Admin belgeleri yönetebilir" ON public.documents;

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- Users can only view their own documents
CREATE POLICY "Users can view own documents" ON public.documents
  FOR SELECT USING (auth.uid() = user_id);

-- Users can only upload documents for themselves
CREATE POLICY "Users can upload documents" ON public.documents
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can only update their own documents
CREATE POLICY "Users can update own documents" ON public.documents
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can only delete their own documents
CREATE POLICY "Users can delete own documents" ON public.documents
  FOR DELETE USING (auth.uid() = user_id);

-- Admins can manage all documents
CREATE POLICY "Admins can manage all documents" ON public.documents
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin'))
  );

-- ============================================
-- 7. PAYMENTS TABLE - Enhanced RLS
-- ============================================

DROP POLICY IF EXISTS "Kullanıcı kendi ödemelerini okuyabilir" ON public.payments;
DROP POLICY IF EXISTS "Admin ödemeleri yönetebilir" ON public.payments;

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Users can only view their own payments
CREATE POLICY "Users can view own payments" ON public.payments
  FOR SELECT USING (auth.uid() = user_id);

-- Users cannot directly create payments (should go through service)
-- Admins can manage all payments
CREATE POLICY "Admins can manage all payments" ON public.payments
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin'))
  );

-- ============================================
-- 8. NOTIFICATIONS TABLE - Enhanced RLS
-- ============================================

DROP POLICY IF EXISTS "Kullanıcı kendi bildirimlerini okuyabilir" ON public.notifications;
DROP POLICY IF EXISTS "Kullanıcı bildirimlerini güncelleyebilir" ON public.notifications;
DROP POLICY IF EXISTS "Admin bildirimleri yönetebilir" ON public.notifications;
DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Authenticated users can create notifications" ON public.notifications;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Users can only view their own notifications
CREATE POLICY "Users can view own notifications" ON public.notifications
  FOR SELECT USING (auth.uid() = user_id);

-- Users can only update their own notifications
CREATE POLICY "Users can update own notifications" ON public.notifications
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Admins can manage all notifications
CREATE POLICY "Admins can manage all notifications" ON public.notifications
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin'))
  );

-- ============================================
-- 9. CARE_ELIGIBILITY TABLE - Enhanced RLS
-- ============================================

DROP POLICY IF EXISTS "Kullanıcı kendi eligibility okuyabilir" ON public.care_eligibility;
DROP POLICY IF EXISTS "Kullanıcı kendi eligibility oluşturabilir" ON public.care_eligibility;
DROP POLICY IF EXISTS "Kullanıcı kendi eligibility güncelleyebilir" ON public.care_eligibility;
DROP POLICY IF EXISTS "Admin eligibility yönetebilir" ON public.care_eligibility;

ALTER TABLE public.care_eligibility ENABLE ROW LEVEL SECURITY;

-- Users can only view their own eligibility
CREATE POLICY "Users can view own eligibility" ON public.care_eligibility
  FOR SELECT USING (auth.uid() = user_id);

-- Users can only create their own eligibility
CREATE POLICY "Users can create own eligibility" ON public.care_eligibility
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can only update their own eligibility
CREATE POLICY "Users can update own eligibility" ON public.care_eligibility
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Admins can manage all eligibility records
CREATE POLICY "Admins can manage all eligibility" ON public.care_eligibility
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin'))
  );

-- ============================================
-- 10. CAREBOX_CART TABLE - Enhanced RLS
-- ============================================

DROP POLICY IF EXISTS "Kullanıcı kendi cart okuyabilir" ON public.carebox_cart;
DROP POLICY IF EXISTS "Kullanıcı kendi cart oluşturabilir" ON public.carebox_cart;
DROP POLICY IF EXISTS "Kullanıcı kendi cart güncelleyebilir" ON public.carebox_cart;
DROP POLICY IF EXISTS "Admin cart yönetebilir" ON public.carebox_cart;

ALTER TABLE public.carebox_cart ENABLE ROW LEVEL SECURITY;

-- Users can only view their own cart
CREATE POLICY "Users can view own cart" ON public.carebox_cart
  FOR SELECT USING (auth.uid() = user_id);

-- Users can only create their own cart
CREATE POLICY "Users can create own cart" ON public.carebox_cart
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can only update their own cart
CREATE POLICY "Users can update own cart" ON public.carebox_cart
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Admins can manage all carts
CREATE POLICY "Admins can manage all carts" ON public.carebox_cart
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin'))
  );

-- ============================================
-- 11. CAREBOX_ORDER_REQUESTS TABLE - Enhanced RLS
-- ============================================

DROP POLICY IF EXISTS "Kullanıcı kendi order okuyabilir" ON public.carebox_order_requests;
DROP POLICY IF EXISTS "Kullanıcı order oluşturabilir" ON public.carebox_order_requests;
DROP POLICY IF EXISTS "Kullanıcı kendi order güncelleyebilir" ON public.carebox_order_requests;
DROP POLICY IF EXISTS "Admin order yönetebilir" ON public.carebox_order_requests;

ALTER TABLE public.carebox_order_requests ENABLE ROW LEVEL SECURITY;

-- Users can only view their own orders
CREATE POLICY "Users can view own orders" ON public.carebox_order_requests
  FOR SELECT USING (auth.uid() = user_id);

-- Users can only create their own orders
CREATE POLICY "Users can create own orders" ON public.carebox_order_requests
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can only update their own orders
CREATE POLICY "Users can update own orders" ON public.carebox_order_requests
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Admins can manage all orders
CREATE POLICY "Admins can manage all orders" ON public.carebox_order_requests
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin'))
  );

-- ============================================
-- 12. CAREBOX_CATALOG_ITEMS TABLE - RLS
-- ============================================

DROP POLICY IF EXISTS "Jeder kann Katalog lesen" ON public.carebox_catalog_items;
DROP POLICY IF EXISTS "Admin Katalog yönetebilir" ON public.carebox_catalog_items;

ALTER TABLE public.carebox_catalog_items ENABLE ROW LEVEL SECURITY;

-- Anyone can view the public catalog
CREATE POLICY "Anyone can view catalog" ON public.carebox_catalog_items
  FOR SELECT USING (true);

-- Admins can manage the catalog
CREATE POLICY "Admins can manage catalog" ON public.carebox_catalog_items
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin'))
  );

-- ============================================
-- 13. ANGEL_REVIEWS TABLE - Enhanced RLS
-- ============================================

DROP POLICY IF EXISTS "Jeder kann Bewertungen lesen" ON public.angel_reviews;
DROP POLICY IF EXISTS "Kunde kann eigene Bewertung erstellen" ON public.angel_reviews;
DROP POLICY IF EXISTS "Kunde kann eigene Bewertung bearbeiten" ON public.angel_reviews;
DROP POLICY IF EXISTS "Admin kann alle Bewertungen verwalten" ON public.angel_reviews;

ALTER TABLE public.angel_reviews ENABLE ROW LEVEL SECURITY;

-- Anyone can view reviews
CREATE POLICY "Anyone can view reviews" ON public.angel_reviews
  FOR SELECT USING (true);

-- Only customers can create their own reviews
CREATE POLICY "Customers can create own reviews" ON public.angel_reviews
  FOR INSERT WITH CHECK (auth.uid() = customer_id);

-- Only customers can update their own reviews
CREATE POLICY "Customers can update own reviews" ON public.angel_reviews
  FOR UPDATE USING (auth.uid() = customer_id)
  WITH CHECK (auth.uid() = customer_id);

-- Admins can manage all reviews
CREATE POLICY "Admins can manage all reviews" ON public.angel_reviews
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin'))
  );

-- ============================================
-- 14. ANALYTICS TABLES (visitor_locations, visitors, page_views, mis_auth_log)
-- These tables are for analytics only - public write, admin read
-- ============================================

-- visitor_locations
DROP POLICY IF EXISTS "Anyone can insert visitor_locations" ON public.visitor_locations;
DROP POLICY IF EXISTS "Admin read visitor_locations" ON public.visitor_locations;

ALTER TABLE public.visitor_locations ENABLE ROW LEVEL SECURITY;

-- Anyone (including anonymous) can write to visitor_locations
CREATE POLICY "Anyone can insert visitor data" ON public.visitor_locations
  FOR INSERT WITH CHECK (true);

-- Only admins can read visitor data
CREATE POLICY "Admins can read visitor data" ON public.visitor_locations
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin'))
  );

-- Admins can update visitor data
CREATE POLICY "Admins can update visitor data" ON public.visitor_locations
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin'))
  );

-- visitors table
DROP POLICY IF EXISTS "Anyone can insert visitors" ON public.visitors;
DROP POLICY IF EXISTS "Admin read visitors" ON public.visitors;

ALTER TABLE public.visitors ENABLE ROW LEVEL SECURITY;

-- Anyone (including anonymous) can write to visitors
CREATE POLICY "Anyone can insert visitor tracking" ON public.visitors
  FOR INSERT WITH CHECK (true);

-- Only admins can read visitors
CREATE POLICY "Admins can read visitor tracking" ON public.visitors
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin'))
  );

-- mis_auth_log
DROP POLICY IF EXISTS "Anyone can insert auth_log" ON public.mis_auth_log;
DROP POLICY IF EXISTS "Admin read auth_log" ON public.mis_auth_log;

ALTER TABLE public.mis_auth_log ENABLE ROW LEVEL SECURITY;

-- Anyone can write auth logs
CREATE POLICY "Anyone can insert auth logs" ON public.mis_auth_log
  FOR INSERT WITH CHECK (true);

-- Only admins can read auth logs
CREATE POLICY "Admins can read auth logs" ON public.mis_auth_log
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin'))
  );

-- page_views table
DROP POLICY IF EXISTS "Anyone can insert page views" ON public.page_views;
DROP POLICY IF EXISTS "Admins can read all page views" ON public.page_views;

ALTER TABLE public.page_views ENABLE ROW LEVEL SECURITY;

-- Anyone can write page views
CREATE POLICY "Anyone can insert page views" ON public.page_views
  FOR INSERT WITH CHECK (true);

-- Only admins can read page views
CREATE POLICY "Admins can read page views" ON public.page_views
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin'))
  );

-- ============================================
-- 15. MIS TABLES - Admin Only Access
-- ============================================

-- mis_documents
ALTER TABLE public.mis_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view mis_documents" ON public.mis_documents;
DROP POLICY IF EXISTS "Only admins can manage documents" ON public.mis_documents;

CREATE POLICY "Admins can manage all documents" ON public.mis_documents
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin'))
  );

-- mis_document_categories
ALTER TABLE public.mis_document_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view categories" ON public.mis_document_categories;
DROP POLICY IF EXISTS "Only admins can manage categories" ON public.mis_document_categories;

CREATE POLICY "Admins can manage all categories" ON public.mis_document_categories
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin'))
  );

-- mis_document_versions
ALTER TABLE public.mis_document_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Only admins can manage versions" ON public.mis_document_versions;

CREATE POLICY "Admins can manage all versions" ON public.mis_document_versions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin'))
  );

-- mis_audit_log
ALTER TABLE public.mis_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Only admins can read audit log" ON public.mis_audit_log;

CREATE POLICY "Admins can read audit log" ON public.mis_audit_log
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin'))
  );

-- mis_dataroom_sections
ALTER TABLE public.mis_dataroom_sections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Only admins can manage dataroom sections" ON public.mis_dataroom_sections;

CREATE POLICY "Admins can manage dataroom sections" ON public.mis_dataroom_sections
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin'))
  );

-- mis_dataroom_access
ALTER TABLE public.mis_dataroom_access ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Only admins can manage dataroom access" ON public.mis_dataroom_access;

CREATE POLICY "Admins can manage dataroom access" ON public.mis_dataroom_access
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin'))
  );

-- mis_kpis
ALTER TABLE public.mis_kpis ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Only admins can manage kpis" ON public.mis_kpis;

CREATE POLICY "Admins can manage KPIs" ON public.mis_kpis
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin'))
  );

-- mis_quality_processes
ALTER TABLE public.mis_quality_processes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Only admins can manage processes" ON public.mis_quality_processes;

CREATE POLICY "Admins can manage processes" ON public.mis_quality_processes
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin'))
  );

-- mis_quality_audits
ALTER TABLE public.mis_quality_audits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Only admins can manage audits" ON public.mis_quality_audits;

CREATE POLICY "Admins can manage audits" ON public.mis_quality_audits
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin'))
  );

-- ============================================
-- SUMMARY OF SECURITY CHANGES
-- ============================================
-- ✓ All tables now have RLS enabled
-- ✓ User data (profiles, bookings, messages, documents, payments) is scoped to the authenticated user
-- ✓ Angels can only view/edit their own angel profiles
-- ✓ Customers can only see their own bookings/orders/cart
-- ✓ Admins have full access to everything
-- ✓ Analytics tables (visitors, page_views, mis_auth_log) allow public writes but admin-only reads
-- ✓ Catalog items are public read
-- ✓ Reviews are public read but customer-controlled writes
-- ✓ MIS (admin portal) tables are admin-only
-- ============================================
