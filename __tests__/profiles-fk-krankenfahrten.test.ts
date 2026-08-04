/**
 * Tests für DSGVO FK-Fix: Alle public.profiles FKs → ON DELETE SET NULL
 * Stellt sicher, dass Migration alle blockierenden FKs behandelt,
 * idempotent ist und Rollback existiert.
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

const MIGRATION_REL = 'supabase/migrations/20260804400000_fix_profiles_fk_on_delete.sql'
const ROLLBACK_REL = 'audit/rollback/ROLLBACK_PROFILES_FK.sql'

// Alle 13 blockierenden FKs die behandelt werden müssen
const EXPECTED_FKS = [
  { constraint: 'krankenfahrten_customer_id_fkey', table: 'krankenfahrten', column: 'customer_id', wasNotNull: true },
  { constraint: 'bookings_customer_id_fkey', table: 'bookings', column: 'customer_id', wasNotNull: true },
  { constraint: 'hygienebox_orders_user_id_fkey', table: 'hygienebox_orders', column: 'user_id', wasNotNull: true },
  { constraint: 'krankenfahrt_providers_user_id_fkey', table: 'krankenfahrt_providers', column: 'user_id', wasNotNull: true },
  { constraint: 'krankenfahrt_reviews_customer_id_fkey', table: 'krankenfahrt_reviews', column: 'customer_id', wasNotNull: true },
  { constraint: 'kf_booking_reviews_assigned_to_fkey', table: 'kf_booking_reviews', column: 'assigned_to', wasNotNull: false },
  { constraint: 'kf_booking_reviews_reviewed_by_fkey', table: 'kf_booking_reviews', column: 'reviewed_by', wasNotNull: false },
  { constraint: 'kf_partners_user_id_fkey', table: 'kf_partners', column: 'user_id', wasNotNull: false },
  { constraint: 'kf_pricing_rules_created_by_fkey', table: 'kf_pricing_rules', column: 'created_by', wasNotNull: false },
  { constraint: 'profiles_referred_by_fkey', table: 'profiles', column: 'referred_by', wasNotNull: false },
  { constraint: 'referrals_referred_id_fkey', table: 'referrals', column: 'referred_id', wasNotNull: true },
  { constraint: 'referrals_referrer_id_fkey', table: 'referrals', column: 'referrer_id', wasNotNull: true },
  { constraint: 'reviews_reviewer_id_fkey', table: 'reviews', column: 'reviewer_id', wasNotNull: true },
]

// Geschäftsdaten-Tabellen die NIEMALS CASCADE haben dürfen
const BUSINESS_TABLES = [
  'krankenfahrten',
  'bookings',
  'hygienebox_orders',
  'krankenfahrt_providers',
  'krankenfahrt_reviews',
  'kf_booking_reviews',
  'reviews',
  'referrals',
]

describe('DSGVO profiles FKs Fix', () => {
  // ── Migration ──────────────────────────────────────────────────────

  it('Migration-Datei existiert', () => {
    expect(fileExists(MIGRATION_REL)).toBe(true)
  })

  it.each(EXPECTED_FKS)(
    'Migration behandelt FK $constraint',
    ({ constraint }) => {
      const sql = readFile(MIGRATION_REL)
      expect(sql).toContain(constraint)
    },
  )

  it.each(EXPECTED_FKS)(
    'Migration setzt ON DELETE SET NULL für $constraint',
    ({ constraint }) => {
      const sql = readFile(MIGRATION_REL)
      // Der Constraint muss mit SET NULL neu erstellt werden
      const pattern = new RegExp(
        `ADD CONSTRAINT ${constraint}[\\s\\S]*?ON DELETE SET NULL`,
      )
      expect(sql).toMatch(pattern)
    },
  )

  it('Alle 13 blockierenden FKs werden behandelt', () => {
    const sql = readFile(MIGRATION_REL)
    for (const fk of EXPECTED_FKS) {
      expect(sql).toContain(fk.constraint)
    }
  })

  // ── NOT NULL → NULLABLE ────────────────────────────────────────────

  it.each(EXPECTED_FKS.filter(f => f.wasNotNull))(
    'Migration macht $table.$column NULLABLE (DROP NOT NULL)',
    ({ table, column }) => {
      const sql = readFile(MIGRATION_REL)
      expect(sql).toContain(`table_name='${table}'`)
      expect(sql).toContain(`column_name='${column}'`)
      expect(sql).toContain('DROP NOT NULL')
    },
  )

  // ── Idempotenz ─────────────────────────────────────────────────────

  it('Migration enthält Idempotenz-Konstrukte (DO $$ BEGIN / IF EXISTS)', () => {
    const sql = readFile(MIGRATION_REL)
    expect(sql).toContain('DO $$ BEGIN')
    expect(sql).toContain('IF EXISTS')
    expect(sql).toContain('DROP CONSTRAINT IF EXISTS')
  })

  // ── Keine CASCADE auf Geschäftsdaten ───────────────────────────────

  it.each(BUSINESS_TABLES)(
    'Migration verwendet KEIN CASCADE für Geschäftstabelle %s',
    (table) => {
      const sql = readFile(MIGRATION_REL)
      // Finde alle FK-Definitionen für diese Tabelle
      const tableBlocks = sql.split(new RegExp(`ALTER TABLE public\\.${table}`))
      for (const block of tableBlocks.slice(1)) {
        // Nur die nächste Zeile nach ADD CONSTRAINT prüfen
        if (block.includes('ADD CONSTRAINT') && block.includes('REFERENCES public.profiles')) {
          expect(block).not.toMatch(/ON DELETE CASCADE/)
        }
      }
    },
  )

  // ── Rollback ───────────────────────────────────────────────────────

  it('Rollback-SQL existiert', () => {
    expect(fileExists(ROLLBACK_REL)).toBe(true)
  })

  it('Rollback behandelt alle 13 FKs', () => {
    const sql = readFile(ROLLBACK_REL)
    for (const fk of EXPECTED_FKS) {
      expect(sql).toContain(fk.constraint)
    }
  })

  it.each(EXPECTED_FKS.filter(f => f.wasNotNull))(
    'Rollback stellt NOT NULL für $table.$column wieder her',
    ({ table, column }) => {
      const sql = readFile(ROLLBACK_REL)
      expect(sql).toContain(`SET NOT NULL`)
      // Der Rollback muss die Spalte der richtigen Tabelle betreffen
      const pattern = new RegExp(
        `ALTER TABLE public\\.${table}[\\s\\S]*?${column} SET NOT NULL`,
      )
      expect(sql).toMatch(pattern)
    },
  )

  it('Rollback setzt FKs auf NO ACTION zurück (kein ON DELETE)', () => {
    const sql = readFile(ROLLBACK_REL)
    // Rollback-FKs dürfen kein ON DELETE SET NULL haben
    const addConstraintBlocks = sql.match(/ADD CONSTRAINT[\s\S]*?;/g) || []
    for (const block of addConstraintBlocks) {
      expect(block).not.toContain('ON DELETE SET NULL')
    }
  })
})
