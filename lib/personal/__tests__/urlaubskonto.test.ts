import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createUrlaubskonto, updateUrlaubskonto } from '../urlaubskonto'

function insertClient() {
  const inserts: Array<Record<string, unknown>> = []
  const supabase = {
    // Seit dem Mandanten-Fence (lib/personal/organization-guard.ts) liest
    // jeder Schreibweg zuerst `caregivers` und bricht ab, wenn der
    // Mitarbeiter nicht zur Organisation gehoert. Der Doppelgaenger muss
    // diesen Lesepfad kennen, sonst prueft der Test nicht mehr den
    // Schreibvorgang, sondern nur noch die neue Sperre.
    from: (tabelle: string) => tabelle === 'caregivers' ? ({
      select: () => {
        const lese: any = { eq: () => lese, maybeSingle: async () => ({ data: { id: 'cg-1' }, error: null }) }
        return lese
      },
    }) as any : ({
      insert(payload: Record<string, unknown>) {
        inserts.push(payload)
        const stored = {
          id: 'uk-1',
          ...payload,
          resturlaub: (payload.anspruch_tage as number) + ((payload.uebertrag_vorjahr as number) ?? 0) - 0 - 0,
        }
        return { select: () => ({ single: async () => ({ data: stored, error: null }) }) }
      },
    }),
  }
  return { supabase: supabase as never, inserts }
}

function updateClient(existing: Record<string, unknown>) {
  const updates: Array<Record<string, unknown>> = []
  const supabase = {
    from: () => ({
      update(payload: Record<string, unknown>) {
        updates.push(payload)
        const kette: any = {
          eq: () => kette,
          select: () => ({ single: async () => ({ data: { ...existing, ...payload }, error: null }) }),
        }
        return kette
      },
    }),
  }
  return { supabase: supabase as never, updates }
}

test('createUrlaubskonto: setzt uebertrag_vorjahr Default auf 0', async () => {
  const { supabase, inserts } = insertClient()
  await createUrlaubskonto(supabase, {
    organizationId: 'org-1', caregiverId: 'cg-1', jahr: 2026, anspruchTage: 30,
  })
  assert.equal(inserts[0].uebertrag_vorjahr, 0)
  assert.equal(inserts[0].anspruch_tage, 30)
})

test('updateUrlaubskonto: schreibt genommen_tage/geplant_tage, NICHT resturlaub', async () => {
  const { supabase, updates } = updateClient({ id: 'uk-1', anspruch_tage: 30, resturlaub: 20 })
  await updateUrlaubskonto(supabase, 'uk-1', 'org-1', {
    genommenTage: 10, geplantTage: 5,
  })
  assert.equal(updates[0].genommen_tage, 10)
  assert.equal(updates[0].geplant_tage, 5)
  assert.equal(updates[0].resturlaub, undefined)
})

test('updateUrlaubskonto: weist leere Änderungen ab', async () => {
  const { supabase } = updateClient({})
  await assert.rejects(
    () => updateUrlaubskonto(supabase, 'uk-1', 'org-1', {}),
    /Keine Änderungen/,
  )
})
