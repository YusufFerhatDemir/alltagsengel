// PflegeCoach Belastungs-Selbsteinschätzung — node:test
// Ausführen: npx tsx --test lib/coach/belastung.test.ts  (oder npm run test:unit)

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BELASTUNG_ITEMS, BELASTUNG_MAX, belastungHinweisNoetig, belastungSumme } from './belastung'

function alleAntworten(wert: number): Record<string, number> {
  return Object.fromEntries(BELASTUNG_ITEMS.map(i => [i.id, wert]))
}

test('belastungSumme: vollständige Antworten ergeben Summe', () => {
  assert.equal(belastungSumme(alleAntworten(0)), 0)
  assert.equal(belastungSumme(alleAntworten(3)), BELASTUNG_MAX)
  assert.equal(belastungSumme(alleAntworten(2)), BELASTUNG_ITEMS.length * 2)
})

test('belastungSumme: unvollständig oder ungültig → null', () => {
  const unvollstaendig = alleAntworten(1)
  delete unvollstaendig[BELASTUNG_ITEMS[0].id]
  assert.equal(belastungSumme(unvollstaendig), null)
  assert.equal(belastungSumme({ ...alleAntworten(1), [BELASTUNG_ITEMS[0].id]: 5 }), null)
  assert.equal(belastungSumme({ ...alleAntworten(1), [BELASTUNG_ITEMS[0].id]: 1.5 }), null)
  assert.equal(belastungSumme({ ...alleAntworten(1), [BELASTUNG_ITEMS[0].id]: '2' as unknown as number }), null)
})

test('belastungHinweisNoetig: oberes Drittel triggert immer', () => {
  assert.equal(belastungHinweisNoetig(14, null), true)
  assert.equal(belastungHinweisNoetig(21, null), true)
  assert.equal(belastungHinweisNoetig(13, null), false)
})

test('belastungHinweisNoetig: Anstieg um >= 4 triggert', () => {
  assert.equal(belastungHinweisNoetig(10, 6), true)
  assert.equal(belastungHinweisNoetig(10, 7), false)
  assert.equal(belastungHinweisNoetig(3, null), false)
})
