import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createEintrag } from '../dienstplan'

function insertClient() {
  const inserts: Array<Record<string, unknown>> = []
  const supabase = {
    from: () => ({
      insert(payload: Record<string, unknown>) {
        inserts.push(payload)
        return {
          select: () => ({
            single: async () => ({ data: { id: 'e-1', ...payload }, error: null }),
          }),
        }
      },
    }),
  }
  return { supabase: supabase as never, inserts }
}

function failClient(errorMessage: string) {
  return {
    from: () => ({
      insert: () => ({
        select: () => ({
          single: async () => ({ data: null, error: { message: errorMessage } }),
        }),
      }),
    }),
  } as never
}

test('createEintrag: setzt Defaults korrekt', async () => {
  const { supabase, inserts } = insertClient()
  await createEintrag(supabase, {
    organizationId: 'org-1',
    datum: '2026-08-11',
    startZeit: '08:00',
    endZeit: '16:00',
    erstelltVon: 'user-1',
  })
  assert.equal(inserts.length, 1)
  assert.equal(inserts[0].status, 'geplant')
  assert.equal(inserts[0].typ, 'regulaer')
  assert.equal(inserts[0].pause_minuten, 0)
})

test('createEintrag: weist ungültigen Status ab', async () => {
  const { supabase } = insertClient()
  await assert.rejects(
    () => createEintrag(supabase, {
      organizationId: 'org-1', datum: '2026-08-11',
      startZeit: '08:00', endZeit: '16:00',
      status: 'ungueltig' as any, erstelltVon: 'user-1',
    }),
    /Ungültiger Wert/,
  )
})

test('createEintrag: übersetzt Doppelbelegungs-Fehler benutzerfreundlich', async () => {
  const supabase = failClient('Doppelbelegung: Mitarbeiter hat bereits einen Dienst in diesem Zeitraum.')
  await assert.rejects(
    () => createEintrag(supabase, {
      organizationId: 'org-1', datum: '2026-08-11',
      startZeit: '08:00', endZeit: '16:00', erstelltVon: 'user-1',
    }),
    /Doppelbelegung/,
  )
})

test('createEintrag: übersetzt Abwesenheits-Konflikt benutzerfreundlich', async () => {
  const supabase = failClient('Konflikt: Mitarbeiter ist an diesem Tag als abwesend gemeldet.')
  await assert.rejects(
    () => createEintrag(supabase, {
      organizationId: 'org-1', datum: '2026-08-11',
      startZeit: '08:00', endZeit: '16:00', erstelltVon: 'user-1',
    }),
    /Konflikt/,
  )
})
