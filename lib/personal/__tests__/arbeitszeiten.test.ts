import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createArbeitszeit, updateArbeitszeit } from '../arbeitszeiten'

function insertClient() {
  const inserts: Array<Record<string, unknown>> = []
  const supabase = {
    from: () => ({
      insert(payload: Record<string, unknown>) {
        inserts.push(payload)
        return {
          select: () => ({
            single: async () => ({ data: { id: 'az-1', ...payload }, error: null }),
          }),
        }
      },
    }),
  }
  return { supabase: supabase as never, inserts }
}

function updateClient(existing: Record<string, unknown>, failMsg?: string) {
  const updates: Array<Record<string, unknown>> = []
  const supabase = {
    from: () => ({
      update(payload: Record<string, unknown>) {
        updates.push(payload)
        const kette: any = {
          eq: () => kette,
          select: () => ({
            single: async () => failMsg
              ? { data: null, error: { message: failMsg } }
              : { data: { ...existing, ...payload }, error: null },
          }),
        }
        return kette
      },
    }),
  }
  return { supabase: supabase as never, updates }
}

test('createArbeitszeit: setzt Defaults (quelle=manuell, pause=0)', async () => {
  const { supabase, inserts } = insertClient()
  await createArbeitszeit(supabase, {
    organizationId: 'org-1', caregiverId: 'cg-1', datum: '2026-08-11',
    startZeit: '08:00', endZeit: '16:00', istMinuten: 480,
  })
  assert.equal(inserts[0].quelle, 'manuell')
  assert.equal(inserts[0].pause_minuten, 0)
})

test('createArbeitszeit: weist ungültige Quelle ab', async () => {
  const { supabase } = insertClient()
  await assert.rejects(
    () => createArbeitszeit(supabase, {
      organizationId: 'org-1', caregiverId: 'cg-1', datum: '2026-08-11',
      startZeit: '08:00', endZeit: '16:00', istMinuten: 480, quelle: 'falsch' as any,
    }),
    /Ungültiger Wert/,
  )
})

test('updateArbeitszeit: übersetzt gesperrte-Arbeitszeit-Fehler', async () => {
  const { supabase } = updateClient({}, 'Gesperrte Arbeitszeit kann nicht bearbeitet werden.')
  await assert.rejects(
    () => updateArbeitszeit(supabase, 'az-1', 'org-1', { istMinuten: 500 }),
    /Gesperrte Arbeitszeit/,
  )
})

test('updateArbeitszeit: weist leere Änderungen ab', async () => {
  const { supabase } = updateClient({})
  await assert.rejects(
    () => updateArbeitszeit(supabase, 'az-1', 'org-1', {}),
    /Keine Änderungen/,
  )
})

test('updateArbeitszeit: mappt camelCase → snake_case korrekt', async () => {
  const { supabase, updates } = updateClient({ id: 'az-1' })
  await updateArbeitszeit(supabase, 'az-1', 'org-1', {
    startZeit: '09:00', endZeit: '17:00', pauseMinuten: 30, istMinuten: 450,
  })
  assert.equal(updates[0].start_zeit, '09:00')
  assert.equal(updates[0].end_zeit, '17:00')
  assert.equal(updates[0].pause_minuten, 30)
  assert.equal(updates[0].ist_minuten, 450)
})
