// ═══════════════════════════════════════════════════════════════
// Tests: Ops-Nachrichten — Mandantentrennung (org_id-Filter + Guard
// gegen fremde Empfänger-IDs aus dem Request-Body)
// Ausführen: npm run test:unit
// ═══════════════════════════════════════════════════════════════

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createAntwort, createNachricht, getNachricht, listPosteingang, markGelesen } from '../nachrichten'

const basisData = {
  betreff: 'Testbetreff',
  inhalt: 'Testinhalt',
  absender_id: 'user-1',
  prioritaet: 'normal' as const,
  kategorie: 'allgemein' as const,
  bezug_typ: null,
  bezug_id: null,
}

/**
 * Fake-Client: protokolliert .eq()-Filterketten je Tabelle und liefert
 * konfigurierbare Fixtures für organization_members/caregivers/ops_nachrichten.
 */
function fakeClient(opts: {
  mitglieder?: string[]
  caregiverUserIds?: string[]
  elternNachricht?: Record<string, unknown> | null
} = {}) {
  const calls: Array<{ tabelle: string; filter: Record<string, unknown> }> = []
  const inserts: Array<{ tabelle: string; payload: unknown }> = []

  function inFilter(tabelle: string, spalte: string, ids: string[]) {
    const alle = tabelle === 'organization_members' ? (opts.mitglieder ?? []) : (opts.caregiverUserIds ?? [])
    return { data: alle.filter(id => ids.includes(id)).map(id => ({ user_id: id })), error: null }
  }

  const supabase = {
    from(tabelle: string) {
      return {
        select() {
          const filter: Record<string, unknown> = {}
          const kette: any = {
            eq(col: string, val: unknown) {
              filter[col] = val
              return kette
            },
            in(_col: string, ids: string[]) {
              calls.push({ tabelle, filter })
              return Promise.resolve(inFilter(tabelle, _col, ids))
            },
            maybeSingle: async () => {
              calls.push({ tabelle, filter })
              if (tabelle === 'ops_nachrichten') return { data: opts.elternNachricht ?? null, error: null }
              return { data: null, error: null }
            },
            order: async () => {
              calls.push({ tabelle, filter })
              return { data: [], error: null }
            },
          }
          return kette
        },
        insert(payload: unknown) {
          inserts.push({ tabelle, payload })
          const zeile = Array.isArray(payload) ? payload[0] : payload
          return {
            select: () => ({ single: async () => ({ data: { id: `${tabelle}-1`, ...(zeile as object) }, error: null }) }),
          }
        },
        update(payload: Record<string, unknown>) {
          const filter: Record<string, unknown> = {}
          const kette: any = {
            eq(col: string, val: unknown) {
              filter[col] = val
              calls.push({ tabelle: `${tabelle}(update)`, filter: { ...filter } })
              return kette
            },
          }
          return kette
        },
      }
    },
  }
  return { supabase: supabase as never, calls, inserts }
}

// ── Lesepfade sind org-gefenzt ────────────────────────────────────

test('listPosteingang filtert nach Empfänger UND Organisation', async () => {
  const calls: string[] = []
  const custom = {
    from: () => ({
      select: () => ({
        eq: (c1: string, v1: string) => {
          calls.push(`${c1}=${v1}`)
          return {
            eq: (c2: string, v2: string) => {
              calls.push(`${c2}=${v2}`)
              return { order: async () => ({ data: [], error: null }) }
            },
          }
        },
      }),
    }),
  }
  await listPosteingang(custom as never, { empfaengerId: 'user-1', organizationId: 'org-1' })
  assert.deepEqual(calls, ['empfaenger_id=user-1', 'organization_id=org-1'])
})

test('getNachricht liefert null, wenn die Nachricht zu einer anderen Organisation gehört', async () => {
  const custom = {
    from: () => ({
      select: () => ({
        eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
      }),
    }),
  }
  const ergebnis = await getNachricht(custom as never, { organizationId: 'org-fremd', id: 'n-1' })
  assert.equal(ergebnis, null)
})

