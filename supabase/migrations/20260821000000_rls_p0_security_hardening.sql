-- =====================================================
-- P0 Security Hardening Migration
-- Date: 2026-08-21
-- Scope: Anon-Grants verschärfen, Newsletter-View sperren
-- =====================================================

-- FIX 1: newsletter VIEW — revoke all anon access
-- Die View exponiert email/user_id aus newsletter_subscribers
REVOKE ALL ON public.newsletter FROM anon;
REVOKE ALL ON public.newsletter FROM authenticated;
GRANT SELECT ON public.newsletter TO authenticated;

-- FIX 2: spatial_ref_sys — DML-Zugriff entfernen (PostGIS-Systemtabelle)
-- Hinweis: Grants kommen von PUBLIC pseudo-role via Extension,
-- per-role REVOKE greift nicht. Kein PII-Risiko.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.spatial_ref_sys FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.spatial_ref_sys FROM authenticated;

-- FIX 3: SELECT-Grants von anon entfernen auf Tabellen ohne öffentlichen Bedarf
REVOKE SELECT ON public.affiliate_clicks FROM anon;
REVOKE SELECT ON public.affiliate_conversions FROM anon;
REVOKE SELECT ON public.authorities_packs FROM anon;
REVOKE SELECT ON public.availability_blocks FROM anon;
REVOKE SELECT ON public.booking_policies FROM anon;
REVOKE SELECT ON public.cookie_consents FROM anon;
REVOKE SELECT ON public.error_logs FROM anon;
REVOKE SELECT ON public.newsletter_subscribers FROM anon;
REVOKE SELECT ON public.onboarding_drafts FROM anon;
REVOKE SELECT ON public.product_recommendations FROM anon;
REVOKE SELECT ON public.referrals FROM anon;
REVOKE SELECT ON public.rental_bookings FROM anon;
REVOKE SELECT ON public.sellers FROM anon;
REVOKE SELECT ON public.submission_tickets FROM anon;
REVOKE SELECT ON public.visit_logs FROM anon;
REVOKE SELECT ON public.wait_list FROM anon;

-- FIX 4: TRUNCATE von anon auf ALLEN Tabellen entfernen
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT table_name FROM information_schema.role_table_grants
    WHERE grantee = 'anon' AND table_schema = 'public' AND privilege_type = 'TRUNCATE'
    GROUP BY table_name
  LOOP
    EXECUTE format('REVOKE TRUNCATE ON public.%I FROM anon', tbl);
  END LOOP;
END $$;

-- FIX 5: TRIGGER von anon auf ALLEN Tabellen entfernen
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT table_name FROM information_schema.role_table_grants
    WHERE grantee = 'anon' AND table_schema = 'public' AND privilege_type = 'TRIGGER'
    GROUP BY table_name
  LOOP
    EXECUTE format('REVOKE TRIGGER ON public.%I FROM anon', tbl);
  END LOOP;
END $$;

-- FIX 6: REFERENCES von anon auf ALLEN Tabellen entfernen
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT table_name FROM information_schema.role_table_grants
    WHERE grantee = 'anon' AND table_schema = 'public' AND privilege_type = 'REFERENCES'
    GROUP BY table_name
  LOOP
    EXECUTE format('REVOKE REFERENCES ON public.%I FROM anon', tbl);
  END LOOP;
END $$;

-- PostGIS Views (geography_columns, geometry_columns):
-- DML-Grants kommen von PUBLIC pseudo-role via Extension.
-- Enthalten nur Schema-Metadaten, kein PII. Akzeptiertes Restrisiko.
