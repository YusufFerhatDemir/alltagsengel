// PflegeCoach Einwilligungs-Auswertung — node:test
// Ausführen: npx tsx --test lib/coach/consent.test.ts  (oder npm run test:unit)

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hatAktiveEinwilligung, PFLICHT_CONSENT, type ConsentZeile } from './consent'

const erteilt = (typ: string, widerrufen: string | null = null): ConsentZeile =>
  ({ consent_typ: typ, erteilt: true, widerrufen_am: widerrufen })

const widerrufsVermerk = (typ: string): ConsentZeile =>
  ({ consent_typ: typ, erteilt: false, widerrufen_am: null })

test('ohne Zeilen gilt keine Einwilligung', () => {
  assert.equal(hatAktiveEinwilligung([], PFLICHT_CONSENT), false)
})

test('eine erteilte, nicht widerrufene Zeile genügt', () => {
  assert.equal(hatAktiveEinwilligung([erteilt(PFLICHT_CONSENT)], PFLICHT_CONSENT), true)
})

test('gestempelter Widerruf hebt die Erteilung auf', () => {
  const zeilen = [erteilt(PFLICHT_CONSENT, '2026-08-13T10:00:00Z'), widerrufsVermerk(PFLICHT_CONSENT)]
  assert.equal(hatAktiveEinwilligung(zeilen, PFLICHT_CONSENT), false)
})

test('erneute Erteilung nach Widerruf gilt wieder', () => {
  // Die Tabelle ist append-only: Der alte Widerruf bleibt stehen, die neue
  // Erteilung kommt hinzu. Genau dieser Fall entscheidet, ob ein Nutzer nach
  // dem Widerruf wieder arbeiten kann.
  const zeilen = [
    erteilt(PFLICHT_CONSENT, '2026-08-13T10:00:00Z'),
    widerrufsVermerk(PFLICHT_CONSENT),
    erteilt(PFLICHT_CONSENT),
  ]
  assert.equal(hatAktiveEinwilligung(zeilen, PFLICHT_CONSENT), true)
})

test('die Reihenfolge der Zeilen ist egal', () => {
  const zeilen = [erteilt(PFLICHT_CONSENT), erteilt(PFLICHT_CONSENT, '2026-08-13T10:00:00Z')]
  assert.equal(hatAktiveEinwilligung(zeilen, PFLICHT_CONSENT), true)
  assert.equal(hatAktiveEinwilligung([...zeilen].reverse(), PFLICHT_CONSENT), true)
})

test('Einwilligungen anderer Typen zählen nicht', () => {
  const zeilen = [erteilt('wissenschaftliche_auswertung'), erteilt('datenfreigabe')]
  assert.equal(hatAktiveEinwilligung(zeilen, PFLICHT_CONSENT), false)
  assert.equal(hatAktiveEinwilligung(zeilen, 'wissenschaftliche_auswertung'), true)
})

test('eine reine Widerrufszeile allein erteilt nichts', () => {
  assert.equal(hatAktiveEinwilligung([widerrufsVermerk(PFLICHT_CONSENT)], PFLICHT_CONSENT), false)
})