test('getNachricht liefert null, wenn der Aufrufer weder Absender noch Empfänger ist', async () => {
  // getNachricht ruft für ops_nachrichten .maybeSingle() und für den Empfänger-Query direkt auf .eq() (thenable) auf —
  // daher ein dediziertes Double je Tabelle:
  const supabase = {
    from(tabelle: string) {
      if (tabelle === 'ops_nachrichten') {
        return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'n-1', absender_id: 'user-a' }, error: null }) }) }) }) }
      }
      return { select: () => ({ eq: () => ({ eq: async () => ({ data: [{ empfaenger_id: 'user-b' }], error: null }) }) }) }
    },
  }
  const ergebnis = await getNachricht(supabase as never, { organizationId: 'org-1', id: 'n-1', userId: 'user-fremd' })
  assert.equal(ergebnis, null)
})

test('markGelesen filtert Update auf Organisation, Nachricht UND Empfänger', async () => {
  const gesehen: Array<[string, unknown]> = []
  const supabase = {
    from: () => ({
      update: () => {
        const kette: any = { eq: (c: string, v: unknown) => { gesehen.push([c, v]); return kette } }
        return kette
      },
    }),
  }
  await markGelesen(supabase as never, { organizationId: 'org-1', nachrichtId: 'n-1', empfaengerId: 'user-1' })
  assert.deepEqual(gesehen, [['organization_id', 'org-1'], ['nachricht_id', 'n-1'], ['empfaenger_id', 'user-1']])
})

// ── Schreibpfad: Empfänger-IDs aus dem Body müssen zur Organisation gehören ──

test('createNachricht lehnt Empfänger ab, die zu keiner Mitgliedschaft/keinem Engel der Organisation gehören', async () => {
  const { supabase, inserts } = fakeClient({ mitglieder: ['user-2'], caregiverUserIds: [] })
  await assert.rejects(
    () => createNachricht(supabase, {
      organizationId: 'org-1',
      data: basisData,
      empfaengerIds: ['user-2', 'user-fremd'],
    }),
    /gehören nicht zu dieser Organisation/,
  )
  assert.equal(inserts.length, 0, 'darf vor dem Insert der Nachricht ablehnen')
})

test('createNachricht akzeptiert Empfänger aus organization_members ODER caregivers', async () => {
  const { supabase, inserts } = fakeClient({ mitglieder: ['admin-1'], caregiverUserIds: ['engel-1'] })
  await createNachricht(supabase, {
    organizationId: 'org-1',
    data: basisData,
    empfaengerIds: ['admin-1', 'engel-1'],
  })
  assert.equal(inserts.find(i => i.tabelle === 'ops_nachrichten'), inserts[0])
  const empfaengerInsert = inserts.find(i => i.tabelle === 'ops_nachrichten_empfaenger')
  assert.equal((empfaengerInsert?.payload as unknown[]).length, 2)
})

test('createNachricht ohne Empfänger prüft nichts und schreibt trotzdem', async () => {
  const { supabase, inserts } = fakeClient()
  await createNachricht(supabase, { organizationId: 'org-1', data: basisData, empfaengerIds: [] })
  assert.equal(inserts.length, 1, 'kein Empfänger-Insert ohne Empfänger')
})

test('createAntwort lehnt fremde Empfänger ab, obwohl die Eltern-Nachricht zur Organisation gehört', async () => {
  const { supabase, inserts } = fakeClient({ mitglieder: [], caregiverUserIds: [], elternNachricht: { id: 'n-1' } })
  await assert.rejects(
    () => createAntwort(supabase, {
      organizationId: 'org-1', elternId: 'n-1', data: basisData, empfaengerIds: ['user-fremd'],
    }),
    /gehören nicht zu dieser Organisation/,
  )
  assert.equal(inserts.filter(i => i.tabelle === 'ops_nachrichten').length, 0)
})
