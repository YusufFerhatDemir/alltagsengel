// PflegeCoach Vertragslogik — node:test
// Ausführen: npx tsx --test lib/coach/bestellung.test.ts
//
// Geprüft wird, wo Geld und Rechtsfolgen hängen: Zugangsfenster,
// Widerrufsfrist, Kündigungswirkung, Laufzeitrechnung. Das sind die
// Stellen, an denen ein Fehler entweder jemandem unbezahlten Zugang
// gibt oder ihm bezahlten Zugang wegnimmt.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  hatZugang, kuendigungMoeglich, laufzeitEnde, naechsteAbbuchung,
  widerrufMoeglich, widerrufsfristEnde, WIDERRUFSFRIST_TAGE,
  type BestellStatus, type BestellungZeile,
} from './bestellung'

function zeile(ueber: Partial<BestellungZeile> = {}): BestellungZeile {
  return {
    status: 'aktiv',
    tarif: 'monatlich',
    bestellt_am: '2026-08-01T10:00:00.000Z',
    laufzeit_bis: '2026-08-31',
    widerrufen_am: null,
    gekuendigt_am: null,
    ...ueber,
  }
}

// ─── hatZugang ─────────────────────────────────────────────────

test('hatZugang: aktiv innerhalb der Laufzeit', () => {
  assert.equal(hatZugang(zeile(), '2026-08-15'), true)
})

test('hatZugang: der letzte Laufzeittag zählt noch dazu', () => {
  // Der bezahlte Zeitraum schließt seinen letzten Tag ein. Ein Ausschluss
  // hier wäre ein Tag zu wenig für bezahltes Geld.
  assert.equal(hatZugang(zeile(), '2026-08-31'), true)
  assert.equal(hatZugang(zeile(), '2026-09-01'), false)
})

test('hatZugang: Laufzeitende sperrt auch bei noch nicht nachgeführtem Status', () => {
  // Das eigentliche Risiko: Zwischen Ablauf und dem Stripe-Ereignis, das
  // den Status setzt, liegen unter Umständen Stunden. In dieser Lücke
  // muss die Datumsprüfung greifen.
  assert.equal(hatZugang(zeile({ status: 'aktiv' }), '2026-12-01'), false)
})

test('hatZugang: gekündigt läuft bis zum Laufzeitende weiter', () => {
  const b = zeile({ status: 'gekuendigt', gekuendigt_am: '2026-08-05T00:00:00.000Z' })
  assert.equal(hatZugang(b, '2026-08-20'), true)
  assert.equal(hatZugang(b, '2026-09-01'), false)
})

test('hatZugang: offene Zahlung sperrt noch nicht', () => {
  // Kulanz mit Absicht: Stripe versucht mehrfach einzuziehen. Wer beim
  // ersten Fehlschlag ausgesperrt wird, verliert den Zugang wegen einer
  // abgelaufenen Karte.
  assert.equal(hatZugang(zeile({ status: 'zahlung_offen' }), '2026-08-15'), true)
})

test('hatZugang: alle beendenden Status sperren', () => {
  const beendet: BestellStatus[] = ['offen', 'abgelaufen', 'widerrufen', 'gesperrt']
  for (const status of beendet) {
    assert.equal(hatZugang(zeile({ status }), '2026-08-15'), false, status)
  }
})

test('hatZugang: ohne Bestellung kein Zugang', () => {
  assert.equal(hatZugang(null, '2026-08-15'), false)
  assert.equal(hatZugang(undefined, '2026-08-15'), false)
})

test('hatZugang: unbefristete Laufzeit bleibt offen', () => {
  assert.equal(hatZugang(zeile({ laufzeit_bis: null }), '2030-01-01'), true)
})

// ─── Widerrufsfrist ────────────────────────────────────────────

test('widerrufsfristEnde: 14 Tage ab Vertragsschluss', () => {
  assert.equal(WIDERRUFSFRIST_TAGE, 14)
  assert.equal(widerrufsfristEnde('2026-08-01T10:00:00.000Z'), '2026-08-15')
})

test('widerrufsfristEnde: über Monats- und Jahresgrenzen', () => {
  assert.equal(widerrufsfristEnde('2026-08-25T10:00:00.000Z'), '2026-09-08')
  assert.equal(widerrufsfristEnde('2026-12-28T23:59:00.000Z'), '2027-01-11')
})

test('widerrufsfristEnde: Uhrzeit verkürzt die Frist nie', () => {
  // Spätabends bestellt darf nicht bedeuten, dass die Frist faktisch
  // einen Tag kürzer ist.
  assert.equal(
    widerrufsfristEnde('2026-08-01T00:01:00.000Z'),
    widerrufsfristEnde('2026-08-01T23:59:00.000Z')
  )
})

