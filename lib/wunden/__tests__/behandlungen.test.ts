// ═══════════════════════════════════════════════════════════════
// Tests: Wundversorgung / Verbandwechsel-Protokoll — Validierung,
//        Sperr-Logik bei abgeheilter Wunde
// Ausführen: npm run test:unit
// ═══════════════════════════════════════════════════════════════

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createTreatment } from '../behandlungen'

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

const basis = {
  organizationId: 'org-1', woundId: 'w-1', wundStatus: 'aktiv' as const,
  durchgefuehrtVon: 'user-1', massnahme: 'Verbandwechsel',
} as const

test('createTreatment blockt neue Einträge bei abgeheilter Wunde', async () => {
  const { supabase } = schreibClient()
  await assert.rejects(
    () => createTreatment(supabase, { ...basis, wundStatus: 'abgeheilt' }),
    /abgeheilt/,
  )
})

test('createTreatment verlangt eine Maßnahme', async () => {
  const { supabase } = schreibClient()
  await assert.rejects(
    () => createTreatment(supabase, { ...basis, massnahme: '   ' }),
    /Pflichtfeld/,
  )
})

test('createTreatment blockt Durchführungszeitpunkt in der Zukunft', async () => {
  const { supabase } = schreibClient()
  const inZukunft = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  await assert.rejects(
    () => createTreatment(supabase, { ...basis, durchgefuehrtAm: inZukunft }),
    /Zukunft/,
  )
})

test('createTreatment validiert die Materialien-Struktur', async () => {
  const { supabase } = schreibClient()
  await assert.rejects(
    () => createTreatment(supabase, { ...basis, materialien: 'falsch' as never }),
    /Liste/,
  )
  await assert.rejects(
    () => createTreatment(supabase, { ...basis, materialien: [{ menge: '1x' } as never] }),
    /Pflichtfeld/,
  )
})

test('createTreatment normalisiert und trimmt Materialien vor dem Speichern', async () => {
  const { supabase, inserts } = schreibClient()
  await createTreatment(supabase, {
    ...basis,
    materialien: [{ name: ' Kompresse ', menge: ' 2 Stück ' }, { name: 'Fixierpflaster' }],
  })
  assert.deepEqual(inserts[0].materialien, [
    { name: 'Kompresse', menge: '2 Stück' },
    { name: 'Fixierpflaster' },
  ])
})
