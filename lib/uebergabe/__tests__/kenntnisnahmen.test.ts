// ═══════════════════════════════════════════════════════════════
// Tests: Kenntnisnahmen — Mandantenschutz, Quittier-Regeln, Mengenlogik
// Ausführen: npm run test:unit
// ═══════════════════════════════════════════════════════════════

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { UserFacingError } from '../../api/user-facing-error'
import {
  getKenntnisnahme,
  listKenntnisnahmen,
  offeneKenntnisnahmen,
  quittieren,
  type QuittierenParams,
} from '../kenntnisnahmen'

type Filter = Array<[string, unknown]>

/**
 * Doppelgänger, der die gesetzten Filter protokolliert. Genau darum geht es
 * beim Mandantenschutz: nicht nur, DASS gelesen wird, sondern mit welchem
 * Filter — ein fehlendes organization_id fällt sonst niemandem auf.
 */
function fakeClient(optionen: {
  protokoll?: { status: string } | null
  protokollError?: { message: string } | null
  insertError?: { code?: string; message: string } | null
  bestehendeKenntnisnahme?: Record<string, unknown> | null
}) {
  const selects: Array<{ tabelle: string; filters: Filter }> = []
  const inserts: Array<{ tabelle: string; payload: Record<string, unknown> }> = []

  const supabase = {
    from(tabelle: string) {
      const filters: Filter = []
      const kette: Record<string, unknown> = {}
      Object.assign(kette, {
        select: () => kette,
        order: () => kette,
        eq: (spalte: string, wert: unknown) => { filters.push([spalte, wert]); return kette },
        maybeSingle: async () => {
          selects.push({ tabelle, filters })
          if (tabelle === 'uebergabe_protokolle') {
            return { data: optionen.protokoll ?? null, error: optionen.protokollError ?? null }
          }
          return { data: optionen.bestehendeKenntnisnahme ?? null, error: null }
        },
        insert: (payload: Record<string, unknown>) => {
          inserts.push({ tabelle, payload })
          return {
            select: () => ({
              single: async () => optionen.insertError
                ? { data: null, error: optionen.insertError }
                : { data: { id: 'kn-1', ...payload }, error: null },
            }),
          }
        },
      })
      return kette
    },
  }
  return { supabase: supabase as never, selects, inserts }
}

function basis(overrides: Partial<QuittierenParams> = {}): QuittierenParams {
  return {
    protokollId: 'prot-1',
    organizationId: 'org-1',
    userId: 'user-1',
    caregiverId: 'cg-1',
    name: 'Alltagsengel',
    rolle: 'engel',
    ...overrides,
  }
}

// ── Mandantenschutz ────────────────────────────────────────────

test('quittieren filtert den Protokoll-Lookup IMMER auf die Organisation', async () => {
  const { supabase, selects } = fakeClient({ protokoll: { status: 'abgeschlossen' } })
  await quittieren(supabase, basis())

  const lookup = selects.find(s => s.tabelle === 'uebergabe_protokolle')
  assert.ok(lookup, 'Der Protokollstatus muss geprüft werden')
  assert.deepEqual(lookup.filters, [['id', 'prot-1'], ['organization_id', 'org-1']])
})

test('quittieren verweigert die Arbeit ohne Organisation — kein ungefilterter Lookup', async () => {
  const { supabase, selects } = fakeClient({ protokoll: { status: 'abgeschlossen' } })
  await assert.rejects(
    () => quittieren(supabase, basis({ organizationId: '' })),
    (err: unknown) => err instanceof UserFacingError && /Organisation/.test((err as Error).message),
  )
  // Entscheidend: Es darf gar nicht erst gelesen werden.
  assert.equal(selects.length, 0)
})

test('quittieren schreibt organization_id explizit in die Zeile', async () => {
  const { supabase, inserts } = fakeClient({ protokoll: { status: 'abgeschlossen' } })
  await quittieren(supabase, basis())

  assert.equal(inserts[0].tabelle, 'uebergabe_kenntnisnahmen')
  assert.equal(inserts[0].payload.organization_id, 'org-1')
})

test('quittieren meldet ein Protokoll einer fremden Organisation als nicht gefunden', async () => {
  // Der Org-Filter greift → PostgREST liefert keine Zeile.
  const { supabase } = fakeClient({ protokoll: null })
  await assert.rejects(
    () => quittieren(supabase, basis({ protokollId: 'prot-fremd' })),
    (err: unknown) => err instanceof UserFacingError
      && (err as UserFacingError).status === 404
      && /nicht gefunden/.test((err as Error).message),
  )
})

// ── Quittier-Regeln ────────────────────────────────────────────

test('quittieren lässt nur abgeschlossene Protokolle zu', async () => {
  const { supabase, inserts } = fakeClient({ protokoll: { status: 'offen' } })
  await assert.rejects(
    () => quittieren(supabase, basis()),
    (err: unknown) => err instanceof UserFacingError
      && (err as UserFacingError).status === 409
      && /abgeschlossene/.test((err as Error).message),
  )
  assert.equal(inserts.length, 0, 'Ohne Abschluss darf nichts geschrieben werden')
})

