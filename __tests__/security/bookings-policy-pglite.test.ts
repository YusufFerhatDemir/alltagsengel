/**
 * PGlite: Bookings RLS Policy Consolidation — In-Process-DB-Beweis
 *
 * Diese Tests laufen IN-PROCESS auf PGlite (WASM-Postgres) und beweisen,
 * dass die konsolidierten Bookings-Policies auf einer echten PostgreSQL-
 * Instanz korrekt funktionieren — ohne externe Shadow-DB.
 *
 * Getestete Szenarien (14):
 *   1. Customer sieht eigene Buchung ✓
 *   2. Angel sieht eigene Buchung ✓
 *   3. Unbeteiligter sieht KEINE Buchung ✓
 *   4. Soft-Delete Customer → Angel sieht Buchung NICHT mehr ✓
 *   5. Soft-Delete Angel → Customer sieht Buchung NICHT mehr ✓
 *   6. Soft-Delete Angel → Angel sieht eigene Buchung NICHT mehr ✓
 *   7. Admin sieht ALLE Buchungen (auch mit soft-deleted Partnern) ✓
 *   8. Soft-gelöschter Admin sieht NICHTS ✓
 *   9. INSERT als Customer funktioniert ✓
 *  10. UPDATE als beteiligte Partei funktioniert ✓
 *  11. Kein 42P17-Fehler ✓
 *  12. Idempotenz: Migration 2x anwenden → kein Fehler ✓
 */

import { PGlite } from '@electric-sql/pglite'
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// ═══════════════════════════════════════════════════════════════════
// Konstanten
// ═══════════════════════════════════════════════════════════════════

const MIGRATIONS_DIR = path.join(__dirname, '..', '..', 'supabase', 'migrations')
const MIGRATION_FILE = '20260803100000_consolidate_bookings_policies.sql'

const ORG_ID      = '00000000-aaaa-4000-8000-000000000001'
const CUSTOMER_ID = '11111111-aaaa-4000-8000-000000000001'
const ANGEL_ID    = '22222222-aaaa-4000-8000-000000000001'
const ADMIN_ID    = '33333333-aaaa-4000-8000-000000000001'
const OUTSIDER_ID = '44444444-aaaa-4000-8000-000000000001'
const BOOKING_ID  = '55555555-aaaa-4000-8000-000000000001'

