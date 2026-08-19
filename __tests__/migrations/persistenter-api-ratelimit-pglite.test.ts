/**
 * PGlite: persistenter API-Ratelimit (Master-Audit 2026-08-19, B-2 / I-6)
 *
 * Die Migration 20260922030000 wird auf einer echten PostgreSQL-Instanz
 * (PGlite/WASM, in-process) angewendet und ihr VERHALTEN geprüft — nicht
 * ihr Quelltext. Ein "die Datei enthält ON CONFLICT"-Test würde nur
 * beweisen, dass jemand etwas geschrieben hat.
 *
 * Geprüft:
 *   1. Tabelle + RPC existieren, RLS ist an
 *   2. Innerhalb des Fensters wird nach `limit` Treffern geblockt
 *   3. Nach Fensterablauf zählt die RPC wieder von vorn
 *   4. Blockierte Treffer verlängern das Fenster NICHT (sonst wäre eine
 *      Dauerflut eine dauerhafte Selbstsperre)
 *   5. Unsinn-Parameter → fail-closed (false), nicht durchwinken
 *   6. Schlüssel sind voneinander unabhängig
 *   7. anon/authenticated dürfen die RPC nicht ausführen
 *   8. Retention räumt nur alte Zeilen ab
 */

import { PGlite } from '@electric-sql/pglite'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const MIGRATIONS_DIR = path.join(__dirname, '..', '..', 'supabase', 'migrations')
const MIGRATION = '20260922030000_persistenter_api_ratelimit.sql'
const ROLLBACK = '20260922030001_rollback_persistenter_api_ratelimit.sql'

let db: InstanceType<typeof PGlite>

async function hit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const res = await db.query<{ api_rate_limit_hit: boolean }>(
    'SELECT public.api_rate_limit_hit($1, $2, $3) AS api_rate_limit_hit',
    [key, limit, windowSeconds] as never[],
  )
  return res.rows[0].api_rate_limit_hit
}

beforeAll(async () => {
  db = new PGlite()

  // Supabase-Rollen — die Migration enthält REVOKE … FROM anon, authenticated
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

  await db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, MIGRATION), 'utf-8'))
})

afterAll(async () => {
  await db?.close()
})

beforeEach(async () => {
  await db.exec('DELETE FROM public.api_rate_limits')
})

describe('Migration 20260922030000 — Objekte', () => {
  it('legt api_rate_limits mit aktivem RLS an', async () => {
    const res = await db.query<{ relrowsecurity: boolean }>(
      `SELECT relrowsecurity FROM pg_class
        WHERE oid = 'public.api_rate_limits'::regclass`,
    )
    expect(res.rows[0]?.relrowsecurity).toBe(true)
  })

  it('legt api_rate_limit_hit als SECURITY DEFINER mit gesetztem search_path an', async () => {
    const res = await db.query<{ prosecdef: boolean; proconfig: string[] | null }>(
      `SELECT prosecdef, proconfig FROM pg_proc
        WHERE proname = 'api_rate_limit_hit' AND pronamespace = 'public'::regnamespace`,
    )
    expect(res.rows).toHaveLength(1)
    expect(res.rows[0].prosecdef).toBe(true)
    // Ohne festen search_path wäre eine SECDEF-Funktion angreifbar.
    expect((res.rows[0].proconfig ?? []).join(',')).toContain('search_path')
  })
})

describe('api_rate_limit_hit — Zählverhalten', () => {
  it('erlaubt bis zum Limit und blockt danach', async () => {
    expect(await hit('k:a', 3, 60)).toBe(true)
    expect(await hit('k:a', 3, 60)).toBe(true)
    expect(await hit('k:a', 3, 60)).toBe(true)
    expect(await hit('k:a', 3, 60)).toBe(false)
    expect(await hit('k:a', 3, 60)).toBe(false)
  })

  it('zählt Schlüssel unabhängig voneinander', async () => {
    expect(await hit('k:b', 1, 60)).toBe(true)
    expect(await hit('k:b', 1, 60)).toBe(false)
    // anderer Schlüssel — eigenes Fenster
    expect(await hit('k:c', 1, 60)).toBe(true)
  })

  it('zählt nach Fensterablauf wieder von vorn', async () => {
    expect(await hit('k:d', 1, 60)).toBe(true)
    expect(await hit('k:d', 1, 60)).toBe(false)

    // Fenster künstlich in die Vergangenheit schieben
    await db.exec(
      `UPDATE public.api_rate_limits
          SET window_start = now() - interval '61 seconds'
        WHERE key = 'k:d'`,
    )
    expect(await hit('k:d', 1, 60)).toBe(true)
  })

  it('verlängert das Fenster durch geblockte Treffer NICHT', async () => {
    await hit('k:e', 1, 60)
    const vorher = await db.query<{ window_start: Date }>(
      `SELECT window_start FROM public.api_rate_limits WHERE key = 'k:e'`,
    )
    // Dauerflut
    for (let i = 0; i < 5; i++) expect(await hit('k:e', 1, 60)).toBe(false)
    const nachher = await db.query<{ window_start: Date }>(
      `SELECT window_start FROM public.api_rate_limits WHERE key = 'k:e'`,
    )
    expect(new Date(nachher.rows[0].window_start).getTime())
      .toBe(new Date(vorher.rows[0].window_start).getTime())
  })

  it('kürzt überlange Schlüssel auf 200 Zeichen statt zu werfen', async () => {
    const lang = 'x'.repeat(500)
    expect(await hit(lang, 1, 60)).toBe(true)
    const res = await db.query<{ len: number }>(
      'SELECT length(key) AS len FROM public.api_rate_limits',
    )
    expect(res.rows[0].len).toBe(200)
  })
})