test('quittieren verlangt einen Namen — als UserFacingError', async () => {
  const { supabase } = fakeClient({ protokoll: { status: 'abgeschlossen' } })
  await assert.rejects(
    () => quittieren(supabase, basis({ name: '   ' })),
    (err: unknown) => err instanceof UserFacingError && /Pflichtfeld/.test((err as Error).message),
  )
})

test('quittieren trimmt den Namen', async () => {
  const { supabase, inserts } = fakeClient({ protokoll: { status: 'abgeschlossen' } })
  await quittieren(supabase, basis({ name: '  Alltagsengel  ' }))
  assert.equal(inserts[0].payload.name, 'Alltagsengel')
})

test('quittieren gibt bei doppelter Quittung die vorhandene zurück (23505)', async () => {
  const { supabase, selects } = fakeClient({
    protokoll: { status: 'abgeschlossen' },
    insertError: { code: '23505', message: 'duplicate key value violates unique constraint' },
    bestehendeKenntnisnahme: { id: 'kn-alt', protokoll_id: 'prot-1', user_id: 'user-1' },
  })

  const ergebnis = await quittieren(supabase, basis())
  assert.equal(ergebnis.id, 'kn-alt')

  // Auch der Nachschlag der vorhandenen Quittung läuft mandantengefiltert.
  const nachschlag = selects.filter(s => s.tabelle === 'uebergabe_kenntnisnahmen').at(-1)
  assert.ok(nachschlag)
  assert.deepEqual(nachschlag.filters, [
    ['protokoll_id', 'prot-1'], ['user_id', 'user-1'], ['organization_id', 'org-1'],
  ])
})

test('quittieren reicht einen echten DB-Fehler NICHT als UserFacingError durch', async () => {
  const { supabase } = fakeClient({
    protokoll: { status: 'abgeschlossen' },
    insertError: { code: '23503', message: 'insert or update on table violates foreign key constraint' },
  })
  await assert.rejects(
    () => quittieren(supabase, basis()),
    (err: unknown) => err instanceof Error && !(err instanceof UserFacingError),
  )
})

// ── Lesepfade ──────────────────────────────────────────────────

test('listKenntnisnahmen filtert auf Protokoll UND Organisation', async () => {
  const selects: Array<{ tabelle: string; filters: Filter }> = []
  const supabase = {
    from(tabelle: string) {
      const filters: Filter = []
      const kette: Record<string, unknown> = {}
      Object.assign(kette, {
        select: () => kette,
        eq: (spalte: string, wert: unknown) => { filters.push([spalte, wert]); return kette },
        order: async () => { selects.push({ tabelle, filters }); return { data: [], error: null } },
      })
      return kette
    },
  }
  await listKenntnisnahmen(supabase as never, 'prot-1', 'org-1')
  assert.deepEqual(selects[0].filters, [['protokoll_id', 'prot-1'], ['organization_id', 'org-1']])
})

test('getKenntnisnahme hängt den Org-Filter nur an, wenn eine Org übergeben wird', async () => {
  const ohne = fakeClient({ bestehendeKenntnisnahme: null })
  await getKenntnisnahme(ohne.supabase, 'prot-1', 'user-1')
  assert.deepEqual(ohne.selects[0].filters, [['protokoll_id', 'prot-1'], ['user_id', 'user-1']])

  const mit = fakeClient({ bestehendeKenntnisnahme: null })
  await getKenntnisnahme(mit.supabase, 'prot-1', 'user-1', 'org-1')
  assert.deepEqual(mit.selects[0].filters, [
    ['protokoll_id', 'prot-1'], ['user_id', 'user-1'], ['organization_id', 'org-1'],
  ])
})

// ── Mengenlogik (Randfälle) ────────────────────────────────────

test('offeneKenntnisnahmen ignoriert Quittungen ohne caregiver_id', () => {
  // Ein Admin quittiert ohne Betreuungskraft-Zeile — das schliesst die
  // Kenntnisnahme eines vorgesehenen Engels nicht.
  const offen = offeneKenntnisnahmen(['cg-1'], [{ caregiver_id: null }, { caregiver_id: null }])
  assert.deepEqual(offen, ['cg-1'])
})

test('offeneKenntnisnahmen kommt mit Quittungen fremder Empfänger klar', () => {
  // Jemand quittiert, der gar nicht vorgesehen war — er verschwindet nicht
  // aus der Liste der Offenen, weil er nie darin stand.
  const offen = offeneKenntnisnahmen(['cg-1', 'cg-2'], [{ caregiver_id: 'cg-99' }])
  assert.deepEqual(offen, ['cg-1', 'cg-2'])
})

test('offeneKenntnisnahmen behandelt Doppel-Nennungen in der Vorgabe', () => {
  assert.deepEqual(offeneKenntnisnahmen(['cg-1', 'cg-1'], [{ caregiver_id: 'cg-1' }]), [])
  assert.deepEqual(offeneKenntnisnahmen(['cg-1', 'cg-1'], []), ['cg-1', 'cg-1'])
})

test('offeneKenntnisnahmen meldet leer, wenn alle quittiert haben', () => {
  const offen = offeneKenntnisnahmen(
    ['cg-1', 'cg-2'],
    [{ caregiver_id: 'cg-1' }, { caregiver_id: 'cg-2' }],
  )
  assert.deepEqual(offen, [])
})
