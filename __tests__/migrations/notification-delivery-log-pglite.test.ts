/**
 * PGlite: Zustellspur fuer Benachrichtigungen (Migration 20260923000000)
 *
 * Die Migration wird auf einer echten PostgreSQL-Instanz (PGlite/WASM,
 * in-process) angewendet und ihr VERHALTEN geprueft. Der Kern ist der
 * Partial-Unique-Index: er ist die einzige Sperre, die auch bei zwei
 * GLEICHZEITIGEN Versendern haelt — eine Vorab-Abfrage im Anwendungscode
 * kann das prinzipiell nicht.
 *
 * Geprueft:
 *   1. Tabelle, RLS, Policies (Admin + RESTRICTIVE org_fence)
 *   2. CHECK-Constraints auf channel / status / attempt_count
 *   3. Mandantenpflicht (organization_id NOT NULL + FK)
 *   4. Idempotenz-Index: zweiter Erfolg pro (correlation_id, channel)
 *      wird abgewiesen — Fehlversuche und andere Kanaele nicht
 *   5. Retention loescht nur alte Zeilen
 *   6. Rollback raeumt vollstaendig ab
 */

import { PGlite } from '@electric-sql/pglite'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const MIGRATIONS_DIR = path.join(__dirname, '..', '..', 'supabase', 'migrations')
const MIGRATION = '20260923000000_notification_delivery_log.sql'
const ROLLBACK = '20260923000001_rollback_notification_delivery_log.sql'

const ORG = '00000000-0000-4000-8000-0000000000aa'
const ORG_B = '00000000-0000-4000-8000-0000000000ab'
const VORGANG = '00000000-0000-4000-8000-0000000000bb'

let db: InstanceType<typeof PGlite>

async function insert(werte: Record<string, unknown>): Promise<void> {
  const spalten = Object.keys(werte)
  const platzhalter = spalten.map((_, i) => `$${i + 1}`).join(', ')
  await db.query(
    `INSERT INTO public.notification_delivery_log (${spalten.join(', ')}) VALUES (${platzhalter})`,
    Object.values(werte) as never[],
  )
}

const basis = {
  organization_id: ORG,
  channel: 'email',
  recipient: 'kunde@example.org',
  status: 'sent',
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

  // Voraussetzungen aus dem Bestand — bewusst minimal, aber mit denselben
  // Schluesseln wie live, damit die FKs echt greifen.
  await db.exec(`
    -- gen_random_uuid() ist seit PG13 eingebaut; pgcrypto gibt es in PGlite nicht.
    CREATE TABLE public.organizations (id uuid PRIMARY KEY, name text);
    CREATE TABLE public.notifications (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid);
    CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
    CREATE FUNCTION public.current_org_id() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
    INSERT INTO public.organizations (id, name) VALUES
      ('${ORG}', 'Stamm'), ('${ORG_B}', 'Zweiter Mandant');
  `)

  await db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, MIGRATION), 'utf-8'))
})

afterAll(async () => {
  await db?.close()
})

beforeEach(async () => {
  await db.exec('DELETE FROM public.notification_delivery_log')
})

describe('Migration 20260923000000 — Objekte', () => {
  it('legt die Tabelle mit aktivem RLS an', async () => {
    const res = await db.query<{ relrowsecurity: boolean }>(
      `SELECT relrowsecurity FROM pg_class
        WHERE oid = 'public.notification_delivery_log'::regclass`,
    )
    expect(res.rows[0]?.relrowsecurity).toBe(true)
  })

  it('hat eine Admin-Policy und eine RESTRICTIVE Mandantengrenze', async () => {
    const res = await db.query<{ policyname: string; permissive: string }>(
      `SELECT policyname, permissive FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'notification_delivery_log'
        ORDER BY policyname`,
    )
    const namen = res.rows.map(r => r.policyname)
    expect(namen).toContain('notification_delivery_log_admin')
    expect(namen).toContain('org_fence_notification_delivery_log')

    // Die Mandantengrenze MUSS restrictive sein — als permissive Policy
    // wuerde sie die Admin-Policy nur ergaenzen statt zu begrenzen.
    const fence = res.rows.find(r => r.policyname === 'org_fence_notification_delivery_log')
    expect(fence?.permissive).toBe('RESTRICTIVE')
  })

  it('legt die Aufraeum-Funktion als SECURITY DEFINER mit festem search_path an', async () => {
    const res = await db.query<{ prosecdef: boolean; proconfig: string[] | null }>(
      `SELECT prosecdef, proconfig FROM pg_proc
        WHERE proname = 'cleanup_notification_delivery_log' AND pronamespace = 'public'::regnamespace`,
    )
    expect(res.rows).toHaveLength(1)
    expect(res.rows[0].prosecdef).toBe(true)
    expect((res.rows[0].proconfig ?? []).join(',')).toContain('search_path')
  })

  it('verknuepft notification_id per Fremdschluessel', async () => {
    const res = await db.query<{ conname: string }>(
      `SELECT conname FROM pg_constraint
        WHERE conname = 'notification_delivery_log_notification_id_fkey'`,
    )
    expect(res.rows).toHaveLength(1)
  })
})

