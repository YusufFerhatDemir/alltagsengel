import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createAbwesenheit, genehmigenAbwesenheit, ablehnenAbwesenheit } from '../abwesenheiten'

function insertClient() {
  const inserts: Array<Record<string, unknown>> = []
  const supabase = {
    from: () => ({
      insert(payload: Record<string, unknown>) {
        inserts.push(payload)
        return {
          select: () => ({
            single: async () => ({ data: { id: 'ab-1', ...payload }, error: null }),
          }),
        }
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
          select: () => ({
            single: async () => ({ data: { ...existing, ...payload }, error: null }),
          }),
        }
        return kette
      },
    }),
  }
  return { supabase: supabase as never, updates }
}

test('createAbwesenheit: setzt Status automatisch auf beantragt', async () => {
  const { supabase, inserts } = insertClient()
  await createAbwesenheit(supabase, {
    organizationId: 'org-1', caregiverId: 'cg-1',
    absenceType: 'vacation', startDate: '2026-08-15', endDate: '2026-08-20',
    erstelltVon: 'user-1',
  })
  assert.equal(inserts[0].status, 'beantragt')
  assert.equal(inserts[0].halber_tag, false)
})

test('createAbwesenheit: akzeptiert erweiterte Typen', async () => {
  const { supabase, inserts } = insertClient()
  await createAbwesenheit(supabase, {
    organizationId: 'org-1', caregiverId: 'cg-1',
    absenceType: 'fortbildung', startDate: '2026-09-01', endDate: '2026-09-03',
    erstelltVon: 'user-1',
  })
  assert.equal(inserts[0].absence_type, 'fortbildung')
})

test('createAbwesenheit: weist ungültigen Typ ab', async () => {
  const { supabase } = insertClient()
  await assert.rejects(
    () => createAbwesenheit(supabase, {
      organizationId: 'org-1', caregiverId: 'cg-1',
      absenceType: 'ungueltig' as any, startDate: '2026-09-01', endDate: '2026-09-03',
      erstelltVon: 'user-1',
    }),
    /Ungültiger Wert/,
  )
})

test('genehmigenAbwesenheit: setzt genehmigt + genehmigt_von/am', async () => {
  const { supabase, updates } = updateClient({ id: 'ab-1', status: 'beantragt' })
  const result = await genehmigenAbwesenheit(supabase, 'ab-1', 'org-1', 'admin-1')
  assert.equal(updates[0].status, 'genehmigt')
  assert.equal(updates[0].genehmigt_von, 'admin-1')
  assert.ok(updates[0].genehmigt_am)
})

test('ablehnenAbwesenheit: verlangt Ablehnungsgrund', async () => {
  const { supabase } = updateClient({ id: 'ab-1', status: 'beantragt' })
  await assert.rejects(
    () => ablehnenAbwesenheit(supabase, 'ab-1', 'org-1', 'admin-1', ''),
    /Ablehnungsgrund ist ein Pflichtfeld/,
  )
})

test('ablehnenAbwesenheit: setzt abgelehnt + ablehnungsgrund', async () => {
  const { supabase, updates } = updateClient({ id: 'ab-1', status: 'beantragt' })
  await ablehnenAbwesenheit(supabase, 'ab-1', 'org-1', 'admin-1', 'Betrieblicher Bedarf')
  assert.equal(updates[0].status, 'abgelehnt')
  assert.equal(updates[0].ablehnungsgrund, 'Betrieblicher Bedarf')
})
