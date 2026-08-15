import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

describe('D2 Budget-Trigger-Migration: korrekte Spaltennamen', () => {
  const sql = fs.readFileSync(
    path.resolve('supabase/migrations/20260831030000_d2_fix_budget_type_trigger.sql'),
    'utf-8'
  )

  it('referenziert date statt service_date auf service_records', () => {
    expect(sql).not.toContain('service_date')
    expect(sql).toMatch(/FROM\s+(OLD|NEW)\.date/)
  })

  it('referenziert amount statt total_amount auf service_records', () => {
    expect(sql).not.toContain('total_amount')
    expect(sql).toContain('SUM(amount)')
  })

  it('filtert auf EXTRACT(YEAR FROM date)', () => {
    expect(sql).toContain("EXTRACT(YEAR FROM date)")
  })
})
