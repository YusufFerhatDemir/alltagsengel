// ═══════════════════════════════════════════════════════════════
// Tests: Risiken — Typ-/Schweregrad-Validierung, Soft-Delete, Kennzahlen
// Ausführen: npm run test:unit
// ═══════════════════════════════════════════════════════════════

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  SCHWEREGRAD_RANG, createRisiko, deaktiviereRisiko, istKritisch,
  updateRisiko, zusammenfassungRisiken,
} from '../risiken'
import { RISIKO_SCHWEREGRAD_WERTE, RISIKO_TYP_WERTE } from '../types'
import type { PflegeRisiko, PflegeRisikoDashboardZeile } from '../types'

function schreibClient(bestand: Record<string, unknown> = { id: 'r-1', aktiv: true }) {
  const inserts: Array<Record<string, unknown>> = []
  const updates: Array<Record<string, unknown>> = []
  const supabase = {
    from: () => ({
      insert(payload: Record<string, unknown>) {
        inserts.push(payload)
        return { select: () => ({ single: async () => ({ data: { id: 'r-1', ...payload }, error: null }) }) }
      },
      update(payload: Record<string, unknown>) {
        updates.push(payload)
        const kette: any = {
          eq: () => kette,
          select: () => ({ single: async () => ({ data: { ...bestand, ...payload }, error: null }) }),
        }
        return kette
      },
    }),
  }
  return { supabase: supabase as never, inserts, updates }
}

test('SCHWEREGRAD_RANG deckt alle erlaubten Schweregrade streng aufsteigend ab', () => {
  assert.deepEqual(Object.keys(SCHWEREGRAD_RANG).sort(), [...RISIKO_SCHWEREGRAD_WERTE].sort())
  const werte = RISIKO_SCHWEREGRAD_WERTE.map(s => SCHWEREGRAD_RANG[s])
  for (let i = 1; i < werte.length; i++) {
    assert.ok(werte[i] > werte[i - 1], 'Rangfolge muss streng aufsteigend sein')
  }
})

test('istKritisch trennt bei "hoch"', () => {
  assert.equal(istKritisch({ schweregrad: 'niedrig' }), false)
  assert.equal(istKritisch({ schweregrad: 'mittel' }), false)
  assert.equal(istKritisch({ schweregrad: 'hoch' }), true)
  assert.equal(istKritisch({ schweregrad: 'kritisch' }), true)
})

test('createRisiko akzeptiert alle in der Migration erlaubten Risikotypen', async () => {
  for (const typ of RISIKO_TYP_WERTE) {
    const { supabase, inserts } = schreibClient()
    await createRisiko(supabase, {
      organizationId: 'org-1', clientId: 'client-1', risikoTyp: typ,
      bezeichnung: 'Testeintrag', erstelltVon: 'user-1',
    })
    assert.equal(inserts[0].risiko_typ, typ)
  }
})

test('createRisiko weist unbekannte Typen und Schweregrade zurück', async () => {
  let dbAufgerufen = false
  const supabase = { from() { dbAufgerufen = true; return {} as never } }
  const basis = { organizationId: 'org-1', clientId: 'client-1', bezeichnung: 'X', erstelltVon: 'user-1' }

  await assert.rejects(
    () => createRisiko(supabase as never, { ...basis, risikoTyp: 'kaffeerisiko' as never }),
    /Ungültiger Wert "kaffeerisiko" für risiko_typ/
  )
  await assert.rejects(
    () => createRisiko(supabase as never, { ...basis, risikoTyp: 'allergie', schweregrad: 'extrem' as never }),
    /Ungültiger Wert "extrem" für schweregrad/
  )
  await assert.rejects(
    () => createRisiko(supabase as never, { ...basis, bezeichnung: '  ', risikoTyp: 'allergie' }),
    /Bezeichnung ist ein Pflichtfeld/
  )
  assert.equal(dbAufgerufen, false)
})

test('createRisiko setzt "mittel" als Vorgabe-Schweregrad und aktiviert das Risiko', async () => {
  const { supabase, inserts } = schreibClient()
  await createRisiko(supabase, {
    organizationId: 'org-1', clientId: 'client-1', risikoTyp: 'sturzrisiko',
    bezeichnung: 'Unsicherer Gang', erstelltVon: 'user-1',
  })
  assert.equal(inserts[0].schweregrad, 'mittel')
  assert.equal(inserts[0].bezeichnung, 'Unsicherer Gang')
})

test('updateRisiko validiert vor dem Schreiben und trimmt die Bezeichnung', async () => {
  const { supabase, updates } = schreibClient()
  await assert.rejects(
    () => updateRisiko(supabase, 'r-1', 'org-1', { schweregrad: 'sehr_hoch' as never }),
    /Ungültiger Wert "sehr_hoch" für schweregrad/
  )
  await assert.rejects(
    () => updateRisiko(supabase, 'r-1', 'org-1', { bezeichnung: '   ' }),
    /Bezeichnung darf nicht leer sein/
  )
  await assert.rejects(
    () => updateRisiko(supabase, 'r-1', 'org-1', {}),
    /Keine Änderungen übergeben/
  )

  await updateRisiko(supabase, 'r-1', 'org-1', { bezeichnung: '  Nussallergie  ' })
  assert.deepEqual(updates[0], { bezeichnung: 'Nussallergie' })
})

test('deaktiviereRisiko ist ein Soft-Delete über aktiv=false', async () => {
  const { supabase, updates } = schreibClient()
  const risiko = await deaktiviereRisiko(supabase, 'r-1', 'org-1')
  assert.deepEqual(updates[0], { aktiv: false })
  assert.equal((risiko as PflegeRisiko).aktiv, false)
})

test('zusammenfassungRisiken zählt Schweregrade und Prüfstatus getrennt', () => {
  const zeilen = [
    { schweregrad: 'kritisch', pruefstatus: 'ueberfaellig' },
    { schweregrad: 'hoch', pruefstatus: 'bald_faellig' },
    { schweregrad: 'hoch', pruefstatus: 'ok' },
    { schweregrad: 'mittel', pruefstatus: 'keine_pruefung' },
    { schweregrad: 'niedrig', pruefstatus: 'ueberfaellig' },
  ] as PflegeRisikoDashboardZeile[]

  assert.deepEqual(zusammenfassungRisiken(zeilen), {
    gesamt: 5,
    kritisch: 1,
    hoch: 2,
    ueberfaellig: 2,
    bald_faellig: 1,
    ohne_pruefung: 1,
  })
})

test('zusammenfassungRisiken liefert für eine leere Liste lauter Nullen', () => {
  assert.deepEqual(zusammenfassungRisiken([]), {
    gesamt: 0, kritisch: 0, hoch: 0, ueberfaellig: 0, bald_faellig: 0, ohne_pruefung: 0,
  })
})
