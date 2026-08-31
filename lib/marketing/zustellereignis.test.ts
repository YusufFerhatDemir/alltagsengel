// Zustellereignisse und ihre Reihenfolge — node:test
// Ausführen: npx tsx --test lib/marketing/zustellereignis.test.ts
//
// Webhooks kommen NICHT in Reihenfolge an. Der Fehler, den diese Tests
// verhindern, ist derselbe wie bei monthly_closings und bonus_berechnungen:
// ein Schreibvorgang, der den Bestand nicht liest, kann einen Fortschritt
// nur verlieren — „zugestellt" landet über „geklickt", und die Auswertung
// zeigt weniger Klicks als es gab.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { berechneAenderung, RANG, sperrgrundFuer, type Bestand } from './zustellereignis'
import type { ZustellStatus } from './typen'

const Z = '2026-08-31T10:00:00.000Z'

function bestand(status: ZustellStatus, ueber: Partial<Bestand> = {}): Bestand {
  return {
    status,
    sent_at: '2026-08-31T09:00:00.000Z',
    delivered_at: null, opened_at: null, clicked_at: null,
    bounced_at: null, unsubscribed_at: null,
    ...ueber,
  }
}

// ── Vorwärts ──────────────────────────────────────────────────────────────

test('gesendet → zugestellt hebt den Status', () => {
  const a = berechneAenderung('email.delivered', bestand('gesendet'), Z)
  assert.equal(a.statusGehoben, true)
  assert.equal(a.felder.status, 'zugestellt')
  assert.equal(a.felder.delivered_at, Z)
})

test('zugestellt → geöffnet → geklickt hebt jeweils', () => {
  assert.equal(berechneAenderung('email.opened', bestand('zugestellt'), Z).felder.status, 'geoeffnet')
  assert.equal(berechneAenderung('email.clicked', bestand('geoeffnet'), Z).felder.status, 'geklickt')
})

// ── Rückwärts: der eigentliche Zweck ──────────────────────────────────────

test('ein spät eintreffendes „zugestellt" überschreibt „geklickt" NICHT', () => {
  const a = berechneAenderung('email.clicked', bestand('geklickt'), Z)
  assert.equal(a.statusGehoben, false)

  const b = berechneAenderung('email.delivered', bestand('geklickt'), Z)
  assert.equal(b.statusGehoben, false)
  assert.equal(b.felder.status, undefined)
})

test('der Zeitstempel wird trotzdem gesetzt, auch ohne Statuswechsel', () => {
  // „delivered_at" ist eine Tatsache über diese Mail — unabhängig davon,
  // was der zusammenfassende Status gerade sagt.
  const a = berechneAenderung('email.delivered', bestand('geklickt'), Z)
  assert.equal(a.felder.delivered_at, Z)
  assert.equal(a.statusGehoben, false)
})

test('ein bereits gesetzter Zeitstempel wird nicht verschoben', () => {
  // Eine Wiederholung derselben Zustellung darf den ERSTEN Zeitpunkt
  // nicht überschreiben.
  const frueher = '2026-08-31T09:30:00.000Z'
  const a = berechneAenderung('email.opened', bestand('geoeffnet', { opened_at: frueher }), Z)
  assert.equal(a.felder.opened_at, undefined)
})

test('eine doppelte Zustellung desselben Ereignisses ändert nichts', () => {
  const a = berechneAenderung(
    'email.delivered', bestand('zugestellt', { delivered_at: Z }), Z,
  )
  assert.deepEqual(a.felder, {})
  assert.equal(a.statusGehoben, false)
})

// ── Endzustände ───────────────────────────────────────────────────────────

test('ein Bounce schlägt „geöffnet"', () => {
  // Ein Hard Bounce heißt: nie angekommen. Ein „geöffnet" davor kam von
  // einem Scanner im Mailweg und wäre die falsche Zusammenfassung.
  const a = berechneAenderung('email.bounced', bestand('geoeffnet'), Z)
  assert.equal(a.felder.status, 'unzustellbar')
  assert.equal(a.felder.bounced_at, Z)
})

