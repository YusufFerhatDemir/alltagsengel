/**
 * PGlite: HOCH-1 Mandantentrennung — In-Process-DB-Beweis
 *
 * Security-Audit 2026-08-19, HOCH-1: 82 von 298 Tabellen hatten keine
 * organization_id; bei 52 war die einzige Admin-Policy ein org-blindes
 * `is_admin()`. Ein Administrator einer beliebigen Organisation sah dort die
 * Daten ALLER Organisationen.
 *
 * Diese Suite laesst 20260922020000_hoch1_mandantentrennung.sql gegen eine
 * echte PostgreSQL-Instanz (PGlite/WASM) laufen und misst die Wirkung:
 *
 *   TEIL 1 — current_org_id() loest jetzt auch ueber caregivers und clients auf
 *   TEIL 2 — RESTRICTIVE org_fence auf den Fence-Tabellen
 *   TEIL 3 — verengte Admin-Policies auf profiles/angels/messages/…
 *   + Gegenprobe: Selbstzugriff der Nutzer bleibt unberuehrt
 *   + Idempotenz: zweimaliges Anwenden ist fehlerfrei
 *
 * Bewusst NICHT gemockt: die Policies werden von Postgres selbst ausgewertet.
 * Eine Fake-DB wuerde genau die Fehlerklasse uebersehen, um die es hier geht.
 */

import { PGlite } from '@electric-sql/pglite'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const MIGRATIONS_DIR = path.join(__dirname, '..', '..', 'supabase', 'migrations')
const MIGRATION_FILE = '20260922020000_hoch1_mandantentrennung.sql'

const STAMM_ORG = '00000000-0000-4000-8000-000460629986'
const ORG_A     = 'aaaaaaaa-0000-4000-8000-000000000001'
const ORG_B     = 'bbbbbbbb-0000-4000-8000-000000000001'

const ADMIN_A     = '11111111-0000-4000-8000-000000000001'
const ADMIN_B     = '22222222-0000-4000-8000-000000000001'
const ENGEL_A     = '33333333-0000-4000-8000-000000000001'
const KUNDE_B     = '44444444-0000-4000-8000-000000000001'
const NEULING     = '55555555-0000-4000-8000-000000000001' // ohne jede Org-Bindung

type Zeile = Record<string, unknown>
type Fehler = { code?: string; message?: string } | undefined

