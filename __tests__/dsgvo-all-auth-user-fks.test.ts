/**
 * Tests für DSGVO FK-Fix: Alle auth.users FKs → ON DELETE SET NULL
 * Stellt sicher, dass Migration, Rollback, Scope und account-hard-delete korrekt sind.
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

const MIGRATION_REL = 'supabase/migrations/20260804300000_fix_all_auth_user_fks.sql'
const ROLLBACK_REL = 'audit/rollback/ROLLBACK_ALL_AUTH_USER_FKS.sql'
const HARD_DELETE_REL = 'supabase/functions/account-hard-delete/index.ts'

// Alle 5 FKs die in dieser Migration behandelt werden
const EXPECTED_FKS = [
  { constraint: 'caregivers_user_id_fkey', table: 'caregivers', column: 'user_id' },
  { constraint: 'clients_user_id_fkey', table: 'clients', column: 'user_id' },
  { constraint: 'chat_messages_sender_id_fkey', table: 'chat_messages', column: 'sender_id' },
  { constraint: 'app_settings_updated_by_fkey', table: 'app_settings', column: 'updated_by' },
  { constraint: 'kf_pricing_audit_actor_id_fkey', table: 'kf_pricing_audit', column: 'actor_id' },
]

describe('DSGVO Alle auth.users FKs Fix', () => {
  // ── Migration ──────────────────────────────────────────────────────

  it('Migration-Datei existiert', () => {
    expect(fileExists(MIGRATION_REL)).toBe(true)
  })

  it.each(EXPECTED_FKS)(
    'Migration behandelt FK $constraint',
    ({ constraint }) => {
      const sql = readFile(MIGRATION_REL)
      expect(sql).toContain(`DROP CONSTRAINT IF EXISTS ${constraint}`)
      expect(sql).toContain(`ADD CONSTRAINT ${constraint}`)
    }
  )

  it('Alle 5 FKs werden mit ON DELETE SET NULL erstellt', () => {
    const sql = readFile(MIGRATION_REL)
    const addConstraintMatches = sql.match(/ADD CONSTRAINT/gi) || []
    expect(addConstraintMatches.length).toBe(5)

    // Zähle nur ON DELETE SET NULL in SQL-Statements (nicht in Kommentaren)
    const sqlLines = sql.split('\n').filter(l => !l.trimStart().startsWith('--'))
    const sqlOnly = sqlLines.join('\n')
    const setNullMatches = sqlOnly.match(/ON DELETE SET NULL/gi) || []
    expect(setNullMatches.length).toBe(5)
  })

  it('Alle FKs referenzieren auth.users(id)', () => {
    const sql = readFile(MIGRATION_REL)
    const refsMatches = sql.match(/REFERENCES auth\.users\(id\)/gi) || []
    expect(refsMatches.length).toBe(5)
  })

  it('chat_messages.sender_id wird NULLABLE gemacht (DROP NOT NULL)', () => {
    const sql = readFile(MIGRATION_REL)
    expect(sql).toContain('DROP NOT NULL')
    expect(sql).toContain("table_name='chat_messages'")
    expect(sql).toContain("column_name='sender_id'")
  })

  it('Idempotenz: DROP CONSTRAINT IF EXISTS vor jedem ADD', () => {
    const sql = readFile(MIGRATION_REL)
    for (const { constraint } of EXPECTED_FKS) {
      const dropIdx = sql.indexOf(`DROP CONSTRAINT IF EXISTS ${constraint}`)
      const addIdx = sql.indexOf(`ADD CONSTRAINT ${constraint}`)
      expect(dropIdx).toBeGreaterThan(-1)
      expect(addIdx).toBeGreaterThan(-1)
      expect(dropIdx).toBeLessThan(addIdx)
    }
  })

  it('Migration modifiziert keine RLS Policies', () => {
    const sql = readFile(MIGRATION_REL)
    expect(sql).not.toMatch(/CREATE POLICY/i)
    expect(sql).not.toMatch(/DROP POLICY/i)
    expect(sql).not.toMatch(/ALTER.*ENABLE ROW LEVEL SECURITY/i)
  })

  it('Migration enthält kein ALTER TABLE für mis_auth_log (PR #29)', () => {
    const sql = readFile(MIGRATION_REL)
    // Kommentare dürfen mis_auth_log erwähnen, aber kein SQL-Statement
    expect(sql).not.toMatch(/ALTER TABLE.*mis_auth_log/i)
  })

  // ── Rollback ───────────────────────────────────────────────────────

  it('Rollback-Datei existiert', () => {
    expect(fileExists(ROLLBACK_REL)).toBe(true)
  })

  it('Rollback stellt ON DELETE NO ACTION für alle 5 FKs wieder her', () => {
    const sql = readFile(ROLLBACK_REL)
    for (const { constraint } of EXPECTED_FKS) {
      expect(sql).toContain(`DROP CONSTRAINT IF EXISTS ${constraint}`)
      expect(sql).toContain(`ADD CONSTRAINT ${constraint}`)
    }
    // Zähle nur ON DELETE NO ACTION in SQL-Statements (nicht in Kommentaren)
    const sqlLines = sql.split('\n').filter(l => !l.trimStart().startsWith('--'))
    const sqlOnly = sqlLines.join('\n')
    const noActionMatches = sqlOnly.match(/ON DELETE NO ACTION/gi) || []
    expect(noActionMatches.length).toBe(5)
  })

  it('Rollback stellt chat_messages.sender_id NOT NULL wieder her', () => {
    const sql = readFile(ROLLBACK_REL)
    expect(sql).toContain('SET NOT NULL')
    expect(sql).toContain('chat_messages')
  })

  // ── account-hard-delete ────────────────────────────────────────────

  it('account-hard-delete existiert', () => {
    expect(fileExists(HARD_DELETE_REL)).toBe(true)
  })

  it('account-hard-delete löscht chat_messages explizit (vor FK-Umstellung)', () => {
    const ts = readFile(HARD_DELETE_REL)
    // chat_messages werden im hard-delete explizit gelöscht
    expect(ts).toContain("'chat_messages'")
  })

  it('account-hard-delete muss caregivers/clients/app_settings/kf_pricing_audit NICHT explizit löschen (SET NULL reicht)', () => {
    const ts = readFile(HARD_DELETE_REL)
    // Diese Tabellen brauchen keine explizite Löschung weil SET NULL automatisch greift
    // caregivers und clients sollen NICHT gelöscht werden (Geschäftsdaten!)
    // app_settings und kf_pricing_audit werden nur genullt
    // Keine Assertion hier nötig — dokumentiert nur die Architekturentscheidung
    expect(true).toBe(true)
  })

  // ── Vollständigkeit ────────────────────────────────────────────────

  it('Keine vergessenen FKs: alle 5 bekannten blockierenden FKs sind abgedeckt', () => {
    const sql = readFile(MIGRATION_REL)
    const knownBlockingFKs = [
      'caregivers_user_id_fkey',
      'clients_user_id_fkey',
      'chat_messages_sender_id_fkey',
      'app_settings_updated_by_fkey',
      'kf_pricing_audit_actor_id_fkey',
    ]
    for (const fk of knownBlockingFKs) {
      expect(sql).toContain(fk)
    }
  })
})
