// PflegeCoach Produktschalter — node:test
// Ausführen: npx tsx --test lib/coach/config.test.ts  (oder npm run test:unit)
//
// Warum das getestet wird: Diese drei Schalter sind die einzige Grenze
// zwischen „normaler digitaler Service" und „DiPA-Funktionen scharf".
// Ein versehentlich lockerer Vergleich (truthy statt === 'true') würde
// sie bei JEDEM gesetzten Wert aktivieren — auch bei 'false'.

import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  COACH_DIPA_MODUS_ENV, COACH_FREISCHALTUNG_ENV, COACH_NUTZUNGSNACHWEIS_ENV,
  dipaModus, freischaltungPflicht, nutzungsnachweisAktiv,
} from './config'

const ALLE_ENVS = [COACH_DIPA_MODUS_ENV, COACH_FREISCHALTUNG_ENV, COACH_NUTZUNGSNACHWEIS_ENV]

afterEach(() => {
  for (const key of ALLE_ENVS) delete process.env[key]
})

const SCHALTER: Array<[string, () => boolean]> = [
  [COACH_DIPA_MODUS_ENV, dipaModus],
  [COACH_FREISCHALTUNG_ENV, freischaltungPflicht],
  [COACH_NUTZUNGSNACHWEIS_ENV, nutzungsnachweisAktiv],
]

test('alle Schalter sind ohne gesetzte Variable aus', () => {
  for (const [key, fn] of SCHALTER) {
    delete process.env[key]
    assert.equal(fn(), false, `${key} muss ohne Wert aus sein`)
  }
})

test('nur der exakte Wert "true" aktiviert einen Schalter', () => {
  for (const [key, fn] of SCHALTER) {
    process.env[key] = 'true'
    assert.equal(fn(), true, `${key}=true muss aktivieren`)
  }
})

test('mehrdeutige Werte aktivieren nicht', () => {
  // '1', 'TRUE', 'yes' sind typische Deployment-Tippfehler. Sie dürfen den
  // DiPA-Modus nicht versehentlich scharf schalten.
  for (const wert of ['false', 'False', '1', 'TRUE', 'True', 'yes', 'ja', '', ' true ', '0']) {
    for (const [key, fn] of SCHALTER) {
      process.env[key] = wert
      assert.equal(fn(), false, `${key}=${JSON.stringify(wert)} darf nicht aktivieren`)
    }
  }
})

test('die Schalter wirken unabhängig voneinander', () => {
  process.env[COACH_DIPA_MODUS_ENV] = 'true'
  assert.equal(dipaModus(), true)
  assert.equal(freischaltungPflicht(), false)
  assert.equal(nutzungsnachweisAktiv(), false)
})
