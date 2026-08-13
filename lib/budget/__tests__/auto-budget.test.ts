import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { erstelleInitialBudgets, uebertrageJahresbudgets } from '../auto-budget'

// ═══════════════════════════════════════════════════════════════════
// Der Mock bildet das LIVE-Schema von client_budgets ab: EINE Zeile je
// Kunde und Jahr, Entlastung in annual_amount/monthly_amount, VP/KZP in
// combined_annual_amount. Es gibt KEINE Spalte `budget_type`.
//
// Deshalb prüft der Mock die angeforderten Spalten mit: ein `select` oder
// `eq` auf eine unbekannte Spalte liefert — wie PostgREST — Fehler 42703
// statt eines stillen Treffers. Genau dieses Schlucken hat den Defekt
// vorher vor den Tests versteckt.
// ═══════════════════════════════════════════════════════════════════
const LIVE_SPALTEN = new Set([
  'id', 'client_id', 'organization_id', 'year',
  'annual_amount', 'monthly_amount', 'carryover_amount', 'carryover_expires',
  'used_amount', 'used_from_carryover', 'private_amount', 'status',
  'combined_annual_amount', 'combined_used_amount', 'combined_type',
])

function pruefeSpalte(name: string) {
  if (!LIVE_SPALTEN.has(name)) {
    throw new Error(`42703: column client_budgets.${name} does not exist`)
  }
}

function pruefeSelect(cols: string) {
  for (const c of cols.split(',')) pruefeSpalte(c.trim())
}

function mockSupabaseForInitial(
  bestehendeZeile: Record<string, unknown> | null = null,
  schreibFehler: { message: string } | null = null,
) {
  const inserted: Record<string, unknown>[] = []
  const updated: Array<{ id: string; data: Record<string, unknown> }> = []

  const eqKette = (rest: number, terminal: () => unknown): any => ({
    eq: (spalte: string) => {
      pruefeSpalte(spalte)
      return rest <= 1 ? terminal() : eqKette(rest - 1, terminal)
    },
  })

  return {
    client: {
      from: (table: string) => {
        if (table !== 'client_budgets') return {}
        return {
          select: (cols: string) => {
            pruefeSelect(cols)
            return eqKette(3, () => ({
              maybeSingle: async () => ({ data: bestehendeZeile, error: null }),
            }))
          },
          insert: (row: Record<string, unknown>) => {
            for (const k of Object.keys(row)) pruefeSpalte(k)
            inserted.push(row)
            return { error: schreibFehler }
          },
          update: (data: Record<string, unknown>) => {
            for (const k of Object.keys(data)) pruefeSpalte(k)
            return {
              eq: (_c: string, id: string) => {
                updated.push({ id, data })
                return { error: schreibFehler }
              },
            }
          },
        }
      },
    } as never,
    inserted,
    updated,
  }
}

