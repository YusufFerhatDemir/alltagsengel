// Ereigniskatalog und Meldeentscheidung — node:test
// Ausführen: npx tsx --test lib/security/ereignisse.test.ts
//
// Der Katalog ist die Stelle, an der ein Ereignis seinen Schweregrad und
// seine Meldepflicht bekommt. Ein Typ, den er nicht kennt, fällt auf
// UNBEKANNTE_REGEL zurück — sichtbar, aber nicht meldepflichtig. Das ist
// als Rückfall richtig und als Dauerzustand gefährlich: genau so entging
// `watchlist_aktiviert` monatelang der Meldepflicht.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  EREIGNISSE, UEBERWACHUNGS_EREIGNISSE, UNBEKANNTE_REGEL,
  regelFuer, ueberwachungspflichtig, hoechsterSchweregrad,
} from './ereignisse'
import { meldetFuer } from './benachrichtigung'

// ── Der Befund vom 31.08.2026 ─────────────────────────────────────────────

test('beide Schreibweisen der Watchlist-Änderung sind im Katalog', () => {
  // Die Route schreibt `watchlist_change`, der Einrichtungsweg schrieb
  // `watchlist_aktiviert`. Die Zeile in security_audit_log ist
  // unveränderlich — der Katalog muss den Wert deshalb kennen.
  for (const typ of ['watchlist_change', 'watchlist_aktiviert', 'watchlist_deaktiviert']) {
    assert.ok(EREIGNISSE[typ], `${typ} fehlt im Katalog`)
    assert.equal(regelFuer(typ).schweregrad, 'critical', `${typ} ist nicht kritisch`)
    assert.equal(regelFuer(typ).meldepflichtig, true, `${typ} ist nicht meldepflichtig`)
  }
})

test('das Abschalten einer Überwachung löst für ein überwachtes Konto Alarm aus', () => {
  // Der erste Schritt eines Missbrauchs ist, die Überwachung stillzulegen.
  // Bliebe `watchlist_deaktiviert` außerhalb des Überwachungssatzes, wäre
  // genau dieser Schritt der einzige lautlose.
  const lage = {
    privilegiert: false,
    ueberwachung: { aktiv: true, alleEreignisse: true, ohneSperrfrist: true, meldeEmail: null },
  }
  for (const typ of ['watchlist_change', 'watchlist_aktiviert', 'watchlist_deaktiviert']) {
    assert.equal(meldetFuer(typ, lage).melden, true, `${typ} meldet nicht`)
  }
})

// ── Der Überwachungssatz ──────────────────────────────────────────────────

test('jeder Eintrag im Überwachungssatz steht auch im Katalog', () => {
  // Ein Satzeintrag ohne Katalogeintrag meldet zwar, aber ohne
  // Bezeichnung und mit falschem Schweregrad.
  const verwaist = UEBERWACHUNGS_EREIGNISSE.filter((t) => !EREIGNISSE[t])
  assert.deepEqual(verwaist, [], `ohne Katalogeintrag: ${verwaist.join(', ')}`)
})

test('die Anmelde- und Kontoereignisse sind im Überwachungssatz', () => {
  for (const typ of [
    'login_success', 'login_failed', 'unknown_device', 'password_changed',
    'email_change', 'role_change', 'data_export',
  ]) {
    assert.equal(ueberwachungspflichtig(typ), true, `${typ} fehlt im Satz`)
  }
})

// ── Der Rückfall ──────────────────────────────────────────────────────────

test('ein unbekannter Typ ist sichtbar, aber nicht meldepflichtig', () => {
  const regel = regelFuer('voellig_erfundener_typ')
  assert.equal(regel, UNBEKANNTE_REGEL)
  assert.equal(regel.meldepflichtig, false)
})

test('ein unbekannter Typ meldet auch für ein überwachtes Konto nicht', () => {
  // Das ist die Kehrseite und der Grund, warum der Katalog gepflegt
  // gehören muss: „alle Ereignisse" heißt „alle BEKANNTEN Ereignisse".
  const lage = {
    privilegiert: false,
    ueberwachung: { aktiv: true, alleEreignisse: true, ohneSperrfrist: true, meldeEmail: null },
  }
  const e = meldetFuer('voellig_erfundener_typ', lage)
  assert.equal(e.melden, false)
  assert.match(e.grund, /Ueberwachungssatz/)
})

// ── Die Meldeentscheidung insgesamt ───────────────────────────────────────

test('ein gewöhnliches Konto löst keinen Alarm aus', () => {
  const still = { privilegiert: false, ueberwachung: null }
  for (const typ of ['login_success', 'password_changed', 'email_change']) {
    assert.equal(meldetFuer(typ, still).melden, false, `${typ} meldet unerwartet`)
  }
})

test('ein privilegiertes Konto löst bei meldepflichtigen Ereignissen aus', () => {
  const admin = { privilegiert: true, ueberwachung: null }
  assert.equal(meldetFuer('login_success', admin).melden, true)
  // Nicht meldepflichtige bleiben still, auch für Privilegierte.
  assert.equal(meldetFuer('login_failed', admin).melden, false)
})

test('der Versandnachweis meldet nie', () => {
  // Sonst schriebe jede Meldung eine Zeile, die die nächste Meldung
  // auslöst — eine Kette ohne Ende.
  const lage = {
    privilegiert: true,
    ueberwachung: { aktiv: true, alleEreignisse: true, ohneSperrfrist: true, meldeEmail: null },
  }
  assert.equal(meldetFuer('security_notification_sent', lage).melden, false)
})

// ── Schweregrad ───────────────────────────────────────────────────────────

test('Hochstufen geht, Herunterstufen nicht', () => {
  assert.equal(hoechsterSchweregrad('info', 'critical'), 'critical')
  assert.equal(hoechsterSchweregrad('critical', 'info'), 'critical')
  assert.equal(hoechsterSchweregrad('warning', 'info'), 'warning')
})
