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

// ═══════════════════════════════════════════════════════════════════
// § 45b-Übertrag verfällt am 30.06. (Befund 27.08.2026)
// ═══════════════════════════════════════════════════════════════════
//
// `available` schlug den carryover ganzjährig auf. Im zweiten Halbjahr
// rechnete die Prüfung damit gegen ein Budget, das es nicht mehr gibt:
// die 95-/100-Prozent-Schwellen schlugen zu spät oder gar nicht an, und
// die Disposition gab Einsätze frei, die niemand mehr bezahlt.
//
// pruefeBudget() stellt auf HEUTE ab (Planungsprüfung, kein Abrechnungs-
// monat). Die Fälle unten setzen carryover_expires deshalb relativ zum
// heutigen Tag, statt ein festes Datum zu unterstellen.

function tagVerschoben(tage: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + tage)
  return d.toISOString().slice(0, 10)
}

test('pruefeBudget: noch nicht verfallener Übertrag erhöht das verfügbare Budget', async () => {
  // 1000 Anspruch + 1000 Übertrag = 2000 verfügbar, 1000 verbraucht → 50%.
  const supabase = mockClientBudgets({
    annual_amount: 1000, carryover_amount: 1000, carryover_expires: tagVerschoben(30),
    used_amount: 1000, combined_annual_amount: 0, combined_used_amount: 0,
  })
  const ergebnis = await pruefeBudget(supabase, 'client-1', 'org-1', 'entlastung')
  assert.equal(ergebnis.prozent, 50)
  assert.equal(ergebnis.blockiert, false)
})

test('pruefeBudget: verfallener Übertrag zählt nicht mehr mit → Block', async () => {
  // Dieselben Zahlen, Übertrag gestern verfallen: 1000 verfügbar,
  // 1000 verbraucht → 100% und Block. Vorher meldete dieser Fall 50%.
  const supabase = mockClientBudgets({
    annual_amount: 1000, carryover_amount: 1000, carryover_expires: tagVerschoben(-1),
    used_amount: 1000, combined_annual_amount: 0, combined_used_amount: 0,
  })
  const ergebnis = await pruefeBudget(supabase, 'client-1', 'org-1', 'entlastung')
  assert.equal(ergebnis.prozent, 100)
  assert.equal(ergebnis.blockiert, true)
})

test('pruefeBudget: Übertrag gilt am Verfallstag selbst noch', async () => {
  const supabase = mockClientBudgets({
    annual_amount: 1000, carryover_amount: 1000, carryover_expires: tagVerschoben(0),
    used_amount: 1000, combined_annual_amount: 0, combined_used_amount: 0,
  })
  const ergebnis = await pruefeBudget(supabase, 'client-1', 'org-1', 'entlastung')
  assert.equal(ergebnis.prozent, 50)
})

test('pruefeBudget: ohne carryover_expires gilt der gesetzliche 30.06.', async () => {
  // Kein geratener Ersatzwert, sondern § 45b Abs. 1 S. 4 SGB XI selbst.
  const imErstenHalbjahr = new Date().toISOString().slice(5, 10) <= '06-30'
  const supabase = mockClientBudgets({
    annual_amount: 1000, carryover_amount: 1000, carryover_expires: null,
    used_amount: 1000, combined_annual_amount: 0, combined_used_amount: 0,
  })
  const ergebnis = await pruefeBudget(supabase, 'client-1', 'org-1', 'entlastung')
  assert.equal(ergebnis.prozent, imErstenHalbjahr ? 50 : 100)
})

test('pruefeBudget: § 42a kennt keinen Übertrag — carryover bleibt dort außen vor', async () => {
  const supabase = mockClientBudgets({
    annual_amount: 0, carryover_amount: 5000, carryover_expires: tagVerschoben(30),
    used_amount: 0, combined_annual_amount: 1000, combined_used_amount: 1000,
  })
  const ergebnis = await pruefeBudget(supabase, 'client-1', 'org-1', 'verhinderungspflege')
  assert.equal(ergebnis.prozent, 100)
  assert.equal(ergebnis.blockiert, true)
})
