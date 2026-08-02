-- ════════════════════════════════════════════════════════════════════
-- SHADOW-DB BOOTSTRAP — Supabase-Plattform-Emulation für lokales Postgres
-- ════════════════════════════════════════════════════════════════════
--
-- NUR FÜR TESTDATENBANKEN. Diese Datei liegt bewusst NICHT in
-- supabase/migrations/, damit sie niemals gegen ein echtes Supabase-
-- Projekt angewendet wird — dort existieren Rollen, auth- und storage-
-- Schema bereits und werden von der Plattform verwaltet.
--
-- Zweck: ein nacktes `postgres`-Cluster so weit an Supabase angleichen,
-- dass supabase/initial-setup.sql + supabase/migrations/*.sql ohne
-- Änderung durchlaufen. Nachgebildet wird nur, worauf das Repo
-- tatsächlich zugreift (per grep verifiziert):
--   auth.uid()  ·  auth.role()  ·  auth.jwt()  ·  auth.users
--   storage.buckets  ·  storage.objects
--
-- Die JWT-Claims werden über die GUC `request.jwt.claims` gesetzt —
-- exakt wie PostgREST es in Supabase tut. Damit verhalten sich RLS-
-- Policies in der Shadow-DB wie in der echten Umgebung.
-- ════════════════════════════════════════════════════════════════════

-- ── Rollen (in Supabase von der Plattform angelegt) ──
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    -- service_role umgeht RLS — wie in Supabase (BYPASSRLS).
    CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator') THEN
    CREATE ROLE authenticator NOINHERIT LOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    CREATE ROLE supabase_auth_admin NOLOGIN NOINHERIT;
  END IF;
END $$;

GRANT anon, authenticated, service_role TO authenticator;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS storage;
CREATE SCHEMA IF NOT EXISTS extensions;

GRANT USAGE ON SCHEMA public  TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA auth    TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;

-- ── Default-Privilegien wie in Supabase ──────────────────────────────
-- Supabase vergibt auf jede neu angelegte Tabelle in `public`
-- automatisch Rechte an anon/authenticated/service_role; die eigentliche
-- Zugriffskontrolle macht RLS, nicht das GRANT-System.
--
-- Ohne diese Zeilen scheitert jeder Zugriff schon an "permission denied
-- for table …" — RLS-Policies würden nie ausgewertet und Isolationstests
-- wären falsch-grün (0 Zeilen aus dem richtigen Grund ist nicht dasselbe
-- wie 0 Zeilen mangels Leserecht).
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES    TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;

-- ── auth.users (minimal, aber FK-kompatibel zu public.profiles) ──
CREATE TABLE IF NOT EXISTS auth.users (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email               text UNIQUE,
    encrypted_password  text,
    raw_user_meta_data  jsonb DEFAULT '{}'::jsonb,
    raw_app_meta_data   jsonb DEFAULT '{}'::jsonb,
    created_at          timestamptz DEFAULT now(),
    updated_at          timestamptz DEFAULT now()
);

-- ── auth-Helper: lesen dieselbe GUC wie PostgREST sie setzt ──
CREATE OR REPLACE FUNCTION auth.jwt()
RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb,
    '{}'::jsonb
  );
$$;

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(auth.jwt() ->> 'sub', '')::uuid;
$$;

CREATE OR REPLACE FUNCTION auth.role()
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT coalesce(auth.jwt() ->> 'role', current_setting('role', true));
$$;

CREATE OR REPLACE FUNCTION auth.email()
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT auth.jwt() ->> 'email';
$$;

GRANT EXECUTE ON FUNCTION auth.jwt(), auth.uid(), auth.role(), auth.email()
  TO anon, authenticated, service_role;
GRANT SELECT ON auth.users TO service_role;

-- ── storage (nur die zwei Tabellen, die das Repo anfasst) ──
CREATE TABLE IF NOT EXISTS storage.buckets (
    id                 text PRIMARY KEY,
    name               text NOT NULL,
    owner              uuid,
    public             boolean DEFAULT false,
    file_size_limit    bigint,
    allowed_mime_types text[],
    created_at         timestamptz DEFAULT now(),
    updated_at         timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS storage.objects (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    bucket_id        text REFERENCES storage.buckets(id),
    name             text,
    owner            uuid,
    metadata         jsonb,
    path_tokens      text[] GENERATED ALWAYS AS (string_to_array(name, '/')) STORED,
    created_at       timestamptz DEFAULT now(),
    updated_at       timestamptz DEFAULT now(),
    last_accessed_at timestamptz DEFAULT now(),
    UNIQUE (bucket_id, name)
);

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;

-- storage.foldername() — von Supabase-Storage-Policies häufig benutzt
CREATE OR REPLACE FUNCTION storage.foldername(name text)
RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT (string_to_array(name, '/'))[1 : array_length(string_to_array(name, '/'), 1) - 1];
$$;

GRANT ALL ON storage.buckets, storage.objects TO service_role;
GRANT SELECT ON storage.buckets TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO anon, authenticated;
