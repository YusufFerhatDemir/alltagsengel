/**
 * PGlite: kontobezogener Sicherheitsalarm (20261018000004)
 *
 * Geprueft wird das Verhalten auf echtem Postgres:
 *
 *   TEIL 1 — die drei Spalten und der Teilindex
 *   TEIL 2 — der Trigger auf profiles schreibt Vorher/Nachher …
 *   TEIL 3 — … aber NUR fuer ueberwachte und privilegierte Konten
 *   TEIL 4 — Rollback
 *
 * Der Trigger ist der Grund, warum diese Suite existiert: die
 * Profilseiten von Engeln, Kundschaft und Fahrdienst schreiben mit dem
 * Browser-Client direkt in public.profiles. Ein Hook im Anwendungscode
 * wuerde genau die haeufigste Kontoaenderung nicht sehen — ob der
 * Trigger sie sieht, kann nur Postgres selbst beantworten.
 */

import { PGlite } from '@electric-sql/pglite'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const MIGRATIONS_DIR = path.join(__dirname, '..', '..', 'supabase', 'migrations')
const M_MATRIX = '20261018000000_rollenmatrix_sicherheit_lesen.sql'
const M_SPUR = '20261018000002_security_audit_log.sql'
const M_ALARM = '20261018000004_security_watchlist_kontoalarm.sql'
const R_ALARM = '20261018000005_rollback_security_watchlist_kontoalarm.sql'

const ORG = 'aaaaaaaa-0000-4000-8000-000000000001'
const UEBERWACHT = '11111111-0000-4000-8000-000000000001'  // engel, auf der Liste
const UNBETEILIGT = '22222222-0000-4000-8000-000000000001' // engel, nicht auf der Liste
const ADMIN = '33333333-0000-4000-8000-000000000001'       // admin, privilegiert
const EINRICHTER = '44444444-0000-4000-8000-000000000001'

type Zeile = Record<string, unknown>

function lies(datei: string): string {
  return fs.readFileSync(path.join(MIGRATIONS_DIR, datei), 'utf8')
}