test('widerrufMoeglich: innerhalb der Frist erlaubt, am letzten Tag noch', () => {
  assert.equal(widerrufMoeglich(zeile(), '2026-08-10').moeglich, true)
  // Ein Tag zu früh gesperrt ist ein Rechtsfehler, kein Rundungsdetail.
  assert.equal(widerrufMoeglich(zeile(), '2026-08-15').moeglich, true)
})

test('widerrufMoeglich: nach Fristablauf gesperrt, mit Datum und Kündigungshinweis', () => {
  const p = widerrufMoeglich(zeile(), '2026-08-16')
  assert.equal(p.moeglich, false)
  if (!p.moeglich) {
    assert.ok(p.grund.includes('15.08.2026'), p.grund)
    assert.ok(p.grund.includes('kündigen'), p.grund)
  }
})

test('widerrufMoeglich: kein zweiter Widerruf, keiner ohne Vertragsschluss', () => {
  const schon = zeile({ status: 'widerrufen', widerrufen_am: '2026-08-05T00:00:00.000Z' })
  assert.equal(widerrufMoeglich(schon, '2026-08-10').moeglich, false)
  assert.equal(widerrufMoeglich(zeile({ status: 'offen' }), '2026-08-10').moeglich, false)
})

test('widerrufMoeglich: auch nach Kündigung noch möglich', () => {
  // Kündigung und Widerruf schließen sich nicht aus: Wer zuerst gekündigt
  // hat und dann merkt, dass die Frist noch läuft, bekommt sein Geld
  // zurück statt nur das Periodenende.
  const b = zeile({ status: 'gekuendigt', gekuendigt_am: '2026-08-03T00:00:00.000Z' })
  assert.equal(widerrufMoeglich(b, '2026-08-10').moeglich, true)
})

// ─── Kündigung ─────────────────────────────────────────────────

test('kuendigungMoeglich: aktiver Vertrag wirkt zum Laufzeitende', () => {
  const p = kuendigungMoeglich(zeile())
  assert.equal(p.moeglich, true)
  if (p.moeglich) assert.equal(p.wirktZum, '2026-08-31')
})

test('kuendigungMoeglich: auch bei offener Zahlung erlaubt', () => {
  // Sonst säße jemand mit fehlgeschlagener Karte im Vertrag fest.
  assert.equal(kuendigungMoeglich(zeile({ status: 'zahlung_offen' })).moeglich, true)
})

test('kuendigungMoeglich: keine zweite Kündigung, keine bei beendeten Verträgen', () => {
  const gesperrt: BestellStatus[] = ['gekuendigt', 'widerrufen', 'abgelaufen', 'offen']
  for (const status of gesperrt) {
    assert.equal(kuendigungMoeglich(zeile({ status })).moeglich, false, status)
  }
})

// ─── Laufzeit ──────────────────────────────────────────────────

test('laufzeitEnde: Start plus Intervall minus ein Tag', () => {
  assert.equal(laufzeitEnde('2026-03-15', 1), '2026-04-14')
  assert.equal(laufzeitEnde('2026-03-15', 12), '2027-03-14')
  assert.equal(laufzeitEnde('2026-12-15', 1), '2027-01-14')
})

test('laufzeitEnde: Monatsüberlauf wird auf den letzten Tag geklemmt', () => {
  // 31.01. + 1 Monat ergibt in JavaScript den 03.03. Ohne Klemmung
  // wanderte ein Monatsabo jedes Frühjahr nach vorne.
  assert.equal(laufzeitEnde('2026-01-31', 1), '2026-02-27')
  assert.equal(laufzeitEnde('2028-01-31', 1), '2028-02-28') // Schaltjahr
})

test('laufzeitEnde: Folgezeitraum schließt lückenlos an', () => {
  // Weder eine Lücke (unbezahlter Tag) noch eine Überlappung (doppelt
  // bezahlt) — beides fiele in der Abrechnung auf.
  const ende = laufzeitEnde('2026-03-15', 1)
  const folge = new Date(`${ende}T00:00:00Z`)
  folge.setUTCDate(folge.getUTCDate() + 1)
  assert.equal(folge.toISOString().slice(0, 10), '2026-04-15')
})

// ─── Nächste Abbuchung ─────────────────────────────────────────

test('naechsteAbbuchung: Tag nach dem Laufzeitende', () => {
  assert.equal(naechsteAbbuchung(zeile()), '2026-09-01')
  assert.equal(naechsteAbbuchung(zeile({ status: 'zahlung_offen' })), '2026-09-01')
})

test('naechsteAbbuchung: bei beendeten Verträgen keine', () => {
  // Eine angezeigte nächste Abbuchung bei gekündigtem Vertrag ist der
  // klassische Auslöser für Beschwerden und Rückbuchungen.
  for (const status of ['gekuendigt', 'widerrufen', 'abgelaufen'] as BestellStatus[]) {
    assert.equal(naechsteAbbuchung(zeile({ status })), null, status)
  }
})

test('naechsteAbbuchung: ohne Laufzeitende keine', () => {
  assert.equal(naechsteAbbuchung(zeile({ laufzeit_bis: null })), null)
})
