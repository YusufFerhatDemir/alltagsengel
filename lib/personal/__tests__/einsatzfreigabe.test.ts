import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pruefeEinsatzfreigabe } from '../einsatzfreigabe'

function mockSupabase(caregiver: Record<string, unknown>, quals: Record<string, unknown>[]) {
  return {
    from: (table: string) => {
      if (table === 'caregivers') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: async () => ({ data: caregiver, error: null }),
              }),
            }),
          }),
        }
      }
      if (table === 'caregiver_qualifications') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  data: quals,
                  error: null,
                  then: (fn: any) => fn({ data: quals, error: null }),
                }),
              }),
            }),
          }),
        }
      }
      return {}
    },
  } as never
}

test('Einsatzfreigabe: aktiver Mitarbeiter mit gültigen Quals → freigegeben', async () => {
  const supabase = mockSupabase(
    { id: 'cg-1', first_name: 'Anna', last_name: 'Müller', einsatzfreigabe: true, vertragsstatus: 'aktiv' },
    [{ id: 'q-1', title: 'Erste Hilfe', valid_until: '2027-12-31', einsatzrelevant: true, pflicht: true }],
  )
  const result = await pruefeEinsatzfreigabe(supabase, 'cg-1', 'org-1')
  assert.equal(result.freigegeben, true)
  assert.equal(result.probleme.length, 0)
  assert.equal(result.caregiverName, 'Anna Müller')
})

test('Einsatzfreigabe: gekündigter Mitarbeiter → nicht freigegeben', async () => {
  const supabase = mockSupabase(
    { id: 'cg-2', first_name: 'Max', last_name: 'Test', einsatzfreigabe: true, vertragsstatus: 'gekuendigt' },
    [],
  )
  const result = await pruefeEinsatzfreigabe(supabase, 'cg-2', 'org-1')
  assert.equal(result.freigegeben, false)
  assert.ok(result.probleme.some(p => p.includes('Vertragsstatus')))
})

test('Einsatzfreigabe: fehlende Freigabe → nicht freigegeben', async () => {
  const supabase = mockSupabase(
    { id: 'cg-3', first_name: 'Lisa', last_name: 'Test', einsatzfreigabe: false, vertragsstatus: 'aktiv' },
    [],
  )
  const result = await pruefeEinsatzfreigabe(supabase, 'cg-3', 'org-1')
  assert.equal(result.freigegeben, false)
  assert.ok(result.probleme.some(p => p.includes('Einsatzfreigabe')))
})

test('Einsatzfreigabe: abgelaufene einsatzrelevante Qual → Problem', async () => {
  const supabase = mockSupabase(
    { id: 'cg-4', first_name: 'Tom', last_name: 'Test', einsatzfreigabe: true, vertragsstatus: 'aktiv' },
    [{ id: 'q-1', title: 'Führungszeugnis', valid_until: '2020-01-01', einsatzrelevant: true, pflicht: true }],
  )
  const result = await pruefeEinsatzfreigabe(supabase, 'cg-4', 'org-1')
  assert.equal(result.freigegeben, false)
  assert.ok(result.probleme.some(p => p.includes('abgelaufen')))
  assert.equal(result.abgelaufeneQualifikationen.length, 1)
  assert.equal(result.abgelaufeneQualifikationen[0].title, 'Führungszeugnis')
})

test('Einsatzfreigabe: Mitarbeiter nicht gefunden → wirft Fehler', async () => {
  const supabase = {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            single: async () => ({ data: null, error: { message: 'not found' } }),
          }),
        }),
      }),
    }),
  } as never

  await assert.rejects(() => pruefeEinsatzfreigabe(supabase, 'xxx', 'org-1'), /Mitarbeiter nicht gefunden/)
})
