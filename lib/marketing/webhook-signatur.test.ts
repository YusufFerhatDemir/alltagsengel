// Svix-Signatur der Resend-Webhooks — node:test
// Ausführen: npx tsx --test lib/marketing/webhook-signatur.test.ts
//
// Diese Prüfung ist die einzige Grenze vor einem öffentlichen Endpunkt, der
// Adressen dauerhaft sperren kann. Ein gefälschtes `email.bounced` nimmt
// einer Person die Post — deshalb prüfen die Tests vor allem, dass NICHTS
// ohne gültige Signatur durchgeht.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { pruefeSvixSignatur, TOLERANZ_MS, type SvixKopfzeilen } from './webhook-signatur'

const SCHLUESSEL_ROH = Buffer.from('geheim-geheim-geheim-32-zeichen!').toString('base64')
const GEHEIMNIS = `whsec_${SCHLUESSEL_ROH}`
const JETZT = 1_756_000_000_000
const ID = 'msg_2abc'
const RUMPF = '{"type":"email.delivered","data":{"email_id":"re_1"}}'

function signiere(
  rumpf = RUMPF, id = ID, zeit = Math.floor(JETZT / 1000), geheimnis = SCHLUESSEL_ROH,
): string {
  return createHmac('sha256', Buffer.from(geheimnis, 'base64'))
    .update(`${id}.${zeit}.${rumpf}`)
    .digest('base64')
}

function kopf(ueber: Partial<SvixKopfzeilen> = {}): SvixKopfzeilen {
  return {
    id: ID,
    timestamp: String(Math.floor(JETZT / 1000)),
    signature: `v1,${signiere()}`,
    ...ueber,
  }
}

// ── Der Normalfall ────────────────────────────────────────────────────────

test('eine korrekt signierte Nachricht wird angenommen', () => {
  assert.deepEqual(pruefeSvixSignatur(RUMPF, kopf(), GEHEIMNIS, JETZT), { ok: true })
})

test('das Präfix whsec_ ist optional', () => {
  assert.deepEqual(pruefeSvixSignatur(RUMPF, kopf(), SCHLUESSEL_ROH, JETZT), { ok: true })
})

test('bei einem Schlüsselwechsel genügt eine passende Signatur von mehreren', () => {
  const kopfzeilen = kopf({ signature: `v1,${signiere(RUMPF, ID, undefined, Buffer.from('anderer-schluessel-hier-32-zeich!').toString('base64'))} v1,${signiere()}` })
  assert.deepEqual(pruefeSvixSignatur(RUMPF, kopfzeilen, GEHEIMNIS, JETZT), { ok: true })
})

// ── Fail-closed ───────────────────────────────────────────────────────────

test('ohne Geheimnis geht nichts durch', () => {
  assert.deepEqual(
    pruefeSvixSignatur(RUMPF, kopf(), undefined, JETZT),
    { ok: false, grund: 'kein_geheimnis' },
  )
})

test('fehlende Kopfzeilen werden abgewiesen', () => {
  for (const fehlt of ['id', 'timestamp', 'signature'] as const) {
    const ergebnis = pruefeSvixSignatur(RUMPF, kopf({ [fehlt]: null }), GEHEIMNIS, JETZT)
    assert.deepEqual(ergebnis, { ok: false, grund: 'kopfzeilen' }, `ohne ${fehlt}`)
  }
})

test('ein veränderter Rumpf fällt durch', () => {
  // Der Kern: der Rumpf ist Teil des signierten Inhalts. Wer 'delivered'
  // zu 'bounced' macht, zerstört die Signatur.
  const veraendert = RUMPF.replace('email.delivered', 'email.bounced')
  assert.deepEqual(
    pruefeSvixSignatur(veraendert, kopf(), GEHEIMNIS, JETZT),
    { ok: false, grund: 'signatur' },
  )
})

test('eine veränderte Nachrichtenkennung fällt durch', () => {
  assert.deepEqual(
    pruefeSvixSignatur(RUMPF, kopf({ id: 'msg_anders' }), GEHEIMNIS, JETZT),
    { ok: false, grund: 'signatur' },
  )
})

test('ein falscher Schlüssel fällt durch', () => {
  const anders = `whsec_${Buffer.from('voellig-anderer-schluessel-32-z!').toString('base64')}`
  assert.deepEqual(
    pruefeSvixSignatur(RUMPF, kopf(), anders, JETZT),
    { ok: false, grund: 'signatur' },
  )
})

// ── Wiedereinspielung ─────────────────────────────────────────────────────

test('eine zu alte Nachricht wird abgewiesen', () => {
  // Ohne Altersgrenze wäre eine einmal mitgeschnittene, echte Nachricht
  // beliebig oft wiederholbar.
  const ergebnis = pruefeSvixSignatur(RUMPF, kopf(), GEHEIMNIS, JETZT + TOLERANZ_MS + 1000)
  assert.deepEqual(ergebnis, { ok: false, grund: 'zeitstempel' })
})

test('eine Nachricht aus der Zukunft wird abgewiesen', () => {
  const ergebnis = pruefeSvixSignatur(RUMPF, kopf(), GEHEIMNIS, JETZT - TOLERANZ_MS - 1000)
  assert.deepEqual(ergebnis, { ok: false, grund: 'zeitstempel' })
})

test('innerhalb der Toleranz wird angenommen', () => {
  assert.deepEqual(
    pruefeSvixSignatur(RUMPF, kopf(), GEHEIMNIS, JETZT + TOLERANZ_MS - 1000),
    { ok: true },
  )
})

test('ein unlesbarer Zeitstempel wird abgewiesen', () => {
  assert.deepEqual(
    pruefeSvixSignatur(RUMPF, kopf({ timestamp: 'gestern' }), GEHEIMNIS, JETZT),
    { ok: false, grund: 'zeitstempel' },
  )
})

// ── Formfehler ────────────────────────────────────────────────────────────

test('eine Signatur ohne Version v1 zählt nicht', () => {
  assert.deepEqual(
    pruefeSvixSignatur(RUMPF, kopf({ signature: `v0,${signiere()}` }), GEHEIMNIS, JETZT),
    { ok: false, grund: 'signatur' },
  )
})

test('Unsinn in der Signaturkopfzeile wirft nicht', () => {
  for (const wert of ['', 'v1,', 'kaputt', 'v1,!!!nicht-base64!!!']) {
    const ergebnis = pruefeSvixSignatur(RUMPF, kopf({ signature: wert }), GEHEIMNIS, JETZT)
    assert.equal(ergebnis.ok, false, `unerwartet angenommen: ${wert}`)
  }
})
