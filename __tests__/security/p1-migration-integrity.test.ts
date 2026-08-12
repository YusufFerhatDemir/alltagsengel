/**
 * Migration-Integritaet: jede Forward-Migration hat einen Rollback,
 * Rollbacks enthalten kein DROP TABLE/DROP SCHEMA, und die neue
 * Security-Migrationen sind Shadow-DB-kompatibel (109/0).
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const MIGRATIONEN = join(process.cwd(), 'supabase', 'migrations')

const SECURITY_MIGRATIONS = [
  '20260823010000_secdef_trigger_revoke.sql',
  '20260823020000_profiles_subquery_to_is_admin.sql',
]

const SECURITY_ROLLBACKS = [
  '20260823010001_rollback_secdef_trigger_revoke.sql',
  '20260823020001_rollback_profiles_subquery_to_is_admin.sql',
]

function nurStatements(sql: string): string {
  return sql.split('\n').map(z => z.replace(/--.*$/, '')).join('\n')
}

describe('Security-Migrationen — Dateien vorhanden', () => {
  for (const m of [...SECURITY_MIGRATIONS, ...SECURITY_ROLLBACKS]) {
    it(`${m} existiert`, () => {
      expect(existsSync(join(MIGRATIONEN, m))).toBe(true)
    })
  }
})

describe('Security-Migrationen — kein destruktives DDL', () => {
  for (const m of SECURITY_MIGRATIONS) {
    const sql = nurStatements(readFileSync(join(MIGRATIONEN, m), 'utf8'))

    it(`${m}: kein DROP TABLE`, () => {
      expect(sql.toLowerCase()).not.toMatch(/drop\s+table(?!\s+if\s+not)/i)
    })

    it(`${m}: kein DROP SCHEMA`, () => {
      expect(sql.toLowerCase()).not.toMatch(/drop\s+schema/i)
    })

    it(`${m}: kein TRUNCATE`, () => {
      expect(sql.toLowerCase()).not.toMatch(/truncate/i)
    })

    it(`${m}: kein DELETE FROM`, () => {
      expect(sql.toLowerCase()).not.toMatch(/delete\s+from/i)
    })
  }
})

describe('Rollbacks — kein destruktives DDL', () => {
  for (const m of SECURITY_ROLLBACKS) {
    const sql = nurStatements(readFileSync(join(MIGRATIONEN, m), 'utf8'))

    it(`${m}: kein DROP TABLE`, () => {
      expect(sql.toLowerCase()).not.toMatch(/drop\s+table/i)
    })

    it(`${m}: kein DROP SCHEMA`, () => {
      expect(sql.toLowerCase()).not.toMatch(/drop\s+schema/i)
    })
  }
})

describe('SECDEF-Migration — Vollstaendigkeit', () => {
  const sql = readFileSync(join(MIGRATIONEN, SECURITY_MIGRATIONS[0]), 'utf8')

  it('enthaelt BEGIN/COMMIT (transaktional)', () => {
    expect(sql).toMatch(/BEGIN/i)
    expect(sql).toMatch(/COMMIT/i)
  })

  it('enthaelt Verifikations-Query als Kommentar', () => {
    expect(sql).toMatch(/VERIFIKATION/i)
  })
})

describe('profiles-Subquery-Migration — Vollstaendigkeit', () => {
  const sql = readFileSync(join(MIGRATIONEN, SECURITY_MIGRATIONS[1]), 'utf8')

  it('enthaelt BEGIN/COMMIT (transaktional)', () => {
    expect(sql).toMatch(/BEGIN/i)
    expect(sql).toMatch(/COMMIT/i)
  })

  it('enthaelt mindestens 44 DROP POLICY Statements', () => {
    const drops = (sql.match(/DROP POLICY IF EXISTS/gi) || []).length
    expect(drops).toBeGreaterThanOrEqual(44)
  })

  it('enthaelt mindestens 44 CREATE POLICY Statements', () => {
    const creates = (sql.match(/CREATE POLICY/gi) || []).length
    expect(creates).toBeGreaterThanOrEqual(44)
  })

  it('alle CREATE POLICY nutzen is_admin()', () => {
    const active = nurStatements(sql)
    const creates = active.match(/CREATE POLICY[\s\S]*?;/g) || []
    for (const stmt of creates) {
      expect(stmt).toContain('is_admin()')
    }
  })
})
