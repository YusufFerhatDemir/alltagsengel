import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

describe('Absences: Self-Approval-Bypass verhindert', () => {
  const migration = fs.readFileSync(
    path.resolve('supabase/migrations/20260917000002_fix_absences_self_approval.sql'),
    'utf-8'
  )

  it('Policy erzwingt status = beantragt bei INSERT', () => {
    expect(migration).toContain("AND status = 'beantragt'")
  })

  it('Policy nutzt eigene_caregiver_ids ODER direkten user_id-Check', () => {
    expect(migration).toMatch(/cg\.user_id\s*=\s*auth\.uid\(\)|eigene_caregiver_ids/)
  })

  it('ersetzt die alte Policy ohne Status-Check', () => {
    expect(migration).toContain('DROP POLICY IF EXISTS engel_absences_insert')
  })
})
