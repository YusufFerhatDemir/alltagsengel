import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { erstelleInitialBudgets, uebertrageJahresbudgets } from '../auto-budget'

function mockSupabaseForInitial(
  existingTypes: string[] = [],
  insertError: { message: string } | null = null,
) {
  const inserted: Record<string, unknown>[][] = []
  return {
    client: {
      from: (table: string) => {
        if (table !== 'client_budgets') return {}
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  data: existingTypes.map(t => ({ budget_type: t })),
                  error: null,
                  then: (fn: any) => fn({
                    data: existingTypes.map(t => ({ budget_type: t })),
                    error: null,
                  }),
                }),
              }),
            }),
          }),
          insert: (rows: Record<string, unknown>[]) => {
            inserted.push(rows)
            return { error: insertError }
          },
        }
      },
    } as never,
    inserted,
  }
}

describe('erstelleInitialBudgets', () => {
  test('PG 2 → Entlastung + VP/KZP angelegt', async () => {
    const mock = mockSupabaseForInitial()
    const result = await erstelleInitialBudgets(mock.client, 'client-1', 'org-1', 2)
    assert.equal(result.erstellt, true)
    assert.equal(mock.inserted.length, 1)
    assert.equal(mock.inserted[0].length, 2)
    const typen = mock.inserted[0].map((r: any) => r.budget_type).sort()
    assert.deepEqual(typen, ['entlastung', 'verhinderungspflege'])
  })

  test('PG 1 → NUR Entlastung, KEIN VP/KZP (§42a erfordert PG ≥ 2)', async () => {
    const mock = mockSupabaseForInitial()
    const result = await erstelleInitialBudgets(mock.client, 'client-pg1', 'org-1', 1)
    assert.equal(result.erstellt, true)
    assert.equal(mock.inserted[0].length, 1)
    assert.equal((mock.inserted[0][0] as any).budget_type, 'entlastung')
  })

  test('Entlastung: 131 €/Monat × 12 = 1.572 € bei Jahresbeginn', async () => {
    const mock = mockSupabaseForInitial()
    await erstelleInitialBudgets(mock.client, 'c-full', 'org-1', 2, 1)
    const entlastung = mock.inserted[0].find((r: any) => r.budget_type === 'entlastung') as any
    assert.equal(entlastung.annual_amount, 1572)
    assert.equal(entlastung.monthly_amount, 131)
  })

  test('Unterjähriger PG-Beginn Juli → anteilig 6 × 131 = 786 €', async () => {
    const mock = mockSupabaseForInitial()
    await erstelleInitialBudgets(mock.client, 'c-juli', 'org-1', 3, 7)
    const entlastung = mock.inserted[0].find((r: any) => r.budget_type === 'entlastung') as any
    assert.equal(entlastung.annual_amount, 786)
    assert.equal(entlastung.monthly_amount, 131)
  })

  test('Unterjähriger PG-Beginn Dezember → 1 × 131 = 131 €', async () => {
    const mock = mockSupabaseForInitial()
    await erstelleInitialBudgets(mock.client, 'c-dez', 'org-1', 2, 12)
    const entlastung = mock.inserted[0].find((r: any) => r.budget_type === 'entlastung') as any
    assert.equal(entlastung.annual_amount, 131)
  })

  test('VP/KZP: 3.539 € als gemeinsames Limit', async () => {
    const mock = mockSupabaseForInitial()
    await erstelleInitialBudgets(mock.client, 'c-vp', 'org-1', 2, 1)
    const vp = mock.inserted[0].find((r: any) => r.budget_type === 'verhinderungspflege') as any
    assert.equal(vp.annual_amount, 3539)
    assert.equal(vp.combined_annual_amount, 3539)
  })

  test('Klient ohne Pflegegrad → kein Budget', async () => {
    const mock = mockSupabaseForInitial()
    const result = await erstelleInitialBudgets(mock.client, 'client-2', 'org-1', 0)
    assert.equal(result.erstellt, false)
    assert.equal(result.fehler, 'Kein Budget ohne Pflegegrad')
    assert.equal(mock.inserted.length, 0)
  })

  test('Budgets existieren bereits → idempotent, kein Duplikat', async () => {
    const mock = mockSupabaseForInitial(['entlastung', 'verhinderungspflege'])
    const result = await erstelleInitialBudgets(mock.client, 'client-3', 'org-1', 3)
    assert.equal(result.erstellt, false)
    assert.equal(mock.inserted.length, 0)
  })

  test('Nur Entlastung existiert → nur VP wird angelegt', async () => {
    const mock = mockSupabaseForInitial(['entlastung'])
    const result = await erstelleInitialBudgets(mock.client, 'client-4', 'org-1', 2)
    assert.equal(result.erstellt, true)
    assert.equal(mock.inserted[0].length, 1)
    assert.equal((mock.inserted[0][0] as any).budget_type, 'verhinderungspflege')
  })

  test('organization_id wird korrekt gesetzt', async () => {
    const mock = mockSupabaseForInitial()
    await erstelleInitialBudgets(mock.client, 'client-5', 'org-xyz', 1)
    for (const row of mock.inserted[0]) {
      assert.equal((row as any).organization_id, 'org-xyz')
    }
  })

  test('Pflegegradwechsel 1→3: Budget bleibt 131 €/Mon (Betrag ändert sich nicht)', async () => {
    const mock = mockSupabaseForInitial()
    await erstelleInitialBudgets(mock.client, 'c-pg1', 'org-1', 1, 1)
    const entlastung1 = mock.inserted[0].find((r: any) => r.budget_type === 'entlastung') as any
    assert.equal(entlastung1.monthly_amount, 131)

    const mock3 = mockSupabaseForInitial()
    await erstelleInitialBudgets(mock3.client, 'c-pg3', 'org-1', 3, 1)
    const entlastung3 = mock3.inserted[0].find((r: any) => r.budget_type === 'entlastung') as any
    assert.equal(entlastung3.monthly_amount, 131)
  })
})

