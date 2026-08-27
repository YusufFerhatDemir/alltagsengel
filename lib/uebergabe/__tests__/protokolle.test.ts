// ═══════════════════════════════════════════════════════════════
// Tests: Übergabeprotokolle — Eingabevalidierung + Abschlussregeln
// Ausführen: npm run test:unit
// ═══════════════════════════════════════════════════════════════

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  caregiverIdsGehoerenZuOrg,
  validateAbschluss,
  validateProtokollEingabe,
  type CreateProtokollParams,
} from '../protokolle'
import type { Schicht } from '../types'

function fakeCaregiversClient(gefunden: { id: string }[]) {
  const calls: Array<{ table: string; filters: Array<[string, unknown]> }> = []
  const supabase = {
    from(table: string) {
      const filters: Array<[string, unknown]> = []
      const kette: any = {
        select: () => kette,
        eq: (spalte: string, wert: unknown) => { filters.push([spalte, wert]); return kette },
        in: async (spalte: string, werte: unknown) => {
          filters.push([spalte, werte])
          calls.push({ table, filters })
          return { data: gefunden, error: null }
        },
      }
      return kette
    },
  }
  return { supabase: supabase as never, calls }
}

function basis(overrides: Partial<CreateProtokollParams> = {}): CreateProtokollParams {
  return {
    organizationId: 'org-1',
    datum: '2026-09-03',
    schicht: 'frueh',
    uebergeberId: 'user-1',
    uebergeberName: 'Alltagsengel',
    ...overrides,
  }
}

test('validateProtokollEingabe akzeptiert eine vollständige Eingabe', () => {
  assert.doesNotThrow(() => validateProtokollEingabe(basis()))
})

test('validateProtokollEingabe erzwingt ein ISO-Datum', () => {
  assert.throws(() => validateProtokollEingabe(basis({ datum: '03.09.2026' })), /YYYY-MM-DD/)
  assert.throws(() => validateProtokollEingabe(basis({ datum: '2026-9-3' })), /YYYY-MM-DD/)
})

test('validateProtokollEingabe lässt nur bekannte Schichten zu', () => {
  const erlaubt: Schicht[] = ['frueh', 'spaet', 'nacht', 'wochenende', 'bereitschaft', 'sonstige']
  for (const schicht of erlaubt) {
    assert.doesNotThrow(() => validateProtokollEingabe(basis({ schicht })))
  }
  assert.throws(
    () => validateProtokollEingabe(basis({ schicht: 'zwischendienst' as Schicht })),
    /Ungültiger Wert/,
  )
})

test('validateProtokollEingabe verlangt eine übergebende Person', () => {
  assert.throws(() => validateProtokollEingabe(basis({ uebergeberName: '   ' })), /Pflichtfeld/)
  assert.throws(() => validateProtokollEingabe(basis({ uebergeberId: '' })), /angemeldet/)
})

test('validateAbschluss blockt ein Protokoll ohne jeden Inhalt', () => {
  assert.throws(() => validateAbschluss('offen', 0, null), /weder Übergabepunkte noch eine Zusammenfassung/)
  assert.throws(() => validateAbschluss('offen', 0, '   '), /weder Übergabepunkte noch eine Zusammenfassung/)
})

test('validateAbschluss lässt Punkte ODER Zusammenfassung genügen', () => {
  assert.doesNotThrow(() => validateAbschluss('offen', 3, null))
  assert.doesNotThrow(() => validateAbschluss('offen', 0, 'Ruhige Schicht, keine Vorkommnisse.'))
})

test('validateAbschluss verhindert den doppelten Abschluss', () => {
  assert.throws(() => validateAbschluss('abgeschlossen', 5, 'egal'), /bereits abgeschlossen/)
})

test('caregiverIdsGehoerenZuOrg gibt true zurück, wenn eine leere Liste übergeben wird', async () => {
  const { supabase, calls } = fakeCaregiversClient([])
  assert.equal(await caregiverIdsGehoerenZuOrg(supabase, [], 'org-1'), true)
  assert.equal(calls.length, 0)
})

test('caregiverIdsGehoerenZuOrg gibt true zurück, wenn alle IDs zur Organisation gehören', async () => {
  const { supabase, calls } = fakeCaregiversClient([{ id: 'cg-1' }, { id: 'cg-2' }])
  const ergebnis = await caregiverIdsGehoerenZuOrg(supabase, ['cg-1', 'cg-2'], 'org-1')
  assert.equal(ergebnis, true)
  assert.equal(calls[0].table, 'caregivers')
  assert.deepEqual(calls[0].filters, [['organization_id', 'org-1'], ['id', ['cg-1', 'cg-2']]])
})

test('caregiverIdsGehoerenZuOrg gibt false zurück, wenn eine ID zu einer fremden Organisation gehört', async () => {
  const { supabase } = fakeCaregiversClient([{ id: 'cg-1' }])
  const ergebnis = await caregiverIdsGehoerenZuOrg(supabase, ['cg-1', 'cg-fremd'], 'org-1')
  assert.equal(ergebnis, false)
})

test('caregiverIdsGehoerenZuOrg dedupliziert, bevor sie zählt', async () => {
  const { supabase } = fakeCaregiversClient([{ id: 'cg-1' }])
  const ergebnis = await caregiverIdsGehoerenZuOrg(supabase, ['cg-1', 'cg-1'], 'org-1')
  assert.equal(ergebnis, true)
})
