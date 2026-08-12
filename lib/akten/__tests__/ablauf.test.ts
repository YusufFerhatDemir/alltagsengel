// ═══════════════════════════════════════════════════════════════
// Tests: Ablaufwarnungen — Warnstufen-Spalten-Mapping + Dashboard-Filter
// ═══════════════════════════════════════════════════════════════

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getAblaufDashboard, markiereWarnungGesendet } from '../ablauf-warnungen'

test('markiereWarnungGesendet setzt für jede Stufe exakt die richtige Spalte auf true', async () => {
  const stufen: Array<[90 | 60 | 30 | 14 | 7, string]> = [
    [90, 'warnung_90_gesendet'],
    [60, 'warnung_60_gesendet'],
    [30, 'warnung_30_gesendet'],
    [14, 'warnung_14_gesendet'],
    [7, 'warnung_7_gesendet'],
  ]

  for (const [stufe, spalte] of stufen) {
    const updateCalls: unknown[] = []
    const chain: any = {
      eq() { return chain },
      then(resolve: any) { resolve({ error: null }) },
    }
    const supabase = {
      from: () => ({ update: (payload: unknown) => { updateCalls.push(payload); return chain } }),
    }

    await markiereWarnungGesendet(supabase as any, 'dok-1', 'org-1', stufe)

    assert.equal(updateCalls.length, 1)
    assert.deepEqual(updateCalls[0], { [spalte]: true })
  }
})

test('markiereWarnungGesendet wirft mit lesbarer Meldung bei DB-Fehler', async () => {
  const chain: any = { eq() { return chain }, then(resolve: any) { resolve({ error: { message: 'timeout' } }) } }
  const supabase = { from: () => ({ update: () => chain }) }

  await assert.rejects(
    () => markiereWarnungGesendet(supabase as any, 'dok-1', 'org-1', 30),
    /Warnung konnte nicht markiert werden: timeout/
  )
})

test('getAblaufDashboard filtert nach organizationId und optionalen Feldern', async () => {
  const eqCalls: Array<[string, unknown]> = []
  const chain: any = {
    eq(col: string, val: unknown) { eqCalls.push([col, val]); return chain },
    order() { return chain },
    then(resolve: any) { resolve({ data: [], error: null }) },
  }
  const supabase = { from: () => ({ select: () => chain }) }

  await getAblaufDashboard(supabase as any, {
    organizationId: 'org-1',
    clientId: 'client-1',
    dringlichkeit: '30_tage',
  })

  assert.deepEqual(eqCalls, [
    ['organization_id', 'org-1'],
    ['client_id', 'client-1'],
    ['dringlichkeit', '30_tage'],
  ])
})

test('getAblaufDashboard wirft mit lesbarer Meldung bei DB-Fehler', async () => {
  const chain: any = {
    eq() { return chain },
    order() { return chain },
    then(resolve: any) { resolve({ data: null, error: { message: 'relation missing' } }) },
  }
  const supabase = { from: () => ({ select: () => chain }) }

  await assert.rejects(
    () => getAblaufDashboard(supabase as any, { organizationId: 'org-1' }),
    /Ablaufwarnungen konnten nicht geladen werden: relation missing/
  )
})