describe('erstelleInitialBudgets', () => {
  test('PG 2 → eine Zeile mit Entlastung UND VP/KZP', async () => {
    const mock = mockSupabaseForInitial()
    const result = await erstelleInitialBudgets(mock.client, 'client-1', 'org-1', 2, 1)
    assert.equal(result.erstellt, true)
    assert.equal(mock.inserted.length, 1)
    assert.equal((mock.inserted[0] as any).annual_amount, 1572)
    assert.equal((mock.inserted[0] as any).combined_annual_amount, 3539)
  })

  test('PG 1 → NUR Entlastung, KEIN VP/KZP (§42a erfordert PG ≥ 2)', async () => {
    const mock = mockSupabaseForInitial()
    const result = await erstelleInitialBudgets(mock.client, 'client-pg1', 'org-1', 1, 1)
    assert.equal(result.erstellt, true)
    assert.equal(mock.inserted.length, 1)
    assert.equal((mock.inserted[0] as any).annual_amount, 1572)
    assert.equal((mock.inserted[0] as any).combined_annual_amount, 0)
  })

  test('Entlastung: 131 €/Monat × 12 = 1.572 € bei Jahresbeginn', async () => {
    const mock = mockSupabaseForInitial()
    await erstelleInitialBudgets(mock.client, 'c-full', 'org-1', 2, 1)
    assert.equal((mock.inserted[0] as any).annual_amount, 1572)
    assert.equal((mock.inserted[0] as any).monthly_amount, 131)
  })

  test('Unterjähriger PG-Beginn Juli → anteilig 6 × 131 = 786 €', async () => {
    const mock = mockSupabaseForInitial()
    await erstelleInitialBudgets(mock.client, 'c-juli', 'org-1', 3, 7)
    assert.equal((mock.inserted[0] as any).annual_amount, 786)
    assert.equal((mock.inserted[0] as any).monthly_amount, 131)
  })

  test('Unterjähriger PG-Beginn Dezember → 1 × 131 = 131 €', async () => {
    const mock = mockSupabaseForInitial()
    await erstelleInitialBudgets(mock.client, 'c-dez', 'org-1', 2, 12)
    assert.equal((mock.inserted[0] as any).annual_amount, 131)
  })

  test('VP/KZP: 3.539 € als gemeinsames Limit in combined_annual_amount', async () => {
    const mock = mockSupabaseForInitial()
    await erstelleInitialBudgets(mock.client, 'c-vp', 'org-1', 2, 1)
    assert.equal((mock.inserted[0] as any).combined_annual_amount, 3539)
  })

  test('Klient ohne Pflegegrad → kein Budget', async () => {
    const mock = mockSupabaseForInitial()
    const result = await erstelleInitialBudgets(mock.client, 'client-2', 'org-1', 0)
    assert.equal(result.erstellt, false)
    assert.equal(result.fehler, 'Kein Budget ohne Pflegegrad')
    assert.equal(mock.inserted.length, 0)
  })

  test('Budget existiert vollständig → idempotent, kein Schreibvorgang', async () => {
    const mock = mockSupabaseForInitial({
      id: 'b-1', annual_amount: 1572, monthly_amount: 131, combined_annual_amount: 3539,
    })
    const result = await erstelleInitialBudgets(mock.client, 'client-3', 'org-1', 3, 1)
    assert.equal(result.erstellt, false)
    assert.equal(mock.inserted.length, 0)
    assert.equal(mock.updated.length, 0)
  })

  test('Hochstufung PG 1 → 2: VP/KZP wird zur bestehenden Zeile ergänzt', async () => {
    const mock = mockSupabaseForInitial({
      id: 'b-2', annual_amount: 1572, monthly_amount: 131, combined_annual_amount: 0,
    })
    const result = await erstelleInitialBudgets(mock.client, 'client-4', 'org-1', 2, 1)
    assert.equal(result.erstellt, true)
    assert.equal(mock.inserted.length, 0)
    assert.equal(mock.updated.length, 1)
    assert.equal(mock.updated[0].id, 'b-2')
    assert.deepEqual(mock.updated[0].data, { combined_annual_amount: 3539 })
  })

  test('Bestehende Beträge werden NIE überschrieben', async () => {
    const mock = mockSupabaseForInitial({
      id: 'b-3', annual_amount: 786, monthly_amount: 131, combined_annual_amount: 3539,
    })
    await erstelleInitialBudgets(mock.client, 'client-4b', 'org-1', 3, 1)
    assert.equal(mock.updated.length, 0)
  })

  test('organization_id wird korrekt gesetzt', async () => {
    const mock = mockSupabaseForInitial()
    await erstelleInitialBudgets(mock.client, 'client-5', 'org-xyz', 1)
    assert.equal((mock.inserted[0] as any).organization_id, 'org-xyz')
  })

  test('Schreibfehler wird gemeldet statt geschluckt', async () => {
    const mock = mockSupabaseForInitial(null, { message: 'permission denied' })
    const result = await erstelleInitialBudgets(mock.client, 'client-6', 'org-1', 2, 1)
    assert.equal(result.erstellt, false)
    assert.equal(result.fehler, 'permission denied')
  })

  test('Pflegegradwechsel 1→3: Entlastung bleibt 131 €/Mon', async () => {
    const mock = mockSupabaseForInitial()
    await erstelleInitialBudgets(mock.client, 'c-pg1', 'org-1', 1, 1)
    assert.equal((mock.inserted[0] as any).monthly_amount, 131)

    const mock3 = mockSupabaseForInitial()
    await erstelleInitialBudgets(mock3.client, 'c-pg3', 'org-1', 3, 1)
    assert.equal((mock3.inserted[0] as any).monthly_amount, 131)
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
          select: (cols: string) => {
            pruefeSelect(cols)
            const thisCall = callCount++
            if (thisCall === 0) {
              // .eq(organization_id).eq(year)
              return chainEq(2, () => thenable({ data: alteBudgets, error: null }))
            }
            const idx = thisCall - 1
            const clientId = alteBudgets[idx]?.client_id
            // .eq(client_id).eq(organization_id).eq(year)
            return chainEq(3, () => ({
              maybeSingle: async () => ({
                data: bestehendesNachJahr[clientId] ?? null,
                error: null,
              }),
            }))
          },
          insert: (row: Record<string, unknown>) => {
            for (const k of Object.keys(row)) pruefeSpalte(k)
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