describe('PGlite: Bookings RLS nach Policy-Konsolidierung', () => {
  let db: InstanceType<typeof PGlite>

  // ── Helper: Query als bestimmter User (SET LOCAL ROLE in TX) ──
  async function queryAs(
    userId: string,
    sql: string,
    params?: any[],
  ): Promise<{ rows: any[]; error?: any }> {
    try {
      const result = await db.transaction(async (tx) => {
        await tx.exec(
          `SET LOCAL ROLE authenticated;` +
          `SET LOCAL request.jwt.claims = '${JSON.stringify({
            sub: userId,
            role: 'authenticated',
            app_metadata: { org_id: ORG_ID },
          })}';`,
        )
        return tx.query(sql, params)
      })
      return { rows: result.rows }
    } catch (e: any) {
      return { rows: [], error: e }
    }
  }

  async function selectBookingsAs(userId: string): Promise<any[]> {
    const { rows } = await queryAs(
      userId,
      `SELECT * FROM public.bookings WHERE id = $1`,
      [BOOKING_ID],
    )
    return rows
  }

  async function softDelete(userId: string) {
    await db.query(
      `UPDATE public.profiles SET deleted_at = now() WHERE id = $1`,
      [userId],
    )
  }

  async function undelete(userId: string) {
    await db.query(
      `UPDATE public.profiles SET deleted_at = NULL WHERE id = $1`,
      [userId],
    )
  }

  // ── Setup ──────────────────────────────────────────────────────────
  beforeAll(async () => {
    db = new PGlite()

    // 1. Supabase-kompatible Rollen
    await db.exec(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
          CREATE ROLE anon NOLOGIN NOINHERIT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
          CREATE ROLE authenticated NOLOGIN NOINHERIT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
          CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
        END IF;
      END $$;
    `)

    // 2. auth-Schema + JWT-Helper (wie 00_supabase_bootstrap.sql)
    await db.exec(`
      CREATE SCHEMA IF NOT EXISTS auth;

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

      GRANT USAGE ON SCHEMA auth TO authenticated, anon, service_role;
      GRANT EXECUTE ON FUNCTION auth.jwt()  TO authenticated, anon, service_role;
      GRANT EXECUTE ON FUNCTION auth.uid()  TO authenticated, anon, service_role;
      GRANT EXECUTE ON FUNCTION auth.role() TO authenticated, anon, service_role;
    `)

    // 3. Default-Privilegien (wie Supabase — vor Tabellen-Erstellung)
    await db.exec(`
      GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public
        GRANT ALL ON TABLES    TO anon, authenticated, service_role;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public
        GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public
        GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
    `)

    // 4. Tabellen (Minimal-Schema für Bookings-Policy-Tests)
    await db.exec(`
      CREATE TABLE public.profiles (
        id uuid PRIMARY KEY,
        role text NOT NULL DEFAULT 'kunde',
        first_name text NOT NULL DEFAULT '',
        last_name text NOT NULL DEFAULT '',
        email text,
        deleted_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE public.angels (
        id uuid PRIMARY KEY REFERENCES public.profiles(id),
        hourly_rate numeric NOT NULL DEFAULT 30,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE public.organizations (
        id uuid PRIMARY KEY,
        name text NOT NULL DEFAULT 'Test Org',
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE public.organization_members (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES public.organizations(id),
        user_id uuid NOT NULL REFERENCES public.profiles(id),
        role text NOT NULL DEFAULT 'staff',
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (organization_id, user_id)
      );

      CREATE TABLE public.bookings (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        customer_id uuid REFERENCES public.profiles(id),
        angel_id uuid REFERENCES public.angels(id),
        service text NOT NULL,
        date date NOT NULL,
        time time,
        duration_hours numeric NOT NULL DEFAULT 1,
        status text NOT NULL DEFAULT 'pending',
        organization_id uuid NOT NULL REFERENCES public.organizations(id),
        is_flexible boolean NOT NULL DEFAULT false,
        notes text,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
    `)

    // 5. Helper-Funktionen (Voraussetzung für die Konsolidierungs-Migration)
    await db.exec(`
      CREATE OR REPLACE FUNCTION public.is_profile_soft_deleted(uid uuid)
      RETURNS boolean
      LANGUAGE sql STABLE SECURITY DEFINER
      SET search_path TO 'public'
      AS $$
        SELECT EXISTS (
          SELECT 1 FROM public.profiles
          WHERE id = uid AND deleted_at IS NOT NULL
        );
      $$;

      CREATE OR REPLACE FUNCTION public.is_admin()
      RETURNS boolean
      LANGUAGE sql STABLE SECURITY DEFINER
      SET search_path TO 'public'
      AS $$
        SELECT EXISTS (
          SELECT 1 FROM public.profiles
          WHERE id = auth.uid()
            AND role = ANY (ARRAY['admin','superadmin'])
            AND deleted_at IS NULL
        );
      $$;

      CREATE OR REPLACE FUNCTION public.current_org_id()
      RETURNS uuid
      LANGUAGE sql STABLE SECURITY DEFINER
      SET search_path = public
      AS $$
        SELECT COALESCE(
          NULLIF(auth.jwt() -> 'app_metadata' ->> 'org_id', '')::uuid,
          (SELECT om.organization_id
             FROM public.organization_members om
            WHERE om.user_id = auth.uid()
            ORDER BY om.created_at
            LIMIT 1),
          '00000000-0000-4000-8000-000460629986'::uuid
        );
      $$;

      GRANT EXECUTE ON FUNCTION public.is_profile_soft_deleted(uuid)
        TO authenticated, anon, service_role;
      GRANT EXECUTE ON FUNCTION public.is_admin()
        TO authenticated, anon, service_role;
      GRANT EXECUTE ON FUNCTION public.current_org_id()
        TO authenticated, anon, service_role;
    `)

    // 6. Konsolidierungs-Migration anwenden (die eigentliche Migration)
    const migrationSQL = fs.readFileSync(
      path.join(MIGRATIONS_DIR, MIGRATION_FILE),
      'utf-8',
    )
    await db.exec(migrationSQL)

    // 7. Explizite Grants (Sicherheitsnetz — falls DEFAULT PRIVILEGES
    //    nicht alle Tabellen erfasst hat)
    await db.exec(`
      GRANT ALL ON ALL TABLES IN SCHEMA public
        TO authenticated, anon, service_role;
    `)

    // 8. Testdaten (als Superuser → RLS umgangen)
    await db.exec(`
      INSERT INTO public.organizations (id, name)
        VALUES ('${ORG_ID}', 'Test Org');

      INSERT INTO public.profiles (id, role, first_name, last_name, email) VALUES
        ('${CUSTOMER_ID}', 'kunde',  'Test', 'Kunde',    'kunde@test.de'),
        ('${ANGEL_ID}',    'engel',  'Test', 'Engel',    'engel@test.de'),
        ('${ADMIN_ID}',    'admin',  'Test', 'Admin',    'admin@test.de'),
        ('${OUTSIDER_ID}', 'kunde',  'Test', 'Outsider', 'outsider@test.de');

      INSERT INTO public.angels (id, hourly_rate)
        VALUES ('${ANGEL_ID}', 25);

      INSERT INTO public.organization_members (organization_id, user_id, role) VALUES
        ('${ORG_ID}', '${CUSTOMER_ID}', 'staff'),
        ('${ORG_ID}', '${ANGEL_ID}',    'staff'),
        ('${ORG_ID}', '${ADMIN_ID}',    'admin'),
        ('${ORG_ID}', '${OUTSIDER_ID}', 'staff');

      INSERT INTO public.bookings
        (id, customer_id, angel_id, service, date, time, duration_hours,
         status, organization_id)
      VALUES
        ('${BOOKING_ID}', '${CUSTOMER_ID}', '${ANGEL_ID}',
         'alltagsbegleitung', '2026-08-01', '10:00', 2,
         'pending', '${ORG_ID}');
    `)
  }, 30_000)

  afterAll(async () => {
    if (db) await db.close()
  })

  // Soft-Deletes + Testdaten nach jedem Test zurücksetzen
  afterEach(async () => {
    await db.query(`UPDATE public.profiles SET deleted_at = NULL`)
    await db.query(`UPDATE public.bookings SET notes = NULL WHERE id = $1`, [BOOKING_ID])
    await db.query(`DELETE FROM public.bookings WHERE id != $1`, [BOOKING_ID])
  })

  // ═══════════════════════════════════════════════════════════════════
  // Tests
  // ═══════════════════════════════════════════════════════════════════

  it('1. Customer sieht eigene Buchung (aktive Profile)', async () => {
    const rows = await selectBookingsAs(CUSTOMER_ID)
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe(BOOKING_ID)
  })

  it('2. Angel sieht eigene Buchung (aktive Profile)', async () => {
    const rows = await selectBookingsAs(ANGEL_ID)
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe(BOOKING_ID)
  })

  it('3. Unbeteiligter sieht KEINE fremde Buchung', async () => {
    const rows = await selectBookingsAs(OUTSIDER_ID)
    expect(rows).toHaveLength(0)
  })

  it('4. Soft-Delete Customer → Angel sieht Buchung NICHT mehr', async () => {
    await softDelete(CUSTOMER_ID)
    const rows = await selectBookingsAs(ANGEL_ID)
    expect(rows).toHaveLength(0)
  })

  it('5. Soft-Delete Angel → Customer sieht Buchung NICHT mehr', async () => {
    await softDelete(ANGEL_ID)
    const rows = await selectBookingsAs(CUSTOMER_ID)
    expect(rows).toHaveLength(0)
  })

  it('6. Soft-Delete Angel → Angel sieht eigene Buchung NICHT mehr', async () => {
    await softDelete(ANGEL_ID)
    const rows = await selectBookingsAs(ANGEL_ID)
    expect(rows).toHaveLength(0)
  })

  it('7. Admin sieht ALLE Buchungen (auch mit soft-deleted Partnern)', async () => {
    await softDelete(ANGEL_ID)
    const rows = await selectBookingsAs(ADMIN_ID)
    expect(rows.length).toBeGreaterThanOrEqual(1)
  })

  it('8. Soft-gelöschter Admin sieht NICHTS', async () => {
    await softDelete(ADMIN_ID)
    const rows = await selectBookingsAs(ADMIN_ID)
    expect(rows).toHaveLength(0)
  })

  it('9. INSERT: Customer kann eine Buchung erstellen', async () => {
    const newId = '66666666-aaaa-4000-8000-000000000001'
    const { error } = await queryAs(CUSTOMER_ID, `
      INSERT INTO public.bookings
        (id, customer_id, angel_id, service, date, time,
         duration_hours, status, organization_id)
      VALUES ($1, $2, $3, 'alltagsbegleitung', '2026-08-02', '14:00',
              1, 'pending', $4)
    `, [newId, CUSTOMER_ID, ANGEL_ID, ORG_ID])
    expect(error).toBeUndefined()

    // Verifizieren: Buchung existiert
    const { rows } = await queryAs(CUSTOMER_ID,
      `SELECT id FROM public.bookings WHERE id = $1`, [newId])
    expect(rows).toHaveLength(1)
  })

  it('10. UPDATE: Beteiligte Partei kann eigene Buchung aktualisieren', async () => {
    const { error } = await queryAs(CUSTOMER_ID, `
      UPDATE public.bookings SET notes = 'PGlite-Testnotiz'
      WHERE id = $1
    `, [BOOKING_ID])
    expect(error).toBeUndefined()

    // Verifizieren (als Superuser)
    const result = await db.query(
      `SELECT notes FROM public.bookings WHERE id = $1`,
      [BOOKING_ID],
    )
    expect((result.rows[0] as any).notes).toBe('PGlite-Testnotiz')
  })

  it('11. Kein 42P17-Fehler (Infinite Recursion) bei SELECT', async () => {
    const { error } = await queryAs(CUSTOMER_ID,
      `SELECT * FROM public.bookings LIMIT 1`)
    if (error) {
      // PostgreSQL Error-Code 42P17 = infinite recursion in policy
      expect(error.code).not.toBe('42P17')
    }
    // Kein Fehler = Test bestanden
    expect(error).toBeUndefined()
  })

  it('12. Idempotenz: Migration 2x hintereinander anwenden → kein Fehler', async () => {
    const migrationSQL = fs.readFileSync(
      path.join(MIGRATIONS_DIR, MIGRATION_FILE),
      'utf-8',
    )
    // Zweite Anwendung (erste war im beforeAll)
    let idempotencyError: any
    try {
      await db.exec(migrationSQL)
    } catch (e) {
      idempotencyError = e
    }
    expect(
      idempotencyError,
      'Migration ist NICHT idempotent — CREATE POLICY schlägt beim Re-Run fehl',
    ).toBeUndefined()
  })

  it('13. Nach Idempotenz-Replay: Policies funktionieren weiterhin', async () => {
    // Nach Test 12 sollten die Policies noch korrekt sein
    const customerRows = await selectBookingsAs(CUSTOMER_ID)
    expect(customerRows).toHaveLength(1)

    const outsiderRows = await selectBookingsAs(OUTSIDER_ID)
    expect(outsiderRows).toHaveLength(0)
  })

  it('14. Soft-gelöschter Customer kann NICHT inserieren', async () => {
    await softDelete(CUSTOMER_ID)
    const { error } = await queryAs(CUSTOMER_ID, `
      INSERT INTO public.bookings
        (id, customer_id, angel_id, service, date, time,
         duration_hours, status, organization_id)
      VALUES ($1, $2, $3, 'alltagsbegleitung', '2026-08-03', '09:00',
              1, 'pending', $4)
    `, [
      '77777777-aaaa-4000-8000-000000000001',
      CUSTOMER_ID, ANGEL_ID, ORG_ID,
    ])
    expect(error).toBeDefined()
  })
})
