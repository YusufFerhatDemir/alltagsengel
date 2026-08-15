// HINWEIS: War bisher auf vitest-Syntax (describe/it/expect), lief dadurch
// nie: `npm run test:unit` sammelt alle lib/**/*.test.ts über node:test/tsx
// ein und stirbt am `import ... from 'vitest'` (ESM-in-CJS), `vitest run`
// wiederum inkludiert laut vitest.config.ts nur __tests__/**/*.test.ts im
// Repo-Root, nicht lib/**. Auf node:test umgestellt, analog zu den
// Sibling-Dateien in diesem Verzeichnis.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pruefeBudget } from '../einsatzfreigabe'
import { ENTLASTUNG_JAEHRLICH_EUR } from '@/lib/config/budget-constants'

function mockClientBudgets(row: Record<string, unknown> | null, error: { message: string } | null = null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: row, error }),
            }),
          }),
        }),
      }),
    }),
  } as any
}

test('pruefeBudget: unter 80% → keine Warnung, kein Block', async () => {
  const supabase = mockClientBudgets({
    annual_amount: ENTLASTUNG_JAEHRLICH_EUR, carryover_amount: 0, used_amount: ENTLASTUNG_JAEHRLICH_EUR * 0.79,
    combined_annual_amount: 0, combined_used_amount: 0,
  })
  const ergebnis = await pruefeBudget(supabase, 'client-1', 'org-1', 'entlastung')
  assert.equal(ergebnis.warnung, null)
  assert.equal(ergebnis.blockiert, false)
  assert.equal(ergebnis.prozent, 79)
})

test('pruefeBudget: genau 80% → Warnung, kein Block (Kette 5)', async () => {
  const supabase = mockClientBudgets({
    annual_amount: ENTLASTUNG_JAEHRLICH_EUR, carryover_amount: 0, used_amount: ENTLASTUNG_JAEHRLICH_EUR * 0.8,
    combined_annual_amount: 0, combined_used_amount: 0,
  })
  const ergebnis = await pruefeBudget(supabase, 'client-1', 'org-1', 'entlastung')
  assert.notEqual(ergebnis.warnung, null)
  assert.equal(ergebnis.blockiert, false)
  assert.equal(ergebnis.prozent, 80)
})

test('pruefeBudget: 95% → verschärfte Warnung, weiterhin kein Block', async () => {
  const supabase = mockClientBudgets({
    annual_amount: ENTLASTUNG_JAEHRLICH_EUR, carryover_amount: 0, used_amount: ENTLASTUNG_JAEHRLICH_EUR * 0.95,
    combined_annual_amount: 0, combined_used_amount: 0,
  })
  const ergebnis = await pruefeBudget(supabase, 'client-1', 'org-1', 'entlastung')
  assert.notEqual(ergebnis.warnung, null)
  assert.equal(ergebnis.blockiert, false)
})

test('pruefeBudget: 100%+ → Block (Kette 6, hier VP/KZP-relevant)', async () => {
  const supabase = mockClientBudgets({
    annual_amount: 0, carryover_amount: 0, used_amount: 0,
    combined_annual_amount: 3539, combined_used_amount: 3600,
  })
  const ergebnis = await pruefeBudget(supabase, 'client-1', 'org-1', 'verhinderungspflege')
  assert.equal(ergebnis.blockiert, true)
  assert.ok(ergebnis.warnung?.includes('ausgeschöpft'))
})

test('pruefeBudget: Lesefehler → fail-closed blockiert', async () => {
  const supabase = mockClientBudgets(null, { message: 'db down' })
  const ergebnis = await pruefeBudget(supabase, 'client-1', 'org-1', 'entlastung')
  assert.equal(ergebnis.blockiert, true)
})

test('pruefeBudget: kein Budget hinterlegt (Selbstzahler) → Hinweis, kein Block', async () => {
  const supabase = mockClientBudgets(null)
  const ergebnis = await pruefeBudget(supabase, 'client-1', 'org-1', 'entlastung')
  assert.equal(ergebnis.blockiert, false)
  assert.ok(ergebnis.warnung?.includes('Selbstzahler'))
})
