-- ════════════════════════════════════════════════════════════════════
-- BASELINE-NACHTRAG: Live-only-Spalten + Storage-Bucket `abrechnung`
-- ════════════════════════════════════════════════════════════════════
--
-- Schließt die letzten beim Schema-Gap-Audit 2026-08-02 gefundenen
-- Lücken zwischen Live-Schema (nnwyktkqibdjxgimjyuq, PostgREST-OpenAPI-
-- Introspektion) und Repo-Aufbau (siehe audit/DATABASE_SCHEMA_GAP_REPORT.md):
--
--   1. 20 Spalten auf 4 Tabellen, die nur live existierten (im Dashboard
--      ergänzt, nie als Migration committet) — v. a. UTM-/Geo-Tracking
--      auf visitors sowie bookings.care_recipient_id.
--   2. Der Storage-Bucket `abrechnung` (live seit Juli 2026, privat) —
--      die drei anderen Live-Buckets (mis-documents, service-proofs,
--      verordnungen) legen ihre Migrationen bereits selbst an.
--
-- Alles idempotent (ADD COLUMN IF NOT EXISTS / ON CONFLICT DO NOTHING);
-- auf der Live-DB wäre die Datei ein No-Op. Sie wurde dort NICHT angewendet.

BEGIN;

-- 1) bookings — Verknüpfung zu care_recipients + Flex-Flag
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS care_recipient_id uuid REFERENCES public.care_recipients(id) ON DELETE SET NULL;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS is_flexible boolean NOT NULL DEFAULT false;

-- 2) lead_inquiries — Service-Zuordnung + Kampagnen-Quelle
ALTER TABLE public.lead_inquiries ADD COLUMN IF NOT EXISTS service    text;
ALTER TABLE public.lead_inquiries ADD COLUMN IF NOT EXISTS utm_source text;

-- 3) page_views — IP für Abuse-Analyse
ALTER TABLE public.page_views ADD COLUMN IF NOT EXISTS ip_address text;

-- 4) visitors — Geo-/UTM-Tracking-Spalten
ALTER TABLE public.visitors ADD COLUMN IF NOT EXISTS district     text;
ALTER TABLE public.visitors ADD COLUMN IF NOT EXISTS fbclid       text;
ALTER TABLE public.visitors ADD COLUMN IF NOT EXISTS gclid        text;
ALTER TABLE public.visitors ADD COLUMN IF NOT EXISTS isp          text;
ALTER TABLE public.visitors ADD COLUMN IF NOT EXISTS landing_page text;
ALTER TABLE public.visitors ADD COLUMN IF NOT EXISTS latitude     double precision;
ALTER TABLE public.visitors ADD COLUMN IF NOT EXISTS longitude    double precision;
ALTER TABLE public.visitors ADD COLUMN IF NOT EXISTS org          text;
ALTER TABLE public.visitors ADD COLUMN IF NOT EXISTS postal_code  text;
ALTER TABLE public.visitors ADD COLUMN IF NOT EXISTS timezone     text;
ALTER TABLE public.visitors ADD COLUMN IF NOT EXISTS utm_campaign text;
ALTER TABLE public.visitors ADD COLUMN IF NOT EXISTS utm_content  text;
ALTER TABLE public.visitors ADD COLUMN IF NOT EXISTS utm_medium   text;
ALTER TABLE public.visitors ADD COLUMN IF NOT EXISTS utm_source   text;
ALTER TABLE public.visitors ADD COLUMN IF NOT EXISTS utm_term     text;

-- 5) Storage-Bucket `abrechnung` (privat — Zugriff nur via service_role,
--    wie bei den übrigen Abrechnungs-Artefakten; Objekt-Policies bewusst
--    keine: kein anon-/authenticated-Zugriff vorgesehen)
INSERT INTO storage.buckets (id, name, public)
VALUES ('abrechnung', 'abrechnung', false)
ON CONFLICT (id) DO NOTHING;

COMMIT;
