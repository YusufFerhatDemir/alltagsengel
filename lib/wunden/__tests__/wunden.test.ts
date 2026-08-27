// ═══════════════════════════════════════════════════════════════
// Tests: Wund-Stammdaten — Validierung, Status/Abheilung-Konsistenz
// Ausführen: npm run test:unit
// ═══════════════════════════════════════════════════════════════

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createWound, updateWound, zusammenfassungWunden } from '../wunden'
import { WUND_TYP_WERTE } from '../types'
import type { Wound } from '../types'
import { erstelleFakeSupabase } from '@/__tests__/helpers/supabase-fake'

function inZweiTagen(): string {
  return new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function schreibClient() {
  const inserts: Array<Record<string, unknown>> = []
  const updates: Array<Record<string, unknown>> = []
  const supabase = {
    from: () => ({
      insert(payload: Record<string, unknown>) {
        inserts.push(payload)
        return { select: () => ({ single: async () => ({ data: { id: 'w-1', ...payload }, error: null }) }) }
      },
      update(payload: Record<string, unknown>) {
        updates.push(payload)
        const kette: any = {
          eq: () => kette,
          select: () => ({ single: async () => ({ data: { id: 'w-1', ...payload }, error: null }) }),
        }
        return kette
      },
    }),
  }
  return { supabase: supabase as never, inserts, updates }
}

const basis = {
  organizationId: 'org-1', clientId: 'client-1',
  lokalisation: 'Ferse links', erstelltVon: 'user-1',
} as const

test('createWound akzeptiert alle in der Migration erlaubten Wundtypen', async () => {
  for (const typ of WUND_TYP_WERTE) {
    const { supabase, inserts } = schreibClient()
    await createWound(supabase, { ...basis, wundTyp: typ })
    assert.equal(inserts[0].wund_typ, typ)
  }
})

test('createWound blockt ungültige Werte vor dem DB-Roundtrip', async () => {
  const { supabase } = schreibClient()
  await assert.rejects(
    () => createWound(supabase, { ...basis, wundTyp: 'schnittwunde' as never }),
    /Ungültiger Wert/,
  )
  await assert.rejects(
    () => createWound(supabase, { ...basis, wundTyp: 'dekubitus', lokalisation: '  ' }),
    /Lokalisation/,
  )
  await assert.rejects(
    () => createWound(supabase, { ...basis, wundTyp: 'dekubitus', dekubitusGrad: 5 }),
    /Grad/,
  )
})

test('createWound: Dekubitus-Grad nur bei Dekubitus', async () => {
  const { supabase } = schreibClient()
  await assert.rejects(
    () => createWound(supabase, { ...basis, wundTyp: 'op_wunde', dekubitusGrad: 2 }),
    /nur bei Wundtyp/,
  )
  const { supabase: ok, inserts } = schreibClient()
  await createWound(ok, { ...basis, wundTyp: 'dekubitus', dekubitusGrad: 3 })
  assert.equal(inserts[0].dekubitus_grad, 3)
})

test('createWound blockt ein Entstehungsdatum in der Zukunft', async () => {
  const { supabase } = schreibClient()
  await assert.rejects(
    () => createWound(supabase, { ...basis, wundTyp: 'sonstige', entstandenAm: inZweiTagen() }),
    /Zukunft/,
  )
})

test('updateWound blockt Entstehungs- und Abheilungsdatum in der Zukunft', async () => {
  const { supabase } = schreibClient()
  await assert.rejects(
    () => updateWound(supabase, 'w-1', 'org-1', { entstandenAm: inZweiTagen() }),
    /Zukunft/,
  )
  await assert.rejects(
    () => updateWound(supabase, 'w-1', 'org-1', { status: 'abgeheilt', abgeheiltAm: inZweiTagen() }),
    /Zukunft/,
  )
})

test('updateWound prüft Dekubitus-Grad bei Teil-Update gegen den BESTEHENDEN Wundtyp', async () => {
  const fakeNichtDekubitus = erstelleFakeSupabase(aufruf => {
    if (aufruf.tabelle === 'wounds' && aufruf.operation === 'select') return { data: { wund_typ: 'op_wunde' } }
    if (aufruf.tabelle === 'wounds' && aufruf.operation === 'update') return { data: { id: 'w-1', ...(aufruf.payload as object) } }
    return undefined
  })
  await assert.rejects(
    () => updateWound(fakeNichtDekubitus.client, 'w-1', 'org-1', { dekubitusGrad: 2 }),
    /nur bei Wundtyp/,
  )

  const fakeDekubitus = erstelleFakeSupabase(aufruf => {
    if (aufruf.tabelle === 'wounds' && aufruf.operation === 'select') return { data: { wund_typ: 'dekubitus' } }
    if (aufruf.tabelle === 'wounds' && aufruf.operation === 'update') return { data: { id: 'w-1', ...(aufruf.payload as object) } }
    return undefined
  })
  const wunde = await updateWound(fakeDekubitus.client, 'w-1', 'org-1', { dekubitusGrad: 3 })
  assert.equal(wunde.dekubitus_grad, 3)
})

test('updateWound hält Status und Abheilungsdatum konsistent (DB-Constraint)', async () => {
  const { supabase, updates } = schreibClient()
  await updateWound(supabase, 'w-1', 'org-1', { status: 'abgeheilt' })
  assert.equal(updates[0].status, 'abgeheilt')
  assert.ok(typeof updates[0].abgeheilt_am === 'string', 'abgeheilt_am muss automatisch gesetzt werden')

  await updateWound(supabase, 'w-1', 'org-1', { status: 'aktiv' })
  assert.equal(updates[1].abgeheilt_am, null, 'Reaktivierung muss abgeheilt_am löschen')

  await assert.rejects(
    () => updateWound(supabase, 'w-1', 'org-1', { abgeheiltAm: '2026-08-01' }),
    /nur zusammen mit status/,
  )
})

test('updateWound ohne Änderungen wirft', async () => {
  const { supabase } = schreibClient()
  await assert.rejects(() => updateWound(supabase, 'w-1', 'org-1', {}), /Keine Änderungen/)
})

test('zusammenfassungWunden zählt offene, heilende und Dekubitus korrekt', () => {
  const wunden = [
    { status: 'aktiv', wund_typ: 'dekubitus' },
    { status: 'in_abheilung', wund_typ: 'ulcus_cruris' },
    { status: 'verschlechtert', wund_typ: 'dekubitus' },
    { status: 'abgeheilt', wund_typ: 'dekubitus' },
  ] as Pick<Wound, 'status' | 'wund_typ'>[]
  const z = zusammenfassungWunden(wunden)
  assert.deepEqual(z, { gesamt: 4, offen: 3, in_abheilung: 1, verschlechtert: 1, dekubitus: 2 })
})