function thenable(result: { data: unknown; error: null }) {
  return {
    ...result,
    then: (resolve: (v: typeof result) => void) => Promise.resolve(result).then(resolve),
  }
}

function mockSupabaseForCarryover(
  alteBudgets: Array<{
    client_id: string
    annual_amount: number
    carryover_amount: number
    used_amount: number
  }>,
  bestehendesNachJahr: Record<string, { id: string; carryover_amount: number } | null> = {},
) {
  const updates: Array<{ id: string; data: Record<string, unknown> }> = []
  const inserts: Array<Record<string, unknown>> = []
  let callCount = 0

  const chainEq = (depth: number, terminal: () => unknown): Record<string, unknown> => {
    if (depth <= 0) return terminal() as Record<string, unknown>
    return { eq: () => chainEq(depth - 1, terminal) }
  }

  return {
    client: {
      from: (table: string) => {
        if (table !== 'client_budgets') return {}
        return {
          select: (..._cols: string[]) => {
            const thisCall = callCount++
            if (thisCall === 0) {
              return chainEq(3, () => thenable({ data: alteBudgets, error: null }))
            }
            const idx = thisCall - 1
            const clientId = alteBudgets[idx]?.client_id
            return chainEq(4, () => ({
              maybeSingle: async () => ({
                data: bestehendesNachJahr[clientId] ?? null,
                error: null,
              }),
            }))
          },
          insert: (row: Record<string, unknown>) => {
            inserts.push(row)
            return { error: null }
          },
          update: (data: Record<string, unknown>) => ({
            eq: (_col: string, id: string) => {
              updates.push({ id, data })
              return { error: null }
            },
          }),
        }
      },
    } as never,
    updates,
    inserts,
  }
}

