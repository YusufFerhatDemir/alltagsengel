// ═══════════════════════════════════════════════════════════════
// Tests: clientGehoertZuOrg — Mandantenschutz für clientId aus dem Body
// Ausführen: npm run test:unit
// ═══════════════════════════════════════════════════════════════

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clientGehoertZuOrg } from '../organization-guard'

function fakeClient(gefundenerClient: { id: string } | null) {
  const calls: Array<{ table: string; filters: Array<[string, unknown]> }> = []
  const supabase = {
    from(table: string) {
      const filters: Array<[string, unknown]> = []
      const kette: any = {
        select: () => kette,
        eq: (spalte: string, wert: unknown) => { filters.push([spalte, wert]); return kette },
        maybeSingle: async () => {
          calls.push({ table, filters })
          return { data: gefundenerClient, error: null }
        },
      }
      return kette
    },
  }
  return { supabase: supabase as never, calls }
}

test('clientGehoertZuOrg gibt true zurück, wenn der Klient in der Organisation gefunden wird', async () => {
  const { supabase, calls } = fakeClient({ id: 'client-1' })
  const ergebnis = await clientGehoertZuOrg(supabase, 'client-1', 'org-1')
  assert.equal(ergebnis, true)
  assert.equal(calls[0].table, 'clients')
  assert.deepEqual(calls[0].filters, [['id', 'client-1'], ['organization_id', 'org-1']])
})

test('clientGehoertZuOrg gibt false zurück, wenn kein Klient gefunden wird (fremde Organisation)', async () => {
  const { supabase } = fakeClient(null)
  const ergebnis = await clientGehoertZuOrg(supabase, 'client-fremd', 'org-1')
  assert.equal(ergebnis, false)
})
