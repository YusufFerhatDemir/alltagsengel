/**
 * Tests für DSGVO FK-Fix: mis_auth_log_user_id_fkey → ON DELETE SET NULL
 * Stellt sicher, dass Migration, Rollback und Scope korrekt sind.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const ROOT = path.resolve(__dirname, '..')

function readFile(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf-8')
}

function fileExists(rel: string): boolean {
  return fs.existsSync(path.join(ROOT, rel))
}

const MIGRATION_REL = 'supabase/migrations/20260804_fix_mis_auth_log_fk_on_delete.sql'
const ROLLBACK_REL = 'audit/rollback/ROLLBACK_MIS_AUTH_LOG_FK.sql'
const HARD_DELETE_REL = 'supabase/functions/account-hard-delete/index.ts'

describe('DSGVO User Delete FK Fix', () => {
  it('Migration file exists', () => {
    expect(fileExists(MIGRATION_REL)).toBe(true)
  })

  it('Migration uses idempotent constructs (DROP CONSTRAINT IF EXISTS)', () => {
    const sql = readFile(MIGRATION_REL)
    expect(sql).toContain('DROP CONSTRAINT IF EXISTS mis_auth_log_user_id_fkey')
  })

  it('Migration sets ON DELETE SET NULL', () => {
    const sql = readFile(MIGRATION_REL)
    expect(sql).toContain('ON DELETE SET NULL')
  })

  it('Migration references auth.users(id)', () => {
    const sql = readFile(MIGRATION_REL)
    expect(sql).toContain('REFERENCES auth.users(id)')
  })

  it('Migration only modifies mis_auth_log_user_id_fkey (no other FKs)', () => {
    const sql = readFile(MIGRATION_REL)
    const addConstraintMatches = sql.match(/ADD CONSTRAINT/gi) || []
    expect(addConstraintMatches.length).toBe(1)
    expect(sql).toContain('mis_auth_log_user_id_fkey')
    const otherFKs = sql.match(/ADD CONSTRAINT (?!mis_auth_log_user_id_fkey)\w+/gi)
    expect(otherFKs).toBeNull()
  })

  it('Migration does not modify RLS policies', () => {
    const sql = readFile(MIGRATION_REL)
    expect(sql).not.toMatch(/CREATE POLICY/i)
    expect(sql).not.toMatch(/DROP POLICY/i)
    expect(sql).not.toMatch(/ALTER.*ENABLE ROW LEVEL SECURITY/i)
  })

  it('Rollback SQL exists', () => {
    expect(fileExists(ROLLBACK_REL)).toBe(true)
  })

  it('Rollback restores ON DELETE NO ACTION', () => {
    const sql = readFile(ROLLBACK_REL)
    expect(sql).toContain('ON DELETE NO ACTION')
    expect(sql).toContain('DROP CONSTRAINT IF EXISTS mis_auth_log_user_id_fkey')
  })

  it('account-hard-delete does NOT handle mis_auth_log (OK with SET NULL)', () => {
    const ts = readFile(HARD_DELETE_REL)
    // Die Löschfunktion behandelt mis_auth_log NICHT explizit.
    // Mit ON DELETE SET NULL ist das korrekt — Postgres setzt user_id automatisch auf NULL.
    expect(ts).not.toContain("from('mis_auth_log')")
  })
})
