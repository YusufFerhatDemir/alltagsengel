// ═══════════════════════════════════════════════════════════════
// Tests: Pflegedoku-Übersicht — Filter, Kennzahlen
// Ausführen: npm run test:unit
// ═══════════════════════════════════════════════════════════════

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getPflegeUebersicht, zusammenfassungUebersicht } from '../uebersicht'
import type { PflegeUebersichtZeile } from '../types'

function uebersichtClient(zeilen: Partial<PflegeUebersichtZeile>[]) {
  const eqCalls: Array<[string, unknown]> = []
  const supabase = {
    from: () => ({
      select: () => {
        const kette: any = {
          eq: (spalte: string, wert: unknown) => { eqCalls.push([spalte, wert]); return kette },
          order: () => kette,
          then: (resolve: (v: unknown) => void) => resolve({ data: zeilen, error: null }),
        }
        return kette
      },
    }),
  }
  return { supabase: supabase as never, eqCalls }
}

test('getPflegeUebersicht filtert immer auf organization_id und wendet optionale Filter an', async () => {
  const { supabase, eqCalls } = uebersichtClient([])
  await getPflegeUebersicht(supabase, {
    organizationId: 'org-1', clientId: 'client-1', aufnahmestatus: 'offen',
    nurOhneAktivenPlan: true, nurOhneAnamnese: true,
  })
  assert.deepEqual(eqCalls, [
    ['organization_id', 'org-1'],
    ['client_id', 'client-1'],
    ['aufnahmestatus', 'offen'],
    ['aktive_plaene', 0],
    ['anamnesen_count', 0],
  ])
})

test('getPflegeUebersicht lässt optionale Filter ohne eq-Aufruf weg', async () => {
  const { supabase, eqCalls } = uebersichtClient([])
  await getPflegeUebersicht(supabase, { organizationId: 'org-1' })
  assert.deepEqual(eqCalls, [['organization_id', 'org-1']])
})

test('zusammenfassungUebersicht zählt Kunden ohne Anamnese/Plan, offene Aufnahmen und Risiken', () => {
  const zeilen = [
    { anamnesen_count: 0, aktive_plaene: 0, aufnahmestatus: 'offen', aktive_risiken: 0 },
    { anamnesen_count: 2, aktive_plaene: 1, aufnahmestatus: 'abgeschlossen', aktive_risiken: 3 },
    { anamnesen_count: 0, aktive_plaene: 1, aufnahmestatus: 'in_bearbeitung', aktive_risiken: 1 },
    { anamnesen_count: 1, aktive_plaene: 0, aufnahmestatus: 'archiviert', aktive_risiken: 0 },
  ] as unknown as PflegeUebersichtZeile[]

  assert.deepEqual(zusammenfassungUebersicht(zeilen), {
    kunden: 4,
    ohne_anamnese: 2,
    ohne_aktiven_plan: 2,
    offene_aufnahmen: 2,
    mit_risiken: 2,
  })
})

test('zusammenfassungUebersicht auf leerer Liste liefert lauter Nullen', () => {
  assert.deepEqual(zusammenfassungUebersicht([]), {
    kunden: 0, ohne_anamnese: 0, ohne_aktiven_plan: 0, offene_aufnahmen: 0, mit_risiken: 0,
  })
})