describe('api_rate_limit_hit — fail-closed bei Unsinn-Parametern', () => {
  it('blockt bei leerem Schlüssel', async () => {
    expect(await hit('', 10, 60)).toBe(false)
    expect(await hit('   ', 10, 60)).toBe(false)
  })

  it('blockt bei Limit < 1', async () => {
    expect(await hit('k:f', 0, 60)).toBe(false)
    expect(await hit('k:f', -5, 60)).toBe(false)
  })

  it('blockt bei Fenster < 1 Sekunde', async () => {
    expect(await hit('k:g', 10, 0)).toBe(false)
  })

  it('legt bei abgelehnten Parametern keine Zeile an', async () => {
    await hit('', 10, 60)
    await hit('k:h', 0, 60)
    const res = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM public.api_rate_limits')
    expect(res.rows[0].n).toBe(0)
  })
})

describe('Rechte', () => {
  it('erlaubt anon und authenticated die RPC nicht', async () => {
    for (const rolle of ['anon', 'authenticated']) {
      const res = await db.query<{ darf: boolean }>(
        `SELECT has_function_privilege($1, 'public.api_rate_limit_hit(text,integer,integer)', 'EXECUTE') AS darf`,
        [rolle] as never[],
      )
      expect(res.rows[0].darf).toBe(false)
    }
  })

  it('erlaubt service_role die RPC', async () => {
    const res = await db.query<{ darf: boolean }>(
      `SELECT has_function_privilege('service_role', 'public.api_rate_limit_hit(text,integer,integer)', 'EXECUTE') AS darf`,
    )
    expect(res.rows[0].darf).toBe(true)
  })

  it('gibt anon und authenticated keinen Tabellenzugriff', async () => {
    for (const rolle of ['anon', 'authenticated']) {
      for (const recht of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
        const res = await db.query<{ darf: boolean }>(
          `SELECT has_table_privilege($1, 'public.api_rate_limits', $2) AS darf`,
          [rolle, recht] as never[],
        )
        expect(res.rows[0].darf).toBe(false)
      }
    }
  })
})

describe('Retention', () => {
  it('räumt nur Zeilen älter als 7 Tage ab', async () => {
    await hit('k:alt', 5, 60)
    await hit('k:neu', 5, 60)
    await db.exec(
      `UPDATE public.api_rate_limits SET updated_at = now() - interval '8 days' WHERE key = 'k:alt'`,
    )

    const res = await db.query<{ cleanup_api_rate_limits: number }>(
      'SELECT public.cleanup_api_rate_limits() AS cleanup_api_rate_limits',
    )
    expect(res.rows[0].cleanup_api_rate_limits).toBe(1)

    const rest = await db.query<{ key: string }>('SELECT key FROM public.api_rate_limits')
    expect(rest.rows.map(r => r.key)).toEqual(['k:neu'])
  })
})

describe('Rollback', () => {
  it('entfernt Tabelle und beide Funktionen restlos', async () => {
    const eigene = new PGlite()
    try {
      await eigene.exec(`
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN NOINHERIT; END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN NOINHERIT; END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS; END IF;
        END $$;
      `)
      await eigene.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, MIGRATION), 'utf-8'))
      await eigene.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, ROLLBACK), 'utf-8'))

      const tab = await eigene.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='public' AND tablename='api_rate_limits'`,
      )
      expect(tab.rows[0].n).toBe(0)

      const fn = await eigene.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM pg_proc
          WHERE pronamespace='public'::regnamespace
            AND proname IN ('api_rate_limit_hit','cleanup_api_rate_limits')`,
      )
      expect(fn.rows[0].n).toBe(0)
    } finally {
      await eigene.close()
    }
  })
})