test('eine Beschwerde schlägt alles andere', () => {
  for (const vorher of ['gesendet', 'zugestellt', 'geoeffnet', 'geklickt', 'unzustellbar'] as const) {
    const a = berechneAenderung('email.complained', bestand(vorher), Z)
    assert.equal(a.felder.status, 'abgemeldet', `aus ${vorher}`)
  }
})

test('„abgemeldet" wird von nichts mehr überschrieben', () => {
  // Eine Willenserklärung der Person. Kein technisches Ereignis darf sie
  // aufheben.
  for (const e of ['email.delivered', 'email.opened', 'email.clicked', 'email.bounced'] as const) {
    assert.equal(berechneAenderung(e, bestand('abgemeldet'), Z).statusGehoben, false, e)
  }
})

test('eine Verzögerung ist kein Endzustand', () => {
  const a = berechneAenderung('email.delivery_delayed', bestand('gesendet'), Z)
  assert.deepEqual(a.felder, {})
  assert.equal(a.statusGehoben, false)
})

// ── Der CHECK der Tabelle ─────────────────────────────────────────────────

test('fehlt sent_at, wird es mitgesetzt', () => {
  // email_campaign_logs_gesendet_braucht_zeit verlangt bei jedem Status
  // außer 'geplant'/'fehler' ein gesetztes sent_at. Ohne diese Ergänzung
  // scheiterte das UPDATE und das Ereignis wäre verloren.
  const a = berechneAenderung('email.delivered', bestand('geplant', { sent_at: null }), Z)
  assert.equal(a.felder.status, 'zugestellt')
  assert.equal(a.felder.sent_at, Z)
})

test('für „fehler" wird sent_at nicht erfunden', () => {
  const a = berechneAenderung('email.failed', bestand('geplant', { sent_at: null }), Z)
  assert.equal(a.felder.status, 'fehler')
  assert.equal(a.felder.sent_at, undefined)
})

// ── Sperrgrund ────────────────────────────────────────────────────────────

test('nur ein dauerhafter Bounce sperrt', () => {
  assert.equal(sperrgrundFuer('email.bounced', 'Permanent'), 'hard_bounce')
  assert.equal(sperrgrundFuer('email.bounced', 'permanent'), 'hard_bounce')
})

test('ein vorübergehender Bounce sperrt NICHT', () => {
  // Postfach voll, Server kurz weg: die Adresse ist gültig. Eine Sperre
  // daraus wäre ein dauerhafter Verlust wegen eines Übergangszustands.
  assert.equal(sperrgrundFuer('email.bounced', 'Transient'), null)
})

test('ein fehlender oder unbekannter Bounce-Typ sperrt NICHT', () => {
  assert.equal(sperrgrundFuer('email.bounced', null), null)
  assert.equal(sperrgrundFuer('email.bounced', undefined), null)
  assert.equal(sperrgrundFuer('email.bounced', 'Undetermined'), null)
})

test('eine Beschwerde sperrt immer', () => {
  assert.equal(sperrgrundFuer('email.complained', null), 'spam_beschwerde')
})

test('gewöhnliche Ereignisse sperren nie', () => {
  for (const e of ['email.sent', 'email.delivered', 'email.opened', 'email.clicked', 'email.failed'] as const) {
    assert.equal(sperrgrundFuer(e, 'Permanent'), null, e)
  }
})

// ── Die Rangordnung selbst ────────────────────────────────────────────────

test('die Rangordnung ist streng monoton entlang des Zustellwegs', () => {
  const weg: ZustellStatus[] = ['geplant', 'gesendet', 'zugestellt', 'geoeffnet', 'geklickt']
  for (let i = 1; i < weg.length; i++) {
    assert.ok(RANG[weg[i]] > RANG[weg[i - 1]], `${weg[i]} > ${weg[i - 1]}`)
  }
  assert.ok(RANG.unzustellbar > RANG.geklickt)
  assert.ok(RANG.abgemeldet > RANG.unzustellbar)
})
