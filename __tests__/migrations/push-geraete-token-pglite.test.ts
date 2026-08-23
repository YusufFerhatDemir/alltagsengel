/**
 * PGlite: Push-Geraete-Token (Migration 20260928000000)
 *
 * Die Migration laeuft auf einer echten PostgreSQL-Instanz. Genau das ist
 * hier noetig, denn ihr Kern ist SQL-Verhalten, das eine Attrappe nicht
 * nachbildet: ein Unique-Index, der Dubletten wirklich abweist, und ein
 * CHECK, an dem eine Protokollzeile wirklich scheitert.
 *
 * Geprueft:
 *   1. organization_id kommt hinzu, wird aus der Mitgliedschaft
 *      befuellt und faellt sonst auf die Stamm-Org
 *   2. Bestandsdubletten werden aufgeloest — die AELTESTE Zeile bleibt
 *   3. UNIQUE (user_id, token) weist die zweite Zeile ab; derselbe Token
 *      bei einem ANDEREN Nutzer bleibt erlaubt
 *   4. platform-CHECK
 *   5. notification_preferences samt RLS, Fence und Schluessel
 *   6. notification_delivery_log nimmt provider 'fcm' an
 *   7. Rollback raeumt ab, ohne am eigenen Protokoll zu scheitern
 */

import { PGlite } from '@electric-sql/pglite'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const MIGRATIONS_DIR = path.join(__dirname, '..', '..', 'supabase', 'migrations')
const DELIVERY_LOG = '20260923000000_notification_delivery_log.sql'
const MIGRATION = '20260928000000_push_geraete_token.sql'
const ROLLBACK = '20260928000001_rollback_push_geraete_token.sql'

const STAMM = '00000000-0000-4000-8000-000460629986'
const ORG_B = '00000000-0000-4000-8000-0000000000ab'

const NUTZER_MIT_ORG = '00000000-0000-4000-8000-0000000000c1'
const NUTZER_OHNE_ORG = '00000000-0000-4000-8000-0000000000c2'
const NUTZER_DUBLETTE = '00000000-0000-4000-8000-0000000000c3'

const TOKEN_A = 'fcm-token-aaaaaaaaaaaaaaaaaaaaaaaa'
const TOKEN_B = 'fcm-token-bbbbbbbbbbbbbbbbbbbbbbbb'

let db: InstanceType<typeof PGlite>

async function eineZeile<T = Record<string, unknown>>(sql: string): Promise<T | undefined> {
  const { rows } = await db.query<T>(sql)
  return rows[0]
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

  // Bestand wie live: fcm_tokens OHNE organization_id, OHNE Unique-Index.
  // Genau dieser Zustand hat die Dubletten erzeugt.
  await db.exec(`
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
    CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
    CREATE FUNCTION public.current_org_id() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;

    CREATE TABLE public.organizations (id uuid PRIMARY KEY, name text);
    INSERT INTO public.organizations (id, name)
      VALUES ('${STAMM}', 'Alltagsengel'), ('${ORG_B}', 'Zweiter Mandant');

    CREATE TABLE public.organization_members (
      user_id uuid NOT NULL,
      organization_id uuid NOT NULL REFERENCES public.organizations(id),
      role text,
      created_at timestamptz DEFAULT now()
    );
    INSERT INTO public.organization_members (user_id, organization_id, created_at)
      VALUES ('${NUTZER_MIT_ORG}', '${ORG_B}', now() - interval '10 days');

    CREATE TABLE public.notifications (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid);

    CREATE TABLE public.fcm_tokens (
      id uuid DEFAULT gen_random_uuid() NOT NULL,
      user_id uuid NOT NULL,
      token text NOT NULL,
      platform text DEFAULT 'android'::text NOT NULL,
      device_info text,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now(),
      PRIMARY KEY (id)
    );
  `)

  // Bestandsdaten: ein Nutzer mit Mitgliedschaft, einer ohne, und die
  // Dublettenlage aus dem kaputten Upsert (drei Zeilen, ein Geraet).
  await db.exec(`
    INSERT INTO public.fcm_tokens (user_id, token, platform, created_at) VALUES
      ('${NUTZER_MIT_ORG}',  '${TOKEN_A}', 'ios',     now() - interval '5 days'),
      ('${NUTZER_OHNE_ORG}', '${TOKEN_B}', 'android', now() - interval '5 days'),
      ('${NUTZER_DUBLETTE}', '${TOKEN_A}', 'android', now() - interval '9 days'),
      ('${NUTZER_DUBLETTE}', '${TOKEN_A}', 'android', now() - interval '3 days'),
      ('${NUTZER_DUBLETTE}', '${TOKEN_A}', 'android', now() - interval '1 days');
  `)

  await db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, DELIVERY_LOG), 'utf-8'))
  await db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, MIGRATION), 'utf-8'))
})

