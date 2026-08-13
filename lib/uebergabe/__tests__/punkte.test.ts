// ═══════════════════════════════════════════════════════════════
// Tests: Übergabepunkte — Handlungsbedarf-Logik + Validierung
// Ausführen: npm run test:unit
// ═══════════════════════════════════════════════════════════════

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { berechneHandlungsbedarf, validatePunktEingabe, type CreatePunktParams } from '../punkte'
import { offeneKenntnisnahmen } from '../kenntnisnahmen'
import type { Dringlichkeit, PunktKategorie } from '../types'

function basis(overrides: Partial<CreatePunktParams> = {}): CreatePunktParams {
  return {
    protokollId: 'prot-1',
    organizationId: 'org-1',
    inhalt: 'Frau Muster hat heute Nacht schlecht geschlafen.',
    erstelltVon: 'user-1',
    erstelltVonName: 'Alltagsengel',
    ...overrides,
  }
}

test('Sturz, Medikation und Arztkontakt erzwingen Handlungsbedarf', () => {
  const kategorien: PunktKategorie[] = ['sturz', 'medikation', 'arztkontakt']
  for (const kategorie of kategorien) {
    assert.equal(
      berechneHandlungsbedarf(kategorie, 'normal', false), true,
      `${kategorie} muss Handlungsbedarf auslösen`,
    )
  }
})

test('Kritische Dringlichkeit erzwingt Handlungsbedarf unabhängig von der Kategorie', () => {
  assert.equal(berechneHandlungsbedarf('sonstiges', 'kritisch', false), true)
  assert.equal(berechneHandlungsbedarf('termin', 'kritisch', undefined), true)
})

test('Sonst entscheidet das Formular über den Handlungsbedarf', () => {
  const dringlichkeiten: Dringlichkeit[] = ['normal', 'hoch']
  for (const d of dringlichkeiten) {
    assert.equal(berechneHandlungsbedarf('organisation', d, true), true)
    assert.equal(berechneHandlungsbedarf('organisation', d, false), false)
    assert.equal(berechneHandlungsbedarf('organisation', d, undefined), false)
  }
})

test('validatePunktEingabe verlangt Inhalt und erfassende Person', () => {
  assert.throws(() => validatePunktEingabe(basis({ inhalt: '   ' })), /Inhalt/)
  assert.throws(() => validatePunktEingabe(basis({ erstelltVonName: '' })), /erfassenden Person/)
})

test('validatePunktEingabe blockt unbekannte Kategorien und Dringlichkeiten', () => {
  assert.throws(
    () => validatePunktEingabe(basis({ kategorie: 'irgendwas' as PunktKategorie })),
    /Ungültiger Wert/,
  )
  assert.throws(
    () => validatePunktEingabe(basis({ dringlichkeit: 'sehr_dringend' as Dringlichkeit })),
    /Ungültiger Wert/,
  )
})

test('validatePunktEingabe verlangt zu einer Quell-ID auch den Quelltyp', () => {
  assert.throws(() => validatePunktEingabe(basis({ quelleId: 'abc' })), /Quelltyp/)
  assert.doesNotThrow(() => validatePunktEingabe(basis({ quelleId: 'abc', quelleTyp: 'pflege_verlauf' })))
})

test('offeneKenntnisnahmen meldet die noch fehlenden Empfänger', () => {
  const vorgesehen = ['cg-1', 'cg-2', 'cg-3']
  const quittiert = [{ caregiver_id: 'cg-2' }, { caregiver_id: null }]
  assert.deepEqual(offeneKenntnisnahmen(vorgesehen, quittiert), ['cg-1', 'cg-3'])
  assert.deepEqual(offeneKenntnisnahmen([], quittiert), [])
  assert.deepEqual(offeneKenntnisnahmen(vorgesehen, []), vorgesehen)
})
