// ═══════════════════════════════════════════════════════════════
// Tests: Übergabeprotokolle — Eingabevalidierung + Abschlussregeln
// Ausführen: npm run test:unit
// ═══════════════════════════════════════════════════════════════

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateAbschluss, validateProtokollEingabe, type CreateProtokollParams } from '../protokolle'
import type { Schicht } from '../types'

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