afterAll(async () => {
  await db?.close()
})

describe('fcm_tokens — Mandantenzuordnung', () => {
  it('legt organization_id an, NOT NULL, keine Zeile ohne Mandant', async () => {
    const spalte = await eineZeile<{ is_nullable: string }>(`
      SELECT is_nullable FROM information_schema.columns
       WHERE table_schema='public' AND table_name='fcm_tokens'
         AND column_name='organization_id'`)
    expect(spalte?.is_nullable).toBe('NO')

    const offen = await eineZeile<{ n: string }>(
      `SELECT count(*)::text AS n FROM public.fcm_tokens WHERE organization_id IS NULL`)
    expect(offen?.n).toBe('0')
  })

  it('nimmt die Organisation aus der Mitgliedschaft, nicht pauschal die Stamm-Org', async () => {
    const zeile = await eineZeile<{ organization_id: string }>(
      `SELECT organization_id FROM public.fcm_tokens WHERE user_id='${NUTZER_MIT_ORG}'`)
    expect(zeile?.organization_id).toBe(ORG_B)
  })

  it('faellt ohne Mitgliedschaft auf die Stamm-Org zurueck', async () => {
    const zeile = await eineZeile<{ organization_id: string }>(
      `SELECT organization_id FROM public.fcm_tokens WHERE user_id='${NUTZER_OHNE_ORG}'`)
    expect(zeile?.organization_id).toBe(STAMM)
  })
})

describe('fcm_tokens — Eindeutigkeit', () => {
  it('loest Bestandsdubletten auf und behaelt die aelteste Zeile', async () => {
    const { rows } = await db.query<{ n: string; alter_tage: string }>(`
      SELECT count(*)::text AS n,
             round(extract(epoch FROM now() - min(created_at)) / 86400)::text AS alter_tage
        FROM public.fcm_tokens WHERE user_id='${NUTZER_DUBLETTE}'`)
    expect(rows[0].n).toBe('1')
    // Die verbliebene Zeile ist die aelteste (9 Tage), nicht die neueste.
    expect(rows[0].alter_tage).toBe('9')
  })

  it('weist eine zweite Zeile fuer dasselbe (user_id, token) ab', async () => {
    await expect(
      db.query(
        `INSERT INTO public.fcm_tokens (user_id, token, organization_id)
         VALUES ('${NUTZER_DUBLETTE}', '${TOKEN_A}', '${STAMM}')`)
    ).rejects.toThrow(/unique|duplicate/i)
  })

  it('erlaubt denselben Token bei einem anderen Nutzer', async () => {
    // Ein geteiltes Diensthandy, an dem sich zwei Engel abwechselnd
    // anmelden, traegt kurzzeitig denselben Token fuer beide.
    await expect(
      db.query(
        `INSERT INTO public.fcm_tokens (user_id, token, organization_id)
         VALUES ('${NUTZER_OHNE_ORG}', '${TOKEN_A}', '${STAMM}')`)
    ).resolves.toBeTruthy()
  })

  it('begrenzt platform auf android/ios/web', async () => {
    await expect(
      db.query(
        `INSERT INTO public.fcm_tokens (user_id, token, platform, organization_id)
         VALUES ('${NUTZER_OHNE_ORG}', 'token-windows-phone-xxxxxxxx', 'windows', '${STAMM}')`)
    ).rejects.toThrow(/platform_check/i)
  })
})

