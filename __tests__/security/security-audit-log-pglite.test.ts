/**
 * PGlite: security_audit_log — Verhalten der Migration auf echtem Postgres
 *
 * Geprueft wird nicht, ob die Datei existiert, sondern was sie tut:
 *
 *   TEIL 1 — Schema: Spalten, CHECK nur auf severity, KEIN CHECK auf
 *            event_type (ein unbekannter Ereignistyp muss geschrieben
 *            werden, sonst verliert die Spur genau die Faelle, die
 *            niemand vorhergesehen hat)
 *   TEIL 2 — RLS: wer liest, wer nicht, und was der Mandantenfilter tut
 *   TEIL 3 — Unveraenderlichkeit: kein UPDATE, kein DELETE — aber die
 *            Fremdschluessel-Kaskade der Kontoloeschung geht durch
 *   TEIL 4 — log_security_event(): Geheimnisse raus, unbekannter
 *            Schweregrad hoch, fehlender Typ = Fehler
 *   TEIL 5 — Aufbewahrung
 *   TEIL 6 — Trigger auf auth.users
 *   TEIL 7 — Rollenmatrix und Rollback
 *
 * Eine Fake-DB wuerde hier nichts beweisen: Policies, CHECKs, Trigger und
 * die FK-Kaskade wertet ausschliesslich Postgres selbst aus.
 */

import { PGlite } from '@electric-sql/pglite'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const MIGRATIONS_DIR = path.join(__dirname, '..', '..', 'supabase', 'migrations')
const MIGRATION_MATRIX = '20261018000000_rollenmatrix_sicherheit_lesen.sql'
const ROLLBACK_MATRIX = '20261018000001_rollback_rollenmatrix_sicherheit_lesen.sql'
const MIGRATION = '20261018000002_security_audit_log.sql'
const ROLLBACK = '20261018000003_rollback_security_audit_log.sql'

const ORG_A = 'aaaaaaaa-0000-4000-8000-000000000001'
const ORG_B = 'bbbbbbbb-0000-4000-8000-000000000001'

const ADMIN_A = '11111111-0000-4000-8000-000000000001'
const PDL_A   = '22222222-0000-4000-8000-000000000001'
const KUNDE_A = '33333333-0000-4000-8000-000000000001'
const ADMIN_B = '44444444-0000-4000-8000-000000000001'

type Zeile = Record<string, unknown>
type Fehler = { code?: string; message?: string } | undefined

function lies(datei: string): string {
  return fs.readFileSync(path.join(MIGRATIONS_DIR, datei), 'utf8')
}