describe('Constraints', () => {
  it('nimmt gueltige Zeilen an', async () => {
    await insert(basis)
    const res = await db.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM public.notification_delivery_log',
    )
    expect(res.rows[0].n).toBe(1)
  })

  it('weist unbekannte Kanaele ab', async () => {
    await expect(insert({ ...basis, channel: 'telegram' })).rejects.toThrow()
  })

  it('weist unbekannte Status ab', async () => {
    await expect(insert({ ...basis, status: 'vielleicht' })).rejects.toThrow()
  })

  it('weist unbekannte Provider ab', async () => {
    await expect(insert({ ...basis, provider: 'mailgun' })).rejects.toThrow()
  })

  it('erlaubt provider = NULL', async () => {
    await insert({ ...basis, provider: null })
  })

  it('weist attempt_count < 1 ab', async () => {
    await expect(insert({ ...basis, attempt_count: 0 })).rejects.toThrow()
  })

  it('verlangt eine Organisation', async () => {
    await expect(
      db.exec(
        `INSERT INTO public.notification_delivery_log (channel, recipient, status)
         VALUES ('email', 'a@b.de', 'sent')`,
      ),
    ).rejects.toThrow()
  })

  it('verlangt eine EXISTIERENDE Organisation', async () => {
    await expect(
      insert({ ...basis, organization_id: '00000000-0000-4000-8000-00000000ffff' }),
    ).rejects.toThrow()
  })

  it('verlangt einen Empfaenger', async () => {
    await expect(
      db.query(
        `INSERT INTO public.notification_delivery_log (organization_id, channel, status)
         VALUES ($1, 'email', 'sent')`,
        [ORG] as never[],
      ),
    ).rejects.toThrow()
  })
})

describe('Idempotenz-Index', () => {
  it('laesst pro (Vorgang, Kanal) nur EINEN Erfolg zu', async () => {
    await insert({ ...basis, correlation_id: VORGANG, status: 'sent' })
    await expect(
      insert({ ...basis, correlation_id: VORGANG, status: 'sent' }),
    ).rejects.toThrow()
  })

  it('wertet delivered und sent als denselben Erfolg', async () => {
    await insert({ ...basis, correlation_id: VORGANG, status: 'sent' })
    await expect(
      insert({ ...basis, correlation_id: VORGANG, status: 'delivered' }),
    ).rejects.toThrow()
  })

  it('greift auch ueber Mandantengrenzen hinweg — die Vorgangs-ID ist global', async () => {
    await insert({ ...basis, correlation_id: VORGANG, status: 'sent' })
    await expect(
      insert({ ...basis, organization_id: ORG_B, correlation_id: VORGANG, status: 'sent' }),
    ).rejects.toThrow()
  })

  it('laesst beliebig viele Fehlversuche zu', async () => {
    for (let i = 1; i <= 4; i++) {
      await insert({ ...basis, correlation_id: VORGANG, status: 'failed', attempt_count: i })
    }
    const res = await db.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM public.notification_delivery_log',
    )
    expect(res.rows[0].n).toBe(4)
  })

  it('laesst nach Fehlversuchen genau einen Erfolg zu', async () => {
    await insert({ ...basis, correlation_id: VORGANG, status: 'failed' })
    await insert({ ...basis, correlation_id: VORGANG, status: 'sent', attempt_count: 2 })
    await expect(
      insert({ ...basis, correlation_id: VORGANG, status: 'sent', attempt_count: 3 }),
    ).rejects.toThrow()
  })

  it('trennt Kanaele: derselbe Vorgang darf per WhatsApp erneut raus', async () => {
    await insert({ ...basis, correlation_id: VORGANG, status: 'sent' })
    await insert({
      ...basis,
      channel: 'whatsapp',
      provider: 'whatsapp_api',
      recipient: '491701234567',
      correlation_id: VORGANG,
      status: 'sent',
    })
    const res = await db.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM public.notification_delivery_log',
    )
    expect(res.rows[0].n).toBe(2)
  })

  it('greift NICHT ohne correlation_id — sonst waere jede zweite Systemmail blockiert', async () => {
    await insert({ ...basis, status: 'sent' })
    await insert({ ...basis, status: 'sent' })
    const res = await db.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM public.notification_delivery_log',
    )
    expect(res.rows[0].n).toBe(2)
  })

  it('blockiert uebersprungene Laeufe nicht', async () => {
    await insert({ ...basis, correlation_id: VORGANG, status: 'skipped' })
    await insert({ ...basis, correlation_id: VORGANG, status: 'skipped' })
    await insert({ ...basis, correlation_id: VORGANG, status: 'sent' })
  })
})

describe('Retention', () => {
  it('loescht nur Zeilen aelter als 400 Tage', async () => {
    await insert({ ...basis, recipient: 'neu@example.org' })
    await db.query(
      `INSERT INTO public.notification_delivery_log
         (organization_id, channel, recipient, status, created_at)
       VALUES ($1, 'email', 'alt@example.org', 'sent', now() - interval '401 days')`,
      [ORG] as never[],
    )

    const res = await db.query<{ cleanup_notification_delivery_log: number }>(
      'SELECT public.cleanup_notification_delivery_log() AS cleanup_notification_delivery_log',
    )
    expect(res.rows[0].cleanup_notification_delivery_log).toBe(1)

    const rest = await db.query<{ recipient: string }>(
      'SELECT recipient FROM public.notification_delivery_log',
    )
    expect(rest.rows.map(r => r.recipient)).toEqual(['neu@example.org'])
  })
})

describe('Rollback', () => {
  it('raeumt Tabelle und Funktion vollstaendig ab', async () => {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, ROLLBACK), 'utf-8'))

    const tabelle = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'notification_delivery_log'`,
    )
    expect(tabelle.rows[0].n).toBe(0)

    const funktion = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM pg_proc
        WHERE proname = 'cleanup_notification_delivery_log' AND pronamespace = 'public'::regnamespace`,
    )
    expect(funktion.rows[0].n).toBe(0)

    // Fuer nachfolgende Laeufe wieder herstellen.
    await db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, MIGRATION), 'utf-8'))
  })
})