describe('uebertrageJahresbudgets', () => {
  test('Restbudget wird korrekt übertragen (FIFO)', async () => {
    const mock = mockSupabaseForCarryover([
      { client_id: 'c-1', annual_amount: 1572, carryover_amount: 0, used_amount: 500 },
    ])
    const result = await uebertrageJahresbudgets(mock.client, 'org-1', 2025, 2026)
    assert.equal(result.uebertragen, 1)
    assert.equal(result.uebersprungen, 0)
    assert.equal(mock.inserts.length, 1)
    assert.equal((mock.inserts[0] as any).carryover_amount, 1072)
    assert.equal((mock.inserts[0] as any).carryover_expires, '2026-06-30')
    assert.equal((mock.inserts[0] as any).annual_amount, 1572)
  })

  test('Verfallsdatum ist 30.06. des Folgejahres', async () => {
    const mock = mockSupabaseForCarryover([
      { client_id: 'c-1', annual_amount: 1572, carryover_amount: 0, used_amount: 0 },
    ])
    await uebertrageJahresbudgets(mock.client, 'org-1', 2025, 2026)
    assert.equal((mock.inserts[0] as any).carryover_expires, '2026-06-30')
  })

  test('VP wird NICHT übertragen (nur Entlastung hat Übertrag)', async () => {
    const mock = mockSupabaseForCarryover([])
    const result = await uebertrageJahresbudgets(mock.client, 'org-1', 2025, 2026)
    assert.equal(result.uebertragen, 0)
    assert.equal(mock.inserts.length, 0)
  })

  test('0€ Rest → wird übersprungen', async () => {
    const mock = mockSupabaseForCarryover([
      { client_id: 'c-1', annual_amount: 1572, carryover_amount: 0, used_amount: 1572 },
    ])
    const result = await uebertrageJahresbudgets(mock.client, 'org-1', 2025, 2026)
    assert.equal(result.uebertragen, 0)
    assert.equal(result.uebersprungen, 1)
    assert.equal(mock.inserts.length, 0)
  })

  test('Negativer Rest → wird übersprungen', async () => {
    const mock = mockSupabaseForCarryover([
      { client_id: 'c-1', annual_amount: 1572, carryover_amount: 0, used_amount: 2000 },
    ])
    const result = await uebertrageJahresbudgets(mock.client, 'org-1', 2025, 2026)
    assert.equal(result.uebertragen, 0)
    assert.equal(result.uebersprungen, 1)
  })

  test('Bestehendes Folgejahr-Budget → nur carryover updaten', async () => {
    const mock = mockSupabaseForCarryover(
      [{ client_id: 'c-1', annual_amount: 1572, carryover_amount: 0, used_amount: 200 }],
      { 'c-1': { id: 'budget-existing', carryover_amount: 0 } },
    )
    const result = await uebertrageJahresbudgets(mock.client, 'org-1', 2025, 2026)
    assert.equal(result.uebertragen, 1)
    assert.equal(mock.updates.length, 1)
    assert.equal(mock.updates[0].id, 'budget-existing')
    assert.equal(mock.updates[0].data.carryover_amount, 1372)
    assert.equal(mock.updates[0].data.carryover_expires, '2026-06-30')
    assert.equal(mock.inserts.length, 0)
  })

  test('FIFO: Verbrauch < Übertrag → max. Jahresanspruch wird übertragen (kein doppelter Übertrag)', async () => {
    // Vorjahres-Übertrag 500, Verbrauch nur 400 → Übertrag verfällt am 30.06,
    // gesamter Jahresanspruch bleibt → Carry = 1572 (NICHT 1672!)
    const mock = mockSupabaseForCarryover([
      { client_id: 'c-1', annual_amount: 1572, carryover_amount: 500, used_amount: 400 },
    ])
    const result = await uebertrageJahresbudgets(mock.client, 'org-1', 2025, 2026)
    assert.equal(result.uebertragen, 1)
    assert.equal((mock.inserts[0] as any).carryover_amount, 1572)
  })

  test('FIFO: Verbrauch 0 + Übertrag vorhanden → max. Jahresanspruch (nicht annual+carryover)', async () => {
    const mock = mockSupabaseForCarryover([
      { client_id: 'c-1', annual_amount: 1572, carryover_amount: 1572, used_amount: 0 },
    ])
    await uebertrageJahresbudgets(mock.client, 'org-1', 2025, 2026)
    // Alter Übertrag verfällt → nur Jahresanspruch 1572 geht rüber
    assert.equal((mock.inserts[0] as any).carryover_amount, 1572)
  })

  test('FIFO: Verbrauch > Übertrag → Rest = annual - (used - carryover)', async () => {
    const mock = mockSupabaseForCarryover([
      { client_id: 'c-1', annual_amount: 1572, carryover_amount: 500, used_amount: 800 },
    ])
    await uebertrageJahresbudgets(mock.client, 'org-1', 2025, 2026)
    // 800 - 500 = 300 aus Jahresbudget verbraucht → 1572 - 300 = 1272 Übertrag
    assert.equal((mock.inserts[0] as any).carryover_amount, 1272)
  })

  test('Anteiliges Jahresbudget: Rest korrekt berechnet', async () => {
    // Klient kam im Juli → annual = 786 (6 × 131), carryover = 0, used = 200
    const mock = mockSupabaseForCarryover([
      { client_id: 'c-1', annual_amount: 786, carryover_amount: 0, used_amount: 200 },
    ])
    await uebertrageJahresbudgets(mock.client, 'org-1', 2025, 2026)
    assert.equal((mock.inserts[0] as any).carryover_amount, 586)
  })

  test('Keine Budgets vorhanden → leeres Ergebnis', async () => {
    const mock = mockSupabaseForCarryover([])
    const result = await uebertrageJahresbudgets(mock.client, 'org-1', 2025, 2026)
    assert.equal(result.uebertragen, 0)
    assert.equal(result.uebersprungen, 0)
    assert.deepEqual(result.fehler, [])
  })
})
