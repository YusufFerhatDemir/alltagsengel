// PflegeCoach — Zweiter Faktor: Auswertungsregeln — node:test
// Ausführen: npx tsx --test lib/coach/mfa.test.ts  (oder npm run test:unit)

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  codeAbfrageNoetig, COACH_MFA_PFLICHT_ENV, faktorName, MFA_EINRICHTUNG_CODE,
  MFA_ZWEITER_FAKTOR_CODE, mfaEingerichtet, mfaPflicht, mfaSperre, mfaStand,
  verifizierteFaktoren, type MfaFaktor,
} from './mfa'
import { COACH_DIPA_MODUS_ENV } from './config'

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

// ── DiPA-Modus erzwingt den zweiten Faktor (TR-03161 O.Auth_3) ────────────
// Belegstelle: BSI TR-03161-1 O.Auth_3 / TR-03161-3 O.Auth_4 — „Jeder
// Authentifizierungsvorgang des Nutzers MUSS in Form einer
// Zwei-Faktor-Authentisierung umgesetzt werden." Verbindlich über
// DiPAV §5 Abs. 2 Nr. 1 → §78a Abs. 7 SGB XI.

/** Setzt die beiden Schalter für die Dauer eines Testfalls. */
function mitSchaltern(dipa: string | undefined, pflicht: string | undefined, fn: () => void) {
  const vorherDipa = process.env[COACH_DIPA_MODUS_ENV]
  const vorherPflicht = process.env[COACH_MFA_PFLICHT_ENV]
  try {
    if (dipa === undefined) delete process.env[COACH_DIPA_MODUS_ENV]
    else process.env[COACH_DIPA_MODUS_ENV] = dipa
    if (pflicht === undefined) delete process.env[COACH_MFA_PFLICHT_ENV]
    else process.env[COACH_MFA_PFLICHT_ENV] = pflicht
    fn()
  } finally {
    if (vorherDipa === undefined) delete process.env[COACH_DIPA_MODUS_ENV]
    else process.env[COACH_DIPA_MODUS_ENV] = vorherDipa
    if (vorherPflicht === undefined) delete process.env[COACH_MFA_PFLICHT_ENV]
    else process.env[COACH_MFA_PFLICHT_ENV] = vorherPflicht
  }
}

test('ohne DiPA-Modus bleibt der zweite Faktor freiwillig (unveraenderter Default)', () => {
  mitSchaltern(undefined, undefined, () => assert.equal(mfaPflicht(), false))
  mitSchaltern('false', undefined, () => assert.equal(mfaPflicht(), false))
})

test('ausserhalb des DiPA-Modus schaltet COACH_MFA_PFLICHT die Pflicht scharf', () => {
  mitSchaltern('false', 'true', () => assert.equal(mfaPflicht(), true))
})

test('im DiPA-Modus ist der zweite Faktor Pflicht — auch ohne gesetzten Schalter', () => {
  mitSchaltern('true', undefined, () => assert.equal(mfaPflicht(), true))
})

test('im DiPA-Modus laesst sich die Pflicht NICHT per Schalter abschalten (O.Auth_3)', () => {
  // Die Herabstufung nach O.Auth_4 verlangt die Einwilligung des einzelnen
  // Nutzers, nicht einen globalen Deployment-Schalter — deshalb fail-closed.
  mitSchaltern('true', 'false', () => assert.equal(mfaPflicht(), true))
})

test('Pflicht aus dem DiPA-Modus wirkt bis in die Sperre durch', () => {
  mitSchaltern('true', 'false', () => {
    // mfaStand ohne dritten Parameter liest mfaPflicht() — genau der Weg,
    // den lib/coach/api-auth.ts nimmt.
    assert.equal(mfaStand([], 'aal1').pflicht, true)
    assert.equal(mfaSperre(mfaStand([], 'aal1'))?.code, MFA_EINRICHTUNG_CODE)
  })
})