describe('PGlite: HOCH-1 Mandantentrennung', () => {
  let db: InstanceType<typeof PGlite>

  async function alsNutzer(userId: string, sql: string, params?: unknown[]) {
    try {
      const result = await db.transaction(async (tx) => {
        await tx.exec(
          `SET LOCAL ROLE authenticated;` +
          `SET LOCAL request.jwt.claims = '${JSON.stringify({ sub: userId, role: 'authenticated' })}';`,
        )
        return tx.query(sql, params)
      })
      return { rows: result.rows as Zeile[], error: undefined as Fehler }
    } catch (e: unknown) {
      return { rows: [] as Zeile[], error: e as Fehler }
    }
  }

  async function orgVon(userId: string): Promise<string | null> {
    const { rows } = await alsNutzer(userId, 'SELECT public.current_org_id() AS org')
    return (rows[0]?.org as string | undefined) ?? null
  }

  beforeAll(async () => {
    db = new PGlite()

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

    await db.exec(`
      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
        SELECT coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
      $$;
      CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
        SELECT nullif(auth.jwt() ->> 'sub', '')::uuid;
      $$;
      CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
        SELECT coalesce(auth.jwt() ->> 'role', current_setting('role', true));
      $$;
      GRANT USAGE ON SCHEMA auth TO authenticated, anon, service_role;
      GRANT EXECUTE ON FUNCTION auth.jwt()  TO authenticated, anon, service_role;
      GRANT EXECUTE ON FUNCTION auth.uid()  TO authenticated, anon, service_role;
      GRANT EXECUTE ON FUNCTION auth.role() TO authenticated, anon, service_role;

      GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES    TO anon, authenticated, service_role;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
    `)

    // ── Schema (Ausschnitt, so nah wie noetig an Produktion) ──────────────
    await db.exec(`
      CREATE TABLE public.organizations (
        id uuid PRIMARY KEY,
        name text NOT NULL DEFAULT 'Org',
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE public.profiles (
        id uuid PRIMARY KEY,
        role text NOT NULL DEFAULT 'kunde',
        first_name text NOT NULL DEFAULT '',
        last_name text NOT NULL DEFAULT '',
        email text,
        deleted_at timestamptz,
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

      CREATE TABLE public.caregivers (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid REFERENCES public.profiles(id),
        organization_id uuid REFERENCES public.organizations(id),
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE public.clients (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid REFERENCES public.profiles(id),
        organization_id uuid REFERENCES public.organizations(id),
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE public.angels (
        id uuid PRIMARY KEY REFERENCES public.profiles(id),
        hourly_rate numeric NOT NULL DEFAULT 30
      );

      CREATE TABLE public.angel_availability (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        angel_id uuid NOT NULL REFERENCES public.profiles(id),
        wochentag int NOT NULL DEFAULT 1,
        von time NOT NULL DEFAULT '08:00',
        bis time NOT NULL DEFAULT '16:00'
      );

      CREATE TABLE public.messages (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        booking_id uuid,
        sender_id uuid NOT NULL REFERENCES public.profiles(id),
        receiver_id uuid REFERENCES public.profiles(id),
        content text NOT NULL DEFAULT '',
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE public.notifications (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES public.profiles(id),
        title text NOT NULL DEFAULT '',
        is_read boolean NOT NULL DEFAULT false
      );

      CREATE TABLE public.referrals (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        referrer_id uuid NOT NULL REFERENCES public.profiles(id),
        referred_id uuid REFERENCES public.profiles(id)
      );

      -- Fence-Tabelle aus der org_fence-Klasse
      CREATE TABLE public.krankenfahrten (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        customer_id uuid REFERENCES public.profiles(id),
        ziel text NOT NULL DEFAULT '',
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE public.lead_inquiries (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email text NOT NULL DEFAULT '',
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `)

    // ── is_admin() + current_org_id() im Zustand VOR der Migration ────────
    await db.exec(`
      CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean
      LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
        SELECT EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid() AND p.role IN ('admin','superadmin')
        );
      $$;

      CREATE OR REPLACE FUNCTION public.current_org_id() RETURNS uuid
      LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
        SELECT COALESCE(
          NULLIF(auth.jwt() -> 'app_metadata' ->> 'org_id', '')::uuid,
          (SELECT om.organization_id FROM public.organization_members om
            WHERE om.user_id = auth.uid() ORDER BY om.created_at LIMIT 1),
          '${STAMM_ORG}'::uuid
        );
      $$;
      GRANT EXECUTE ON FUNCTION public.is_admin()      TO anon, authenticated, service_role;
      GRANT EXECUTE ON FUNCTION public.current_org_id() TO anon, authenticated, service_role;
    `)

    // ── Policies im Zustand VOR der Migration (org-blindes is_admin()) ────
    await db.exec(`
      ALTER TABLE public.profiles           ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.angels             ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.angel_availability ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.messages           ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.notifications      ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.referrals          ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.krankenfahrten     ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.lead_inquiries     ENABLE ROW LEVEL SECURITY;

      CREATE POLICY "profiles_select_own"   ON public.profiles FOR SELECT TO public USING (auth.uid() = id);
      CREATE POLICY "profiles_select_admin" ON public.profiles FOR SELECT TO public USING (is_admin());
      CREATE POLICY "Admins can manage all profiles" ON public.profiles FOR ALL TO public USING (is_admin());
      CREATE POLICY "Admin can delete profiles"      ON public.profiles FOR DELETE TO public USING (is_admin());
      CREATE POLICY "Admin can update all profiles"  ON public.profiles FOR UPDATE TO public USING ((auth.uid() = id) OR is_admin());

      CREATE POLICY "Admin engelleri yönetebilir" ON public.angels FOR ALL TO public USING (is_admin());

      CREATE POLICY "angel_availability_select" ON public.angel_availability FOR SELECT TO authenticated USING (true);
      CREATE POLICY "angel_availability_delete" ON public.angel_availability FOR DELETE TO authenticated USING ((angel_id = auth.uid()) OR is_admin());
      CREATE POLICY "angel_availability_insert" ON public.angel_availability FOR INSERT TO authenticated WITH CHECK ((angel_id = auth.uid()) OR is_admin());
      CREATE POLICY "angel_availability_update" ON public.angel_availability FOR UPDATE TO authenticated USING ((angel_id = auth.uid()) OR is_admin()) WITH CHECK ((angel_id = auth.uid()) OR is_admin());

      CREATE POLICY "messages_admin_all" ON public.messages FOR ALL TO authenticated USING (is_admin());
      CREATE POLICY "messages_select_sender_or_receiver" ON public.messages FOR SELECT TO authenticated
        USING ((auth.uid() = sender_id) OR (auth.uid() = receiver_id));

      CREATE POLICY "notifications_admin_all"  ON public.notifications FOR ALL TO authenticated USING (is_admin());
      CREATE POLICY "notifications_select_own" ON public.notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);

      CREATE POLICY "Admins sehen alle Referrals" ON public.referrals FOR SELECT TO authenticated USING (is_admin());

      CREATE POLICY "krankenfahrten_admin_all" ON public.krankenfahrten FOR ALL TO authenticated USING (is_admin());
      CREATE POLICY "lead_inquiries_admin_all" ON public.lead_inquiries FOR ALL TO authenticated USING (is_admin());
    `)

    // ── Testdaten ────────────────────────────────────────────────────────
    await db.exec(`
      INSERT INTO public.organizations (id, name) VALUES
        ('${STAMM_ORG}', 'Alltagsengel'),
        ('${ORG_A}', 'Mandant A'),
        ('${ORG_B}', 'Mandant B');

      INSERT INTO public.profiles (id, role, first_name) VALUES
        ('${ADMIN_A}', 'admin', 'AdminA'),
        ('${ADMIN_B}', 'admin', 'AdminB'),
        ('${ENGEL_A}', 'engel', 'EngelA'),
        ('${KUNDE_B}', 'kunde', 'KundeB'),
        ('${NEULING}', 'kunde', 'Neuling');

      INSERT INTO public.organization_members (organization_id, user_id, role) VALUES
        ('${ORG_A}', '${ADMIN_A}', 'owner'),
        ('${ORG_B}', '${ADMIN_B}', 'owner');

      -- Engel haengt NUR ueber caregivers an Org A, Kunde NUR ueber clients an Org B
      INSERT INTO public.caregivers (user_id, organization_id) VALUES ('${ENGEL_A}', '${ORG_A}');
      INSERT INTO public.clients    (user_id, organization_id) VALUES ('${KUNDE_B}', '${ORG_B}');

      INSERT INTO public.angels (id) VALUES ('${ENGEL_A}');
      INSERT INTO public.angel_availability (angel_id) VALUES ('${ENGEL_A}');
      INSERT INTO public.messages (sender_id, receiver_id, content) VALUES ('${ENGEL_A}', '${KUNDE_B}', 'hallo');
      INSERT INTO public.notifications (user_id, title) VALUES ('${KUNDE_B}', 'Termin');
      INSERT INTO public.referrals (referrer_id, referred_id) VALUES ('${ENGEL_A}', '${NEULING}');
      INSERT INTO public.krankenfahrten (customer_id, ziel) VALUES ('${KUNDE_B}', 'Klinik');
    `)
  })

  afterAll(async () => { await db?.close() })

  // ── Ausgangslage: der Befund selbst ────────────────────────────────────
  it('VORHER: Admin aus Org B sieht die Profile aller Organisationen (der Befund)', async () => {
    const { rows } = await alsNutzer(ADMIN_B, `SELECT id FROM public.profiles WHERE id = $1`, [ENGEL_A])
    expect(rows).toHaveLength(1)
  })

  it('VORHER: Admin aus Org B sieht fremde Krankenfahrten', async () => {
    const { rows } = await alsNutzer(ADMIN_B, `SELECT id FROM public.krankenfahrten`)
    expect(rows.length).toBeGreaterThan(0)
  })

  // ── Migration anwenden ────────────────────────────────────────────────
  it('Migration laeuft fehlerfrei durch', async () => {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, MIGRATION_FILE), 'utf8')
    await expect(db.exec(sql)).resolves.toBeDefined()
  })

  // ── TEIL 1: current_org_id() ──────────────────────────────────────────
  describe('TEIL 1 — current_org_id() loest ueber caregivers und clients auf', () => {
    it('Admin mit organization_members → dessen Org', async () => {
      expect(await orgVon(ADMIN_A)).toBe(ORG_A)
      expect(await orgVon(ADMIN_B)).toBe(ORG_B)
    })

    it('Engel ohne Mitgliedschaft → Org aus caregivers (vorher: Stamm-Org)', async () => {
      expect(await orgVon(ENGEL_A)).toBe(ORG_A)
    })

    it('Kunde ohne Mitgliedschaft → Org aus clients (vorher: Stamm-Org)', async () => {
      expect(await orgVon(KUNDE_B)).toBe(ORG_B)
    })

    it('Nutzer ohne jede Bindung → Stamm-Org (Fallback bleibt bewusst)', async () => {
      expect(await orgVon(NEULING)).toBe(STAMM_ORG)
    })
  })

  // ── TEIL 3: verengte Admin-Policies ───────────────────────────────────
  describe('TEIL 3 — Admin-Policies sind nicht mehr org-blind', () => {
    it('profiles: Admin aus Org B sieht den Engel aus Org A NICHT mehr', async () => {
      const { rows } = await alsNutzer(ADMIN_B, `SELECT id FROM public.profiles WHERE id = $1`, [ENGEL_A])
      expect(rows).toHaveLength(0)
    })

    it('profiles: Admin aus Org A sieht den eigenen Engel weiterhin', async () => {
      const { rows } = await alsNutzer(ADMIN_A, `SELECT id FROM public.profiles WHERE id = $1`, [ENGEL_A])
      expect(rows).toHaveLength(1)
    })

    it('profiles: Admin aus Org B sieht den eigenen Kunden weiterhin', async () => {
      const { rows } = await alsNutzer(ADMIN_B, `SELECT id FROM public.profiles WHERE id = $1`, [KUNDE_B])
      expect(rows).toHaveLength(1)
    })

    it('profiles: bindungslose Nutzer bleiben fuer jeden Admin sichtbar (dokumentierter Restpunkt)', async () => {
      const a = await alsNutzer(ADMIN_A, `SELECT id FROM public.profiles WHERE id = $1`, [NEULING])
      const b = await alsNutzer(ADMIN_B, `SELECT id FROM public.profiles WHERE id = $1`, [NEULING])
      expect(a.rows).toHaveLength(1)
      expect(b.rows).toHaveLength(1)
    })

    it('profiles: Selbstzugriff bleibt unberuehrt', async () => {
      const { rows } = await alsNutzer(KUNDE_B, `SELECT id FROM public.profiles WHERE id = $1`, [KUNDE_B])
      expect(rows).toHaveLength(1)
    })

    it('profiles: kein 42P17 (keine Policy-Rekursion)', async () => {
      const { error } = await alsNutzer(ADMIN_A, `SELECT count(*) FROM public.profiles`)
      expect(error?.code).not.toBe('42P17')
    })

    it('angels: Admin aus Org B sieht den Engel aus Org A nicht', async () => {
      const b = await alsNutzer(ADMIN_B, `SELECT id FROM public.angels`)
      const a = await alsNutzer(ADMIN_A, `SELECT id FROM public.angels`)
      expect(b.rows).toHaveLength(0)
      expect(a.rows).toHaveLength(1)
    })

    it('angel_availability: Engel bearbeitet seine eigenen Zeiten weiterhin', async () => {
      const { error } = await alsNutzer(
        ENGEL_A,
        `UPDATE public.angel_availability SET wochentag = 2 WHERE angel_id = $1`,
        [ENGEL_A],
      )
      expect(error).toBeUndefined()
    })

    it('angel_availability: fremder Admin darf nicht mehr loeschen', async () => {
      await alsNutzer(ADMIN_B, `DELETE FROM public.angel_availability WHERE angel_id = $1`, [ENGEL_A])
      const { rows } = await db.query(`SELECT id FROM public.angel_availability`)
      expect(rows).toHaveLength(1)
    })

    it('messages: fremder Admin sieht die Nachricht nicht mehr, eigener schon', async () => {
      const b = await alsNutzer(ADMIN_B, `SELECT id FROM public.messages`)
      const a = await alsNutzer(ADMIN_A, `SELECT id FROM public.messages`)
      expect(b.rows).toHaveLength(0)
      expect(a.rows).toHaveLength(1)
    })

    it('messages: Beteiligte lesen ihre Nachricht weiterhin', async () => {
      const { rows } = await alsNutzer(KUNDE_B, `SELECT id FROM public.messages`)
      expect(rows).toHaveLength(1)
    })

    it('notifications: fremder Admin sieht sie nicht, Empfaenger schon', async () => {
      const a = await alsNutzer(ADMIN_A, `SELECT id FROM public.notifications`)
      const b = await alsNutzer(ADMIN_B, `SELECT id FROM public.notifications`)
      const eigen = await alsNutzer(KUNDE_B, `SELECT id FROM public.notifications`)
      expect(a.rows).toHaveLength(0)
      expect(b.rows).toHaveLength(1)
      expect(eigen.rows).toHaveLength(1)
    })

    it('referrals: nur der Admin der Werber-Org sieht die Zeile', async () => {
      const a = await alsNutzer(ADMIN_A, `SELECT id FROM public.referrals`)
      const b = await alsNutzer(ADMIN_B, `SELECT id FROM public.referrals`)
      expect(a.rows).toHaveLength(1)
      expect(b.rows).toHaveLength(0)
    })
  })

  // ── TEIL 2: RESTRICTIVE org_fence ─────────────────────────────────────
  describe('TEIL 2 — org_fence auf den Fence-Tabellen', () => {
    it('krankenfahrten hat eine organization_id mit Backfill auf die Stamm-Org', async () => {
      const { rows } = await db.query(`SELECT organization_id FROM public.krankenfahrten`)
      expect(rows).toHaveLength(1)
      expect((rows[0] as Zeile).organization_id).toBe(STAMM_ORG)
    })

    it('der Fence ist RESTRICTIVE', async () => {
      const { rows } = await db.query(
        `SELECT permissive FROM pg_policies WHERE tablename = 'krankenfahrten' AND policyname = 'krankenfahrten_org_fence'`,
      )
      expect(rows).toHaveLength(1)
      expect((rows[0] as Zeile).permissive).toBe('RESTRICTIVE')
    })

    it('Admin aus Org A/B sieht die Stamm-Org-Fahrt nicht mehr', async () => {
      const a = await alsNutzer(ADMIN_A, `SELECT id FROM public.krankenfahrten`)
      const b = await alsNutzer(ADMIN_B, `SELECT id FROM public.krankenfahrten`)
      expect(a.rows).toHaveLength(0)
      expect(b.rows).toHaveLength(0)
    })

    it('neue Zeilen bekommen die Org des Schreibenden per DEFAULT', async () => {
      await alsNutzer(ADMIN_A, `INSERT INTO public.krankenfahrten (ziel) VALUES ('Praxis A')`)
      const { rows } = await db.query(
        `SELECT organization_id FROM public.krankenfahrten WHERE ziel = 'Praxis A'`,
      )
      expect(rows).toHaveLength(1)
      expect((rows[0] as Zeile).organization_id).toBe(ORG_A)
    })

    it('der fremde Admin sieht diese neue Zeile nicht', async () => {
      const { rows } = await alsNutzer(ADMIN_B, `SELECT id FROM public.krankenfahrten WHERE ziel = 'Praxis A'`)
      expect(rows).toHaveLength(0)
    })

    it('ein Schreibversuch in eine fremde Org wird abgewiesen', async () => {
      const { error } = await alsNutzer(
        ADMIN_A,
        `INSERT INTO public.krankenfahrten (ziel, organization_id) VALUES ('Fremd', $1)`,
        [ORG_B],
      )
      expect(error).toBeDefined()
    })
  })

  // ── Idempotenz ────────────────────────────────────────────────────────
  it('die Migration ist idempotent (zweiter Lauf ohne Fehler)', async () => {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, MIGRATION_FILE), 'utf8')
    await expect(db.exec(sql)).resolves.toBeDefined()
    const { rows } = await alsNutzer(ADMIN_B, `SELECT id FROM public.profiles WHERE id = $1`, [ENGEL_A])
    expect(rows).toHaveLength(0)
  })
})