describe('notification_preferences', () => {
  it('existiert mit Schluessel (user_id, channel) und aktiver RLS', async () => {
    const rls = await eineZeile<{ relrowsecurity: boolean }>(`
      SELECT relrowsecurity FROM pg_class
       WHERE oid='public.notification_preferences'::regclass`)
    expect(rls?.relrowsecurity).toBe(true)

    await db.exec(`
      INSERT INTO public.notification_preferences (user_id, organization_id, channel, enabled)
      VALUES ('${NUTZER_MIT_ORG}', '${ORG_B}', 'push', false)`)

    await expect(
      db.query(
        `INSERT INTO public.notification_preferences (user_id, organization_id, channel)
         VALUES ('${NUTZER_MIT_ORG}', '${ORG_B}', 'push')`)
    ).rejects.toThrow(/unique|duplicate/i)
  })

  it('kennt nur die vier Kanaele', async () => {
    await expect(
      db.query(
        `INSERT INTO public.notification_preferences (user_id, organization_id, channel)
         VALUES ('${NUTZER_OHNE_ORG}', '${STAMM}', 'brieftaube')`)
    ).rejects.toThrow(/channel/i)
  })

  it('hat einen RESTRICTIVE Mandanten-Fence', async () => {
    const fence = await eineZeile<{ permissive: string }>(`
      SELECT permissive FROM pg_policies
       WHERE tablename='notification_preferences'
         AND policyname='notification_preferences_org_fence'`)
    expect(fence?.permissive).toBe('RESTRICTIVE')
  })

  it('ist fuer anon gesperrt', async () => {
    const recht = await eineZeile<{ n: string }>(`
      SELECT count(*)::text AS n FROM information_schema.role_table_grants
       WHERE table_name='notification_preferences' AND grantee='anon'`)
    expect(recht?.n).toBe('0')
  })
})

describe('notification_delivery_log — Provider fcm', () => {
  it('nimmt provider fcm an', async () => {
    await expect(
      db.query(`
        INSERT INTO public.notification_delivery_log
          (organization_id, channel, recipient, status, provider)
        VALUES ('${STAMM}', 'push', '${NUTZER_MIT_ORG}', 'sent', 'fcm')`)
    ).resolves.toBeTruthy()
  })

  it('weist einen erfundenen Provider weiterhin ab', async () => {
    await expect(
      db.query(`
        INSERT INTO public.notification_delivery_log
          (organization_id, channel, recipient, status, provider)
        VALUES ('${STAMM}', 'push', '${NUTZER_MIT_ORG}', 'sent', 'apns')`)
    ).rejects.toThrow(/provider/i)
  })
})

describe('Rollback', () => {
  it('raeumt ab und scheitert nicht an eigenen fcm-Zeilen', async () => {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, ROLLBACK), 'utf-8'))

    const tabelle = await eineZeile<{ n: string }>(`
      SELECT count(*)::text AS n FROM information_schema.tables
       WHERE table_schema='public' AND table_name='notification_preferences'`)
    expect(tabelle?.n).toBe('0')

    const index = await eineZeile<{ n: string }>(`
      SELECT count(*)::text AS n FROM pg_indexes
       WHERE tablename='fcm_tokens' AND indexname='fcm_tokens_user_token_uniq'`)
    expect(index?.n).toBe('0')

    // Die Protokollzeile von oben trug provider='fcm'. Das Rollback muss
    // sie entschaerfen, sonst scheitert der alte CHECK an ihr.
    const rest = await eineZeile<{ n: string }>(`
      SELECT count(*)::text AS n FROM public.notification_delivery_log WHERE provider='fcm'`)
    expect(rest?.n).toBe('0')

    // organization_id bleibt bewusst stehen — sie ist die Mandantengrenze.
    const spalte = await eineZeile<{ n: string }>(`
      SELECT count(*)::text AS n FROM information_schema.columns
       WHERE table_schema='public' AND table_name='fcm_tokens'
         AND column_name='organization_id'`)
    expect(spalte?.n).toBe('1')
  })
})
