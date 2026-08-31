// Öffnungs- und Klicktracking — node:test
// Ausführen: npx tsx --test lib/marketing/tracking.test.ts  (oder npm run test:unit)
//
// ── DER BEFUND, DEN DIESE SUITE FESTHÄLT ──────────────────────────────────
// Der Resend-Webhook schrieb `opened_at` und `clicked_at` bedingungslos —
// für Werbepost UND für Rechnungen, Mahnungen und Sicherheitsmeldungen.
// Es gab keinen Schalter und keine Einwilligung.
//
// `opened_at` je Person ist die Aussage „diese namentlich bekannte Person
// hat diese Mail zu diesem Zeitpunkt geöffnet" — eine Verhaltensbeobachtung,
// keine Zustellinformation.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  trackingLage, trackingLageTransaktion, ohneTrackingFelder,
  istTrackingEreignis, TRACKING_FELDER,
} from './tracking'

const AN = { MARKETING_TRACKING_ERLAUBT: '1' } as NodeJS.ProcessEnv

test('ohne Schalter ist Tracking aus — das ist der Standard', () => {
  for (const env of [{}, { MARKETING_TRACKING_ERLAUBT: '0' }, { MARKETING_TRACKING_ERLAUBT: 'true' }]) {
    const lage = trackingLage(env as NodeJS.ProcessEnv)
    assert.equal(lage.erlaubt, false, JSON.stringify(env))
  }
  assert.match(trackingLage({} as NodeJS.ProcessEnv).grund, /NICHT gespeichert/)
})

test('nur die ausdrückliche 1 schaltet ein', () => {
  assert.equal(trackingLage(AN).erlaubt, true)
})

test('Transaktionspost wird NIE gemessen — auch nicht mit Schalter', () => {
  // Kein Parameter, keine Umgebung, keine Ausnahme. Es gibt hier keine
  // Einwilligung, auf die sich eine Verhaltensmessung stützen ließe.
  assert.equal(trackingLageTransaktion().erlaubt, false)
  assert.match(trackingLageTransaktion().grund, /keine Einwilligung/)
})

test('bei ausgeschaltetem Tracking fallen genau die zwei Felder weg', () => {
  const felder = {
    status: 'geoeffnet', sent_at: '2026-08-31T10:00:00Z',
    opened_at: '2026-08-31T10:05:00Z', clicked_at: '2026-08-31T10:06:00Z',
  }
  const { felder: gefiltert, verworfen } = ohneTrackingFelder(felder, trackingLage({} as NodeJS.ProcessEnv))

  assert.deepEqual(Object.keys(gefiltert).sort(), ['sent_at', 'status'])
  assert.deepEqual(verworfen.sort(), ['clicked_at', 'opened_at'])
})

test('die Zustellung selbst bleibt unberührt', () => {
  // Der wichtigste Punkt: gesendet, zugestellt, unzustellbar und
  // Beschwerde sind Tatsachen über die MAIL, nicht über die Person. Sie
  // dürfen von der Tracking-Frage nicht mitgerissen werden — sonst
  // verlöre man mit dem Tracking auch die Bounce-Verarbeitung.
  const felder = {
    status: 'unzustellbar', sent_at: '2026-08-31T10:00:00Z',
    delivered_at: '2026-08-31T10:01:00Z', bounced_at: '2026-08-31T10:02:00Z',
    unsubscribed_at: '2026-08-31T10:03:00Z',
  }
  const { felder: gefiltert, verworfen } = ohneTrackingFelder(felder, trackingLage({} as NodeJS.ProcessEnv))

  assert.deepEqual(gefiltert, felder)
  assert.deepEqual(verworfen, [])
})

test('mit Schalter bleibt alles stehen', () => {
  const felder = { status: 'geoeffnet', opened_at: '2026-08-31T10:05:00Z' }
  const { felder: gefiltert, verworfen } = ohneTrackingFelder(felder, trackingLage(AN))
  assert.deepEqual(gefiltert, felder)
  assert.deepEqual(verworfen, [])
})

test('die Feldliste deckt sich mit den Ereignissen', () => {
  // Käme ein drittes Tracking-Ereignis dazu, ohne dass sein Feld hier
  // steht, würde es weiterhin gespeichert. Die Prüfung hält beide Listen
  // aneinander.
  assert.deepEqual([...TRACKING_FELDER].sort(), ['clicked_at', 'opened_at'])
  assert.equal(istTrackingEreignis('email.opened'), true)
  assert.equal(istTrackingEreignis('email.clicked'), true)
  assert.equal(istTrackingEreignis('email.delivered'), false)
  assert.equal(istTrackingEreignis('email.bounced'), false)
  assert.equal(istTrackingEreignis(null), false)
})