describe('PGlite: kontobezogener Sicherheitsalarm', () => {
  let db: InstanceType<typeof PGlite>

  async function zeilen(sql: string, params?: unknown[]): Promise<Zeile[]> {
    const r = await db.query(sql, params as never[])
    return (r?.rows ?? []) as Zeile[]
  }

  async function ereignisseVon(userId: string, typ?: string): Promise<Zeile[]> {
    const sql = typ
      ? `SELECT event_type, severity, metadata, platform FROM public.security_audit_log
          WHERE user_id = $1 AND event_type = $2 ORDER BY created_at`
      : `SELECT event_type, severity, metadata, platform FROM public.security_audit_log
          WHERE user_id = $1 ORDER BY created_at`
    return zeilen(sql, typ ? [userId, typ] : [userId])
  }

  beforeAll(async () => {
    db = new PGlite()

    await db.exec(`
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
      CREATE TABLE public.profiles (
        id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
        role text NOT NULL, first_name text DEFAULT '', last_name text DEFAULT '',
        email text DEFAULT '', phone text DEFAULT '', organization_id uuid
      );
      CREATE TABLE public.organization_members (
        user_id uuid, organization_id uuid, created_at timestamptz DEFAULT now()
      );

      CREATE FUNCTION public.aktuelle_rolle() RETURNS text
        LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog AS $$
        SELECT role FROM public.profiles WHERE id = auth.uid(); $$;
      CREATE FUNCTION public.is_admin() RETURNS boolean
        LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog AS $$
        SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','superadmin')); $$;
      CREATE FUNCTION public.current_org_id() RETURNS uuid
        LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog AS $$
        SELECT organization_id FROM public.profiles WHERE id = auth.uid(); $$;
      CREATE FUNCTION public.rollen_matrix(p_rolle text) RETURNS text[]
        LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY[]::text[]; $$;
      CREATE FUNCTION public.darf(p_berechtigung text) RETURNS boolean
        LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog AS $$
        SELECT COALESCE(p_berechtigung = ANY (public.rollen_matrix(public.aktuelle_rolle())), false); $$;

      GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
    `)

    await db.exec(`
      INSERT INTO public.organizations (id, name) VALUES ('${ORG}', 'Organisation A');
      INSERT INTO auth.users (id, email) VALUES
        ('${UEBERWACHT}',  'ueberwacht@example.test'),
        ('${UNBETEILIGT}', 'unbeteiligt@example.test'),
        ('${ADMIN}',       'admin@example.test'),
        ('${EINRICHTER}',  'einrichter@example.test');
      INSERT INTO public.profiles (id, role, first_name, last_name, email, phone, organization_id) VALUES
        ('${UEBERWACHT}',  'engel', 'Ueber', 'Wacht',  'ueberwacht@example.test',  '0170000001', '${ORG}'),
        ('${UNBETEILIGT}', 'engel', 'Un',    'Beteiligt','unbeteiligt@example.test','0170000002', '${ORG}'),
        ('${ADMIN}',       'admin', 'Ad',    'Min',    'admin@example.test',       '0170000003', '${ORG}'),
        ('${EINRICHTER}',  'admin', 'Ein',   'Richter','einrichter@example.test',  '0170000004', '${ORG}');
      INSERT INTO public.organization_members (user_id, organization_id) VALUES
        ('${UEBERWACHT}', '${ORG}'), ('${UNBETEILIGT}', '${ORG}'), ('${ADMIN}', '${ORG}');
    `)

    await db.exec(lies(M_MATRIX))
    await db.exec(lies(M_SPUR))
    await db.exec(lies(M_ALARM))

    await db.exec(`
      INSERT INTO public.security_watchlist (user_id, organization_id, aktiv, grund, angelegt_von, email_kontrolle)
      VALUES ('${UEBERWACHT}', '${ORG}', true, 'Testeintrag', '${EINRICHTER}', 'ueberwacht@example.test');
    `)
  }, 120_000)

  afterAll(async () => { await db?.close() })

  // ═══════════════════════════════════════════════════════════════════
  describe('Schalter und Index', () => {
    it('legt die drei Spalten an, mit Vorgabe „meldet alles, ohne Bremse"', async () => {
      const r = await zeilen(`
        SELECT column_name, column_default, is_nullable
          FROM information_schema.columns
         WHERE table_schema='public' AND table_name='security_watchlist'
           AND column_name IN ('alle_ereignisse','ohne_sperrfrist','email_kontrolle')
      `)
      expect(r).toHaveLength(3)
      const nach = new Map(r.map(x => [x.column_name as string, x]))
      // Die Vorgabe muss MEHR melden, nicht weniger: ein vergessener
      // Schalter darf die Ueberwachung nicht still abschalten.
      expect(String(nach.get('alle_ereignisse')?.column_default)).toContain('true')
      expect(String(nach.get('ohne_sperrfrist')?.column_default)).toContain('true')
      expect(nach.get('email_kontrolle')?.is_nullable).toBe('YES')
    })

    it('legt den Teilindex auf die aktiven Eintraege an', async () => {
      const r = await zeilen(`
        SELECT indexdef FROM pg_indexes
         WHERE schemaname='public' AND indexname='idx_security_watchlist_aktiv'
      `)
      expect(r).toHaveLength(1)
      expect(String(r[0].indexdef)).toContain('WHERE aktiv')
    })

    it('laesst genau einen Eintrag je Konto zu', async () => {
      let fehler: unknown = null
      try {
        await db.exec(`
          INSERT INTO public.security_watchlist (user_id, organization_id, aktiv, grund, angelegt_von)
          VALUES ('${UEBERWACHT}', '${ORG}', true, 'Doppelt', '${EINRICHTER}')
        `)
      } catch (e) { fehler = e }
      expect(fehler).not.toBeNull()
    })
  })

  // ═══════════════════════════════════════════════════════════════════
  describe('Kontoaenderungen eines ueberwachten Kontos', () => {
    it('schreibt email_change mit Vorher und Nachher', async () => {
      await db.exec(`UPDATE public.profiles SET email = 'neu@example.test' WHERE id = '${UEBERWACHT}'`)
      const r = await ereignisseVon(UEBERWACHT, 'email_change')
      expect(r).toHaveLength(1)
      const m = r[0].metadata as Record<string, unknown>
      expect(m.vorher).toBe('ueberwacht@example.test')
      expect(m.nachher).toBe('neu@example.test')
      expect(m.funktion).toBe('profiles.email')
      expect(m.ergebnis).toBe('SUCCESS')
      // Eine Adressaenderung ist der erste Schritt einer Kontouebernahme.
      expect(r[0].severity).toBe('critical')
      expect(r[0].platform).toBe('server')
    })

    it('schreibt phone_change', async () => {
      await db.exec(`UPDATE public.profiles SET phone = '0170999999' WHERE id = '${UEBERWACHT}'`)
      const r = await ereignisseVon(UEBERWACHT, 'phone_change')
      expect(r).toHaveLength(1)
      const m = r[0].metadata as Record<string, unknown>
      expect(m.vorher).toBe('0170000001')
      expect(m.nachher).toBe('0170999999')
      expect(r[0].severity).toBe('warning')
    })

    it('schreibt account_data_change bei einer Namensaenderung', async () => {
      await db.exec(`UPDATE public.profiles SET last_name = 'Neu' WHERE id = '${UEBERWACHT}'`)
      const r = await ereignisseVon(UEBERWACHT, 'account_data_change')
      expect(r).toHaveLength(1)
      const m = r[0].metadata as Record<string, unknown>
      expect(m.vorher).toBe('Ueber Wacht')
      expect(m.nachher).toBe('Ueber Neu')
    })

    it('schreibt role_change kritisch', async () => {
      await db.exec(`UPDATE public.profiles SET role = 'fahrer' WHERE id = '${UEBERWACHT}'`)
      const r = await ereignisseVon(UEBERWACHT, 'role_change')
      expect(r).toHaveLength(1)
      expect(r[0].severity).toBe('critical')
      const m = r[0].metadata as Record<string, unknown>
      expect(m.vorher).toBe('engel')
      expect(m.nachher).toBe('fahrer')
      await db.exec(`UPDATE public.profiles SET role = 'engel' WHERE id = '${UEBERWACHT}'`)
    })

    it('schreibt nichts, wenn sich nichts Relevantes aendert', async () => {
      const vorher = (await ereignisseVon(UEBERWACHT)).length
      await db.exec(`UPDATE public.profiles SET organization_id = '${ORG}' WHERE id = '${UEBERWACHT}'`)
      expect((await ereignisseVon(UEBERWACHT)).length).toBe(vorher)
    })

    it('fuehrt die MAC-Adresse auch hier als nicht verfuegbar', async () => {
      const r = await zeilen(`
        SELECT device_info FROM public.security_audit_log
         WHERE user_id = '${UEBERWACHT}' LIMIT 1
      `)
      expect((r[0].device_info as Record<string, unknown>).mac_address).toBe('not_available')
      expect((r[0].device_info as Record<string, unknown>).quelle).toBe('db_trigger')
    })
  })

  // ═══════════════════════════════════════════════════════════════════
  describe('Wer NICHT mitgeschrieben wird', () => {
    it('schweigt bei einem Konto ohne Eintrag und ohne Verwaltungsrolle', async () => {
      await db.exec(`
        UPDATE public.profiles
           SET email = 'anders@example.test', phone = '0170111111', last_name = 'Anders'
         WHERE id = '${UNBETEILIGT}'
      `)
      expect(await ereignisseVon(UNBETEILIGT)).toHaveLength(0)
    })

    it('schreibt fuer ein privilegiertes Konto auch ohne Eintrag', async () => {
      await db.exec(`UPDATE public.profiles SET phone = '0170222222' WHERE id = '${ADMIN}'`)
      const r = await ereignisseVon(ADMIN, 'phone_change')
      expect(r).toHaveLength(1)
    })

    it('faengt auch die Herabstufung eines privilegierten Kontos', async () => {
      // Der alte Wert traegt die Verwaltungsrolle, der neue nicht mehr.
      // Wuerde der Trigger nur NEW.role pruefen, waere ausgerechnet der
      // Rechteentzug das einzige unprotokollierte Ereignis.
      await db.exec(`UPDATE public.profiles SET role = 'kunde' WHERE id = '${ADMIN}'`)
      const r = await ereignisseVon(ADMIN, 'role_change')
      expect(r).toHaveLength(1)
      const m = r[0].metadata as Record<string, unknown>
      expect(m.vorher).toBe('admin')
      expect(m.nachher).toBe('kunde')
    })

    it('haelt den Trigger von anon und authenticated fern', async () => {
      const r = await zeilen(`
        SELECT has_function_privilege('anon', p.oid, 'EXECUTE') AS anon,
               has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_rolle
          FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname='public' AND p.proname='security_audit_profil_aenderung'
      `)
      expect(r[0].anon).toBe(false)
      expect(r[0].auth_rolle).toBe(false)
    })
  })

  // ═══════════════════════════════════════════════════════════════════
  describe('Idempotenz und Rollback', () => {
    it('laesst sich zweimal anwenden', async () => {
      await expect(db.exec(lies(M_ALARM))).resolves.toBeDefined()
    })

    it('nimmt Spalten und Trigger zurueck, laesst die Eintraege stehen', async () => {
      await db.exec(lies(R_ALARM))

      const spalten = await zeilen(`
        SELECT count(*)::int AS n FROM information_schema.columns
         WHERE table_schema='public' AND table_name='security_watchlist'
           AND column_name IN ('alle_ereignisse','ohne_sperrfrist','email_kontrolle')
      `)
      expect(spalten[0].n).toBe(0)

      const trigger = await zeilen(`
        SELECT count(*)::int AS n FROM pg_trigger
         WHERE tgname = 'trg_security_audit_profil_aenderung'
      `)
      expect(trigger[0].n).toBe(0)

      // Der Eintrag selbst bleibt: die Ueberwachung ist eine
      // Betriebsentscheidung, kein Migrationsartefakt.
      const eintraege = await zeilen(`SELECT count(*)::int AS n FROM public.security_watchlist`)
      expect(eintraege[0].n).toBe(1)
    })
  })
})