describe('PGlite: security_audit_log', () => {
  let db: InstanceType<typeof PGlite>

  async function alsNutzer(userId: string, sql: string, params?: unknown[]) {
    try {
      const ergebnis = await db.transaction(async (tx) => {
        await tx.exec(
          `SET LOCAL ROLE authenticated;` +
          `SET LOCAL request.jwt.claims = '${JSON.stringify({ sub: userId, role: 'authenticated' })}';`,
        )
        return tx.query(sql, params as never[])
      })
      return { rows: (ergebnis?.rows ?? []) as Zeile[], error: undefined as Fehler }
    } catch (e: unknown) {
      return { rows: [] as Zeile[], error: e as Fehler }
    }
  }

  async function alsEigentuemer(sql: string, params?: unknown[]) {
    try {
      const ergebnis = await db.query(sql, params as never[])
      return { rows: (ergebnis?.rows ?? []) as Zeile[], error: undefined as Fehler }
    } catch (e: unknown) {
      return { rows: [] as Zeile[], error: e as Fehler }
    }
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

    // ── Umgebung: das Mindeste, worauf die Migration aufsetzt ──
    await db.exec(`
      CREATE SCHEMA IF NOT EXISTS auth;

      CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
        SELECT coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
      $$;
      CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
        SELECT nullif(auth.jwt() ->> 'sub', '')::uuid;
      $$;

      CREATE TABLE auth.users (
        id               uuid PRIMARY KEY,
        email            text,
        last_sign_in_at  timestamptz
      );

      CREATE TABLE public.organizations (
        id    uuid PRIMARY KEY,
        name  text NOT NULL
      );

      CREATE TABLE public.profiles (
        id               uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
        role             text NOT NULL,
        organization_id  uuid
      );

      CREATE FUNCTION public.aktuelle_rolle() RETURNS text
        LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog AS $$
        SELECT role FROM public.profiles WHERE id = auth.uid();
      $$;

      CREATE FUNCTION public.is_admin() RETURNS boolean
        LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog AS $$
        SELECT EXISTS (
          SELECT 1 FROM public.profiles
           WHERE id = auth.uid() AND role IN ('admin','superadmin')
        );
      $$;

      CREATE FUNCTION public.current_org_id() RETURNS uuid
        LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog AS $$
        SELECT organization_id FROM public.profiles WHERE id = auth.uid();
      $$;

      -- Platzhalter: die Migration ersetzt ihn durch die echte Matrix.
      CREATE FUNCTION public.rollen_matrix(p_rolle text) RETURNS text[]
        LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY[]::text[]; $$;

      CREATE FUNCTION public.darf(p_berechtigung text) RETURNS boolean
        LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog AS $$
        SELECT COALESCE(p_berechtigung = ANY (public.rollen_matrix(public.aktuelle_rolle())), false);
      $$;

      GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
    `)

    await db.exec(`
      INSERT INTO public.organizations (id, name) VALUES
        ('${ORG_A}', 'Organisation A'),
        ('${ORG_B}', 'Organisation B');

      INSERT INTO auth.users (id, email) VALUES
        ('${ADMIN_A}', 'admin-a@example.test'),
        ('${PDL_A}',   'pdl-a@example.test'),
        ('${KUNDE_A}', 'kunde-a@example.test'),
        ('${ADMIN_B}', 'admin-b@example.test');

      INSERT INTO public.profiles (id, role, organization_id) VALUES
        ('${ADMIN_A}', 'admin', '${ORG_A}'),
        ('${PDL_A}',   'pdl',   '${ORG_A}'),
        ('${KUNDE_A}', 'kunde', '${ORG_A}'),
        ('${ADMIN_B}', 'admin', '${ORG_B}');
    `)

    await db.exec(lies(MIGRATION_MATRIX))
    await db.exec(lies(MIGRATION))
  }, 120_000)

  afterAll(async () => { await db?.close() })

  // ═══════════════════════════════════════════════════════════════════
  // TEIL 1 — Schema
  // ═══════════════════════════════════════════════════════════════════
  describe('Schema', () => {
    it('legt security_audit_log mit allen geforderten Spalten an', async () => {
      const { rows } = await alsEigentuemer(`
        SELECT column_name, data_type, is_nullable
          FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'security_audit_log'
      `)
      const spalten = new Map(rows.map(r => [r.column_name as string, r]))
      for (const name of [
        'id', 'user_id', 'organization_id', 'event_type', 'event_category',
        'created_at', 'ip_address', 'user_agent', 'platform', 'device_info',
        'app_version', 'session_reference', 'metadata', 'severity',
      ]) {
        expect(spalten.has(name), `Spalte ${name} fehlt`).toBe(true)
      }
      expect(spalten.get('ip_address')?.data_type).toBe('inet')
      expect(spalten.get('device_info')?.data_type).toBe('jsonb')
      expect(spalten.get('metadata')?.data_type).toBe('jsonb')
      // Mandant ist nullable — fuer Fehlversuche zu unbekannten Adressen.
      expect(spalten.get('organization_id')?.is_nullable).toBe('YES')
      expect(spalten.get('event_type')?.is_nullable).toBe('NO')
    })

    it('laesst einen unbekannten Ereignistyp zu (kein CHECK auf event_type)', async () => {
      const { error } = await alsEigentuemer(`
        INSERT INTO public.security_audit_log (event_type, event_category, severity)
        VALUES ('voellig_neues_ereignis_2027', 'security', 'warning')
      `)
      expect(error).toBeUndefined()
    })

    it('weist einen unbekannten Schweregrad ab (CHECK auf severity)', async () => {
      const { error } = await alsEigentuemer(`
        INSERT INTO public.security_audit_log (event_type, severity)
        VALUES ('login_success', 'katastrophal')
      `)
      expect(error).toBeDefined()
    })

    it('fuehrt kein Feld fuer Passwoerter, Tokens oder Cookies', async () => {
      const { rows } = await alsEigentuemer(`
        SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'security_audit_log'
      `)
      const namen = rows.map(r => (r.column_name as string).toLowerCase())
      for (const verboten of ['password', 'passwort', 'token', 'cookie', 'secret', 'mac_address']) {
        expect(namen.some(n => n.includes(verboten)), `Spalte mit "${verboten}" gefunden`).toBe(false)
      }
    })
  })

  // ═══════════════════════════════════════════════════════════════════
  // TEIL 2 — RLS
  // ═══════════════════════════════════════════════════════════════════
  describe('Zugriff', () => {
    beforeAll(async () => {
      await db.exec(`
        INSERT INTO public.security_audit_log (user_id, user_email, organization_id, event_type, event_category, severity)
        VALUES
          ('${PDL_A}',   'pdl-a@example.test',   '${ORG_A}', 'login_success', 'auth', 'info'),
          ('${ADMIN_B}', 'admin-b@example.test', '${ORG_B}', 'login_success', 'auth', 'info'),
          (NULL,         'niemand@example.test', NULL,       'login_failed',  'auth', 'warning');
      `)
    })

    it('gibt der Kundschaft nichts', async () => {
      const { rows } = await alsNutzer(KUNDE_A, 'SELECT id FROM public.security_audit_log')
      expect(rows).toHaveLength(0)
    })

    it('gibt der Pflegedienstleitung nichts — audit.lesen reicht hier nicht', async () => {
      const { rows } = await alsNutzer(PDL_A, 'SELECT id FROM public.security_audit_log')
      expect(rows).toHaveLength(0)
    })

    it('gibt der Administration die eigene Organisation und die mandantenlosen Zeilen', async () => {
      const { rows } = await alsNutzer(
        ADMIN_A,
        'SELECT organization_id FROM public.security_audit_log ORDER BY created_at',
      )
      const orgs = rows.map(r => r.organization_id)
      expect(orgs).toContain(ORG_A)
      expect(orgs).toContain(null)
      expect(orgs).not.toContain(ORG_B)
    })

    it('trennt die Mandanten in beide Richtungen', async () => {
      const { rows } = await alsNutzer(ADMIN_B, 'SELECT organization_id FROM public.security_audit_log')
      const orgs = rows.map(r => r.organization_id)
      expect(orgs).toContain(ORG_B)
      expect(orgs).not.toContain(ORG_A)
    })

    it('laesst die Administration NICHT schreiben', async () => {
      const { error } = await alsNutzer(ADMIN_A, `
        INSERT INTO public.security_audit_log (event_type, organization_id)
        VALUES ('erfunden', '${ORG_A}')
      `)
      expect(error).toBeDefined()
    })

    it('gibt anon keinerlei Recht auf der Tabelle', async () => {
      const { rows } = await alsEigentuemer(`
        SELECT has_table_privilege('anon', 'public.security_audit_log', 'SELECT') AS lesen,
               has_table_privilege('anon', 'public.security_audit_log', 'INSERT') AS schreiben
      `)
      expect(rows[0].lesen).toBe(false)
      expect(rows[0].schreiben).toBe(false)
    })

    it('haelt log_security_event von anon und authenticated fern', async () => {
      const { rows } = await alsEigentuemer(`
        SELECT
          has_function_privilege('anon', p.oid, 'EXECUTE') AS anon,
          has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_rolle,
          has_function_privilege('service_role', p.oid, 'EXECUTE') AS dienst
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'log_security_event'
      `)
      expect(rows[0].anon).toBe(false)
      expect(rows[0].auth_rolle).toBe(false)
      expect(rows[0].dienst).toBe(true)
    })
  })

  // ═══════════════════════════════════════════════════════════════════
  // TEIL 3 — Unveraenderlichkeit
  // ═══════════════════════════════════════════════════════════════════
  describe('Unveraenderlichkeit', () => {
    it('laesst auch den Eigentuemer nicht aendern', async () => {
      const { error } = await alsEigentuemer(`
        UPDATE public.security_audit_log SET severity = 'info' WHERE severity = 'warning'
      `)
      expect(error).toBeDefined()
      expect(String(error?.message ?? '')).toContain('unveraenderlich')
    })

    it('laesst auch den Eigentuemer nicht loeschen', async () => {
      const { error } = await alsEigentuemer(`
        DELETE FROM public.security_audit_log WHERE event_type = 'login_failed'
      `)
      expect(error).toBeDefined()
    })

    it('blockiert die DSGVO-Kontoloeschung NICHT (Fremdschluessel-Kaskade)', async () => {
      // Genau die Falle aus dem Befund „Audit-Trigger vs. FK-Kaskade":
      // user_id steht auf ON DELETE SET NULL, Postgres fuehrt das als
      // UPDATE aus — ein bedingungsloser Riegel haette jede Loeschung
      // eines Kontos mit Sicherheitseintrag verhindert.
      const OPFER = '99999999-0000-4000-8000-000000000001'
      await db.exec(`
        INSERT INTO auth.users (id, email) VALUES ('${OPFER}', 'weg@example.test');
        INSERT INTO public.profiles (id, role, organization_id) VALUES ('${OPFER}', 'kunde', '${ORG_A}');
        INSERT INTO public.security_audit_log (user_id, user_email, organization_id, event_type)
        VALUES ('${OPFER}', 'weg@example.test', '${ORG_A}', 'login_success');
      `)

      const { error } = await alsEigentuemer(`DELETE FROM auth.users WHERE id = '${OPFER}'`)
      expect(error).toBeUndefined()

      const { rows } = await alsEigentuemer(`
        SELECT user_id, user_email FROM public.security_audit_log
         WHERE user_email = 'weg@example.test'
      `)
      expect(rows).toHaveLength(1)
      expect(rows[0].user_id).toBeNull()
      // Der Adress-Schnappschuss bleibt: sonst saehe der Eintrag nach der
      // Loeschung aus wie ein Ereignis ohne jeden Bezug.
      expect(rows[0].user_email).toBe('weg@example.test')
    })
  })

  // ═══════════════════════════════════════════════════════════════════
  // TEIL 4 — log_security_event()
  // ═══════════════════════════════════════════════════════════════════
  describe('log_security_event()', () => {
    it('schreibt und liefert die Kennung zurueck', async () => {
      const { rows, error } = await alsEigentuemer(`
        SELECT public.log_security_event(
          '${ADMIN_A}', 'role_change', 'role',
          '{"grund":"Test"}'::jsonb, 'critical', '${ORG_A}'
        ) AS id
      `)
      expect(error).toBeUndefined()
      expect(rows[0].id).toBeTruthy()
    })

    it('entfernt Geheimnisse aus metadata', async () => {
      await alsEigentuemer(`
        SELECT public.log_security_event(
          '${ADMIN_A}', 'security_action', 'security',
          '{"password":"hunter2","access_token":"abc","cookie":"sid=1","grund":"bleibt"}'::jsonb,
          'warning', '${ORG_A}'
        )
      `)
      const { rows } = await alsEigentuemer(`
        SELECT metadata FROM public.security_audit_log
         WHERE event_type = 'security_action' ORDER BY created_at DESC LIMIT 1
      `)
      const m = rows[0].metadata as Record<string, unknown>
      expect(m.password).toBeUndefined()
      expect(m.access_token).toBeUndefined()
      expect(m.cookie).toBeUndefined()
      expect(m.grund).toBe('bleibt')
    })

    it('hebt einen unbekannten Schweregrad auf warning, statt den Eintrag zu verwerfen', async () => {
      const { error } = await alsEigentuemer(`
        SELECT public.log_security_event('${ADMIN_A}', 'blocked_action', 'security', '{}'::jsonb, 'unfug')
      `)
      expect(error).toBeUndefined()
      const { rows } = await alsEigentuemer(`
        SELECT severity FROM public.security_audit_log
         WHERE event_type = 'blocked_action' ORDER BY created_at DESC LIMIT 1
      `)
      expect(rows[0].severity).toBe('warning')
    })

    it('verweigert einen leeren Ereignistyp', async () => {
      const { error } = await alsEigentuemer(`
        SELECT public.log_security_event('${ADMIN_A}', '   ', 'security')
      `)
      expect(error).toBeDefined()
    })
  })

  // ═══════════════════════════════════════════════════════════════════
  // TEIL 5 — Aufbewahrung
  // ═══════════════════════════════════════════════════════════════════
  describe('Aufbewahrung', () => {
    it('loescht nur, was aelter ist als die Frist', async () => {
      await db.exec(`
        ALTER TABLE public.security_audit_log DISABLE TRIGGER trg_security_audit_log_unveraenderlich;
        INSERT INTO public.security_audit_log (event_type, created_at)
        VALUES ('logout', now() - interval '800 days');
        ALTER TABLE public.security_audit_log ENABLE TRIGGER trg_security_audit_log_unveraenderlich;
      `)
      const vorher = await alsEigentuemer(`SELECT count(*)::int AS n FROM public.security_audit_log`)
      const { rows } = await alsEigentuemer(`SELECT public.security_audit_log_aufraeumen(730) AS n`)
      expect(rows[0].n).toBe(1)
      const nachher = await alsEigentuemer(`SELECT count(*)::int AS n FROM public.security_audit_log`)
      expect(nachher.rows[0].n).toBe((vorher.rows[0].n as number) - 1)
    })

    it('laesst den Trigger danach wieder scharf stehen', async () => {
      const { error } = await alsEigentuemer(`
        DELETE FROM public.security_audit_log WHERE event_type = 'login_success'
      `)
      expect(error).toBeDefined()
    })

    it('verweigert eine unrealistisch kurze Frist', async () => {
      const { error } = await alsEigentuemer(`SELECT public.security_audit_log_aufraeumen(7)`)
      expect(error).toBeDefined()
    })
  })

  // ═══════════════════════════════════════════════════════════════════
  // TEIL 6 — Trigger auf auth.users
  // ═══════════════════════════════════════════════════════════════════
  describe('Anmeldung aus der Datenbank', () => {
    it('schreibt bei neuem last_sign_in_at eine Zeile', async () => {
      await db.exec(`UPDATE auth.users SET last_sign_in_at = now() WHERE id = '${ADMIN_A}'`)
      const { rows } = await alsEigentuemer(`
        SELECT device_info, metadata, platform FROM public.security_audit_log
         WHERE user_id = '${ADMIN_A}' AND metadata->>'herkunft' = 'auth.users.last_sign_in_at'
      `)
      expect(rows).toHaveLength(1)
      expect(rows[0].platform).toBe('server')
      // MAC-Adresse: ausdruecklich als nicht verfuegbar gefuehrt.
      expect((rows[0].device_info as Record<string, unknown>).mac_address).toBe('not_available')
    })

    it('schreibt NICHT, wenn sich der Anmeldezeitpunkt nicht aendert', async () => {
      const vorher = await alsEigentuemer(`
        SELECT count(*)::int AS n FROM public.security_audit_log
         WHERE metadata->>'herkunft' = 'auth.users.last_sign_in_at'
      `)
      await db.exec(`UPDATE auth.users SET email = 'admin-a2@example.test' WHERE id = '${ADMIN_A}'`)
      const nachher = await alsEigentuemer(`
        SELECT count(*)::int AS n FROM public.security_audit_log
         WHERE metadata->>'herkunft' = 'auth.users.last_sign_in_at'
      `)
      expect(nachher.rows[0].n).toBe(vorher.rows[0].n)
    })
  })

  // ═══════════════════════════════════════════════════════════════════
  // TEIL 7 — Rollenmatrix, Idempotenz, Rollback
  // ═══════════════════════════════════════════════════════════════════
  describe('Rollenmatrix und Rollback', () => {
    it('gibt sicherheit.lesen nur an die Administration', async () => {
      const { rows } = await alsEigentuemer(`
        SELECT 'sicherheit.lesen' = ANY (public.rollen_matrix('admin'))      AS admin,
               'sicherheit.lesen' = ANY (public.rollen_matrix('superadmin')) AS super,
               'sicherheit.lesen' = ANY (public.rollen_matrix('pdl'))        AS pdl,
               'sicherheit.lesen' = ANY (public.rollen_matrix('qm'))         AS qm,
               'sicherheit.lesen' = ANY (public.rollen_matrix('buchhaltung')) AS buch
      `)
      expect(rows[0].admin).toBe(true)
      expect(rows[0].super).toBe(true)
      expect(rows[0].pdl).toBe(false)
      expect(rows[0].qm).toBe(false)
      expect(rows[0].buch).toBe(false)
    })

    it('nimmt marketing.verwalten nicht aus der Matrix (geteilte Funktion)', async () => {
      const { rows } = await alsEigentuemer(`
        SELECT 'marketing.verwalten' = ANY (public.rollen_matrix('admin')) AS admin
      `)
      expect(rows[0].admin).toBe(true)
    })

    it('laesst sich zweimal anwenden', async () => {
      // db.exec statt db.query: die Migration ist ein Skript aus vielen
      // Anweisungen, query() bereitet genau eine vor.
      await expect(db.exec(lies(MIGRATION))).resolves.toBeDefined()
    })

    it('raeumt beim Rollback vollstaendig ab', async () => {
      const roll = new PGlite()
      try {
        await roll.exec(`
          DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN NOINHERIT; END IF;
            IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN NOINHERIT; END IF;
            IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS; END IF;
          END $$;
          CREATE SCHEMA IF NOT EXISTS auth;
          CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
            SELECT coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb); $$;
          CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
            SELECT nullif(auth.jwt() ->> 'sub', '')::uuid; $$;
          CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, last_sign_in_at timestamptz);
          CREATE TABLE public.organizations (id uuid PRIMARY KEY, name text NOT NULL);
          CREATE TABLE public.profiles (id uuid PRIMARY KEY, role text NOT NULL, organization_id uuid);
          CREATE FUNCTION public.aktuelle_rolle() RETURNS text LANGUAGE sql STABLE AS $$
            SELECT role FROM public.profiles WHERE id = auth.uid(); $$;
          CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE AS $$
            SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','superadmin')); $$;
          CREATE FUNCTION public.current_org_id() RETURNS uuid LANGUAGE sql STABLE AS $$
            SELECT organization_id FROM public.profiles WHERE id = auth.uid(); $$;
          CREATE FUNCTION public.rollen_matrix(p_rolle text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY[]::text[]; $$;
          CREATE FUNCTION public.darf(p_berechtigung text) RETURNS boolean LANGUAGE sql STABLE AS $$
            SELECT COALESCE(p_berechtigung = ANY (public.rollen_matrix(public.aktuelle_rolle())), false); $$;
        `)
        await roll.exec(lies(MIGRATION_MATRIX))
        await roll.exec(lies(MIGRATION))
        await roll.exec(lies(ROLLBACK))
        await roll.exec(lies(ROLLBACK_MATRIX))

        const uebrig = await roll.query<{ n: number }>(`
          SELECT count(*)::int AS n FROM information_schema.tables
           WHERE table_schema = 'public'
             AND table_name IN ('security_audit_log','security_known_devices','security_watchlist')
        `)
        expect(uebrig.rows[0].n).toBe(0)

        const funktionen = await roll.query<{ n: number }>(`
          SELECT count(*)::int AS n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public'
             AND p.proname IN ('log_security_event','security_audit_log_aufraeumen','ist_sicherheitsadmin')
        `)
        expect(funktionen.rows[0].n).toBe(0)

        // Der Rollback darf dem Marketing-Modul nicht seine Berechtigung nehmen.
        const matrix = await roll.query<{ marketing: boolean; sicherheit: boolean }>(`
          SELECT 'marketing.verwalten' = ANY (public.rollen_matrix('admin')) AS marketing,
                 'sicherheit.lesen'    = ANY (public.rollen_matrix('admin')) AS sicherheit
        `)
        expect(matrix.rows[0].marketing).toBe(true)
        expect(matrix.rows[0].sicherheit).toBe(false)
      } finally {
        await roll.close()
      }
    }, 120_000)
  })
})
