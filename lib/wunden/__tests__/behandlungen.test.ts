// ═══════════════════════════════════════════════════════════════
// Tests: Wundversorgung / Verbandwechsel-Protokoll — Validierung,
//        Sperr-Logik bei abgeheilter Wunde, CRUD
// Ausführen: npm run test:unit
// ═══════════════════════════════════════════════════════════════

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createTreatment, listTreatments, type CreateTreatmentParams } from '../behandlungen'

function schreibClient() {
  const inserts: Array<Record<string, unknown>> = []
  const supabase = {
    from: () => ({
      insert(payload: Record<string, unknown>) {
        inserts.push(payload)
        return { select: () => ({ single: async () => ({ data: { id: 't-1', ...payload }, error: null }) }) }
      },
    }),
  }
  return { supabase: supabase as never, inserts }
}

function basis(overrides: Partial<CreateTreatmentParams> = {}): CreateTreatmentParams {
  return {
    organizationId: 'org-1', woundId: 'w-1', wundStatus: 'aktiv',
    durchgefuehrtVon: 'user-1', massnahme: 'Verbandwechsel',
    ...overrides,
  }
}

test('createTreatment blockt neue Einträge bei abgeheilter Wunde', async () => {
  const { supabase } = schreibClient()
  await assert.rejects(
    () => createTreatment(supabase, basis({ wundStatus: 'abgeheilt' })),
    /abgeheilt/,
  )
})

test('createTreatment verlangt eine Maßnahme', async () => {
  const { supabase } = schreibClient()
  await assert.rejects(() => createTreatment(supabase, basis({ massnahme: '' })), /Pflichtfeld/)
  await assert.rejects(() => createTreatment(supabase, basis({ massnahme: '   ' })), /Pflichtfeld/)
})

test('createTreatment blockt Durchführungszeitpunkt in der Zukunft', async () => {
  const { supabase } = schreibClient()
  const inZukunft = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  await assert.rejects(
    () => createTreatment(supabase, basis({ durchgefuehrtAm: inZukunft })),
    /Zukunft/,
  )
})

test('createTreatment trimmt Maßnahme und setzt Defaults', async () => {
  const { supabase, inserts } = schreibClient()
  await createTreatment(supabase, basis({ massnahme: '  Verbandwechsel  ' }))
  assert.equal(inserts[0].massnahme, 'Verbandwechsel')
  assert.equal(inserts[0].schmerzmittel_gegeben, false)
  assert.deepEqual(inserts[0].materialien, [])
  assert.equal(inserts[0].naechster_vw_am, null)
})

test('createTreatment validiert die Materialien-Struktur', async () => {
  const { supabase } = schreibClient()
  await assert.rejects(
    () => createTreatment(supabase, basis({ materialien: 'falsch' as never })),
    /muss eine Liste sein/,
  )
  await assert.rejects(
    () => createTreatment(supabase, basis({ materialien: [{ menge: '1x' } as never] })),
    /Material 1: name ist Pflichtfeld/,
  )
})

test('createTreatment normalisiert und trimmt Materialien vor dem Speichern', async () => {
  const { supabase, inserts } = schreibClient()
  await createTreatment(supabase, basis({
    materialien: [{ name: '  Mepilex  ', menge: ' 1 Stück ' }, { name: 'Kompresse' } as never],
  }))
  assert.deepEqual(inserts[0].materialien, [{ name: 'Mepilex', menge: '1 Stück' }, { name: 'Kompresse' }])
})

test('listTreatments filtert nach Wunde und Organisation', async () => {
  const calls: string[] = []
  const supabase = {
    from: () => ({
      select: () => ({
        eq: (col: string, val: string) => {
          calls.push(`${col}=${val}`)
          return {
            eq: (col2: string, val2: string) => {
              calls.push(`${col2}=${val2}`)
              return { order: async () => ({ data: [], error: null }) }
            },
          }
        },
      }),
    }),
  }
  await listTreatments(supabase as never, 'w-1', 'org-1')
  assert.deepEqual(calls, ['wound_id=w-1', 'organization_id=org-1'])
})
