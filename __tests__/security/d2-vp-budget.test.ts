/**
 * D2: VP-Budget (Verhinderungspflege § 39 SGB XI)
 *
 * Prüft:
 * 1) Budget-Konstanten korrekt (gesetzliche Werte 2025)
 * 2) Migration existiert und ist korrekt
 * 3) pruefeBudget unterstützt VP-Budget-Typ
 * 4) pruefeVPBudget prüft Kombinations-Budget VP+KZP
 * 5) Keine Magic Numbers im Code
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'

const REPO_ROOT = path.resolve(__dirname, '../..')
const read = (rel: string) => readFileSync(path.join(REPO_ROOT, rel), 'utf-8')

describe('D2: Budget-Konstanten (gesetzliche Werte)', () => {
  it('exportiert korrekte gesetzliche Budgetgrenzen', async () => {
    const mod = await import('../../lib/config/budget-constants')
    expect(mod.ENTLASTUNG_MONATLICH_EUR).toBe(131)
    expect(mod.ENTLASTUNG_JAEHRLICH_EUR).toBe(1572)
    expect(mod.VP_JAEHRLICH_EUR).toBe(1612)
    expect(mod.KZP_JAEHRLICH_EUR).toBe(1774)
    expect(mod.VP_KZP_KOMBINIERT_EUR).toBe(3386)
  })

  it('VP + KZP = Kombinations-Budget', async () => {
    const mod = await import('../../lib/config/budget-constants')
    expect(mod.VP_JAEHRLICH_EUR + mod.KZP_JAEHRLICH_EUR).toBe(mod.VP_KZP_KOMBINIERT_EUR)
  })
})

describe('D2: VP-Budget Migration', () => {
  const MIGRATION = 'supabase/migrations/20260831020000_d2_vp_budget.sql'
  const ROLLBACK = 'supabase/migrations/20260831020001_rollback_d2_vp_budget.sql'

  it('Migration existiert', () => {
    expect(existsSync(path.join(REPO_ROOT, MIGRATION))).toBe(true)
  })

  it('Rollback existiert', () => {
    expect(existsSync(path.join(REPO_ROOT, ROLLBACK))).toBe(true)
  })

  const sql = read(MIGRATION)

  it('fügt budget_type-Spalte hinzu', () => {
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS budget_type')
    expect(sql).toContain("DEFAULT 'entlastung'")
  })

  it('CHECK-Constraint enthält verhinderungspflege', () => {
    expect(sql).toContain('client_budgets_budget_type_check')
    expect(sql).toContain("'entlastung'")
    expect(sql).toContain("'verhinderungspflege'")
  })

  it('UNIQUE-Constraint für Doppelbuchungsschutz', () => {
    expect(sql).toContain('client_budgets_client_year_type_unique')
    expect(sql).toContain('client_id, year, budget_type')
  })

  it('korrigiert combined_annual_amount-Default auf 3386', () => {
    expect(sql).toContain('3386')
  })

  it('ist idempotent (IF NOT EXISTS)', () => {
    expect(sql).toContain('IF NOT EXISTS')
  })

  it('enthält Transaktions-Klammern', () => {
    expect(sql).toContain('BEGIN')
    expect(sql).toContain('COMMIT')
  })
})

describe('D2: pruefeBudget VP-Unterstützung', () => {
  it('akzeptiert budgetTyp-Parameter', () => {
    const src = read('lib/personal/einsatzfreigabe.ts')
    expect(src).toContain("budgetTyp: BudgetTyp = 'entlastung'")
  })

  it('filtert nach budget_type', () => {
    const src = read('lib/personal/einsatzfreigabe.ts')
    expect(src).toContain(".eq('budget_type', budgetTyp)")
  })

  it('verwendet VP_JAEHRLICH_EUR als Default für VP', () => {
    const src = read('lib/personal/einsatzfreigabe.ts')
    expect(src).toContain('VP_JAEHRLICH_EUR')
    expect(src).toContain('ENTLASTUNG_JAEHRLICH_EUR')
  })

  it('VP-Budget-Warnung ist klar beschriftet', () => {
    const src = read('lib/personal/einsatzfreigabe.ts')
    expect(src).toContain("'VP-Budget'")
  })
})

describe('D2: pruefeVPBudget (Kombinations-Budget)', () => {
  it('exportiert pruefeVPBudget-Funktion', () => {
    const src = read('lib/personal/einsatzfreigabe.ts')
    expect(src).toContain('export async function pruefeVPBudget')
  })

  it('prüft VP+KZP Kombinationsbudget', () => {
    const src = read('lib/personal/einsatzfreigabe.ts')
    expect(src).toContain('VP_KZP_KOMBINIERT_EUR')
    expect(src).toContain('vpKzpKombiniertWarnung')
  })

  it('gibt vpKzpKombiniertWarnung zurück', () => {
    const src = read('lib/personal/einsatzfreigabe.ts')
    expect(src).toContain('vpKzpKombiniertWarnung: string | null')
  })
})

describe('D2: Keine Magic Numbers', () => {
  it('pruefeBudget enthält keine hartcodierten Budget-Werte', () => {
    const src = read('lib/personal/einsatzfreigabe.ts')
    const pruefeBudgetSection = src.slice(src.indexOf('async function pruefeBudget'))
    expect(pruefeBudgetSection).not.toContain('1572')
    expect(pruefeBudgetSection).not.toContain('1612')
    expect(pruefeBudgetSection).not.toContain('3386')
  })

  it('Budget-Konstanten kommen aus config-Modul', () => {
    const src = read('lib/personal/einsatzfreigabe.ts')
    expect(src).toContain("from '@/lib/config/budget-constants'")
  })
})
