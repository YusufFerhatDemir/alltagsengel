// PflegeCoach — Zweiter Faktor: Auswertungsregeln — node:test
// Ausführen: npx tsx --test lib/coach/mfa.test.ts  (oder npm run test:unit)

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  codeAbfrageNoetig, faktorName, MFA_EINRICHTUNG_CODE, MFA_ZWEITER_FAKTOR_CODE,
  mfaEingerichtet, mfaSperre, mfaStand, verifizierteFaktoren, type MfaFaktor,
} from './mfa'

const bestaetigt: MfaFaktor = { id: 'f1', factor_type: 'totp', status: 'verified', friendly_name: 'Handy' }
const angefangen: MfaFaktor = { id: 'f2', factor_type: 'totp', status: 'unverified', friendly_name: null }

test('nur bestätigte Faktoren zählen', () => {
  assert.equal(verifizierteFaktoren([bestaetigt, angefangen]).length, 1)
  assert.equal(mfaEingerichtet([angefangen]), false)
  assert.equal(mfaEingerichtet([bestaetigt]), true)
  assert.equal(mfaEingerichtet(null), false)
})

test('ohne Faktor ist AAL1 ausreichend — kein Nutzer wird ausgesperrt', () => {
  const stand = mfaStand([], 'aal1', false)
  assert.equal(stand.niveauErfuellt, true)
  assert.equal(mfaSperre(stand), null)
})

test('mit Faktor sperrt eine AAL1-Sitzung das Schreiben', () => {
  // Der sicherheitsrelevante Fall: gestohlenes Passwort, kein zweiter Faktor.
  const stand = mfaStand([bestaetigt], 'aal1', false)
  assert.equal(stand.niveauErfuellt, false)
  assert.equal(mfaSperre(stand)?.code, MFA_ZWEITER_FAKTOR_CODE)
})

test('mit Faktor und AAL2 ist das Schreiben erlaubt', () => {
  assert.equal(mfaSperre(mfaStand([bestaetigt], 'aal2', false)), null)
})

test('unbekanntes Niveau gilt bei eingerichtetem Faktor als nicht erfüllt (fail-closed)', () => {
  const stand = mfaStand([bestaetigt], null, false)
  assert.equal(mfaSperre(stand)?.code, MFA_ZWEITER_FAKTOR_CODE)
})

test('Pflichtmodus verlangt die Einrichtung, sperrt aber mit anderem Code', () => {
  const stand = mfaStand([], 'aal1', true)
  assert.equal(mfaSperre(stand)?.code, MFA_EINRICHTUNG_CODE)
})

test('Pflichtmodus: angefangene Einrichtung genügt nicht', () => {
  assert.equal(mfaSperre(mfaStand([angefangen], 'aal1', true))?.code, MFA_EINRICHTUNG_CODE)
  assert.equal(mfaStand([angefangen], 'aal1', true).unbestaetigt, 1)
})

test('Code-Abfrage beim Anmelden nur, wenn ein höheres Niveau erreichbar ist', () => {
  assert.equal(codeAbfrageNoetig('aal1', 'aal2'), true)
  assert.equal(codeAbfrageNoetig('aal2', 'aal2'), false)
  assert.equal(codeAbfrageNoetig('aal1', 'aal1'), false)
  // Kein Niveau ermittelbar → keine Abfrage; sonst hinge jede Anmeldung
  // an einer Eingabe, die der Nutzer gar nicht leisten kann.
  assert.equal(codeAbfrageNoetig(null, null), false)
})

test('Faktoren ohne Namen bekommen eine verständliche Bezeichnung', () => {
  assert.equal(faktorName(angefangen), 'Authenticator-App')
  assert.equal(faktorName({ id: 'f3', status: 'verified', friendly_name: '   ' }), 'Authenticator-App')
  assert.equal(faktorName(bestaetigt), 'Handy')
})
