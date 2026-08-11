/**
 * P0-Regression: generate_referral_code() (BEFORE INSERT auf public.profiles)
 * muss `extensions` im search_path haben, weil pgcrypto (gen_random_bytes) bei
 * Supabase im Schema `extensions` liegt, nicht in `public`.
 *
 * Vorfall 2026-08-11: die Funktion hatte
 *     SET search_path = public, pg_temp
 * (20260101000100_baseline_live_only_functions.sql) und rief
 * gen_random_bytes() unqualifiziert auf. Jede Neuregistrierung scheiterte mit
 * "function gen_random_bytes(integer) does not exist", weil der Trigger vor
 * dem INSERT auf profiles feuert. Live gegen Production reproduziert und per
 * SQL-Editor gefixt; Fix hier als Migration
 * 20260811210000_fix_referral_code_search_path.sql nachgezogen.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const MIGRATIONEN = join(process.cwd(), 'supabase', 'migrations')
const FIX = '20260811210000_fix_referral_code_search_path.sql'
const ROLLBACK = '20260811210001_rollback_fix_referral_code_search_path.sql'

function lesen(datei: string): string {
  return readFileSync(join(MIGRATIONEN, datei), 'utf8')
}

function ohneKommentare(sql: string): string {
  return sql.split('\n').map(z => z.replace(/--.*$/, '')).join('\n')
}

function funktionsKoerper(sql: string, name: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`)
  expect(start, `${name} nicht gefunden`).toBeGreaterThan(-1)
  const ende = sql.indexOf('$$;', start)
  return sql.slice(start, ende + 3)
}

describe('generate_referral_code(): search_path enthaelt extensions', () => {
  it('Fix-Migration existiert', () => {
    expect(existsSync(join(MIGRATIONEN, FIX))).toBe(true)
  })

  it('Rollback-Migration existiert', () => {
    expect(existsSync(join(MIGRATIONEN, ROLLBACK))).toBe(true)
  })

  it('setzt search_path auf public, extensions, pg_temp', () => {
    const sql = lesen(FIX)
    const body = funktionsKoerper(ohneKommentare(sql), 'generate_referral_code')
    expect(body).toMatch(/SET search_path\s*=\s*public\s*,\s*extensions\s*,\s*pg_temp/i)
  })

  it('ruft gen_random_bytes ueber das extensions-Schema qualifiziert auf', () => {
    const sql = lesen(FIX)
    const body = funktionsKoerper(ohneKommentare(sql), 'generate_referral_code')
    expect(body).toMatch(/extensions\.gen_random_bytes\(/)
  })

  it('die zuletzt angewendete Migration definiert generate_referral_code() mit extensions im search_path', () => {
    // Migrationen laufen sequenziell (Datei-Timestamp-Reihenfolge) — nur die
    // LETZTE CREATE OR REPLACE-Definition zaehlt fuer den Live-Zustand.
    const dateien = readdirSync(MIGRATIONEN)
      .filter(f => f.endsWith('.sql') && !f.includes('rollback'))
      .sort()

    let letzterSearchPath: string | null = null
    for (const datei of dateien) {
      const sql = ohneKommentare(lesen(datei))
      if (!sql.includes('CREATE OR REPLACE FUNCTION public.generate_referral_code')) continue
      const body = funktionsKoerper(sql, 'generate_referral_code')
      const treffer = body.match(/SET search_path\s*=\s*([^\n]+)/i)
      if (treffer) letzterSearchPath = treffer[1].trim()
    }

    expect(letzterSearchPath, 'generate_referral_code() wurde nie definiert — unerwartet').not.toBeNull()
    expect(letzterSearchPath).toMatch(/extensions/)
  })
})

describe('handle_new_user(): kein pgcrypto-Aufruf, search_path-Fix nicht noetig', () => {
  it('Funktionskoerper ruft keine pgcrypto-Funktion (gen_random_bytes/digest/crypt) auf', () => {
    const sql = ohneKommentare(lesen('20250101000000_core_tables_baseline.sql'))
    const body = funktionsKoerper(sql, 'handle_new_user')
    expect(body).not.toMatch(/\b(gen_random_bytes|digest|crypt|gen_salt)\s*\(/)
  })
})
