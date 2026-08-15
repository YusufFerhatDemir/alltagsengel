import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createQualifikation, listQualifikationen, updateQualifikation, deleteQualifikation } from '../qualifikationen'

function mockInsertClient(data: Record<string, unknown>) {
  return {
    from: () => ({
      insert: () => ({
        select: () => ({
          single: async () => ({ data, error: null }),
        }),
      }),
    }),
  } as never
}

function mockListClient(data: Record<string, unknown>[]) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            data,
            error: null,
            then: (fn: any) => fn({ data, error: null }),
          }),
          eq: () => ({
            order: () => ({
              data,
              error: null,
              then: (fn: any) => fn({ data, error: null }),
            }),
            eq: () => ({
              order: () => ({
                data,
                error: null,
                then: (fn: any) => fn({ data, error: null }),
              }),
            }),
          }),
        }),
      }),
    }),
  } as never
}

test('createQualifikation: wirft bei leerem Titel', async () => {
  const supabase = mockInsertClient({})
  await assert.rejects(
    () => createQualifikation(supabase, {
      organizationId: 'org-1',
      caregiverId: 'cg-1',
      title: '',
      qualificationType: 'zertifikat',
    }),
    /Pflichtfeld/,
  )
})

test('createQualifikation: setzt Defaults korrekt', async () => {
  const inserted: Record<string, unknown>[] = []
  const supabase = {
    from: () => ({
      insert(payload: Record<string, unknown>) {
        inserted.push(payload)
        return {
          select: () => ({
            single: async () => ({
              data: { id: 'q-1', ...payload },
              error: null,
            }),
          }),
        }
      },
    }),
  } as never

  const result = await createQualifikation(supabase, {
    organizationId: 'org-1',
    caregiverId: 'cg-1',
    title: 'Erweitertes Führungszeugnis',
    qualificationType: 'nachweis',
  })

  assert.equal(inserted.length, 1)
  assert.equal(inserted[0].status, 'valid')
  assert.equal(inserted[0].pflicht, false)
  assert.equal(inserted[0].einsatzrelevant, false)
  assert.equal(result.title, 'Erweitertes Führungszeugnis')
})

test('createQualifikation: pflicht + einsatzrelevant werden durchgereicht', async () => {
  const inserted: Record<string, unknown>[] = []
  const supabase = {
    from: () => ({
      insert(payload: Record<string, unknown>) {
        inserted.push(payload)
        return {
          select: () => ({
            single: async () => ({
              data: { id: 'q-2', ...payload },
              error: null,
            }),
          }),
        }
      },
    }),
  } as never

  await createQualifikation(supabase, {
    organizationId: 'org-1',
    caregiverId: 'cg-1',
    title: 'Erste Hilfe',
    qualificationType: 'schulung',
    pflicht: true,
    einsatzrelevant: true,
    validUntil: '2028-12-31',
  })

  assert.equal(inserted[0].pflicht, true)
  assert.equal(inserted[0].einsatzrelevant, true)
  assert.equal(inserted[0].valid_until, '2028-12-31')
})

test('updateQualifikation: wirft bei leeren Änderungen', async () => {
  const supabase = {
    from: () => ({
      update: () => ({
        eq: () => ({
          eq: () => ({
            select: () => ({
              single: async () => ({ data: null, error: null }),
            }),
          }),
        }),
      }),
    }),
  } as never

  await assert.rejects(
    () => updateQualifikation(supabase, 'q-1', 'org-1', {}),
    /Keine Änderungen/,
  )
})
