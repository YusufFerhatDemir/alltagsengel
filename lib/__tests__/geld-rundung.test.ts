// ═══════════════════════════════════════════════════════════════
// Geldrundung — Regressionssuite fuer ALLE Geldkonverter
// ═══════════════════════════════════════════════════════════════
//
// Ausloeser: euroZuCent(1.005) ergab 100 Cent statt 101. Ursache war
// `Math.round(betrag * 100)` — 1.005 * 100 ist in IEEE-754
// 100.49999999999999. Dieselbe Zeile stand in acht Modulen.
//
// Diese Suite prueft nicht nur den zentralen Konverter, sondern jeden
// Aufrufer, der frueher eine eigene Kopie der Rundung hielt. Sonst
// wandert die Kopie beim naechsten Modul wieder ein.
//
// Alle Betraege hier sind TESTWERTE, keine Tarife.
// ═══════════════════════════════════════════════════════════════

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
  euroZuCent,
  centZuEuro,
  aufCent,
  rundeAufStellen,
  dezimalVerschieben,
  formatCentDe,
} from '../geld'
import { euroZuCent as euroZuCentEngine } from '../abrechnung/kassenabrechnung-engine'
import { parseBetragZuCent } from '../admin/betrag'
import { euroToCent } from '../admin/ops'
import { aufCent as aufCentVpKzp } from '../billing/vpkzp/berechnung'

/**
 * Die vom Auftrag geforderten Faelle plus die Werte, an denen die alte
 * Implementierung nachweislich falsch lag.
 * [Euro, erwartete Cent]
 */
const GELDFAELLE: [number, number][] = [
  [1.005, 101],      // ← der Bug: 1.005 * 100 = 100.49999999999999
  [2.675, 268],
  [0.005, 1],
  [10.005, 1001],
  [999.995, 100000],
  [1234.56, 123456],
  [0, 0],
]

// ───────────────────────────────────────────────────────────────
describe('euroZuCent — geforderte Testfaelle', () => {
  for (const [euro, cent] of GELDFAELLE) {
    test(`${euro} € → ${cent} Cent`, () => {
      assert.equal(euroZuCent(euro), cent)
    })
  }

  test('1,005 € ergibt 101 Cent — nicht 100 wie mit Math.round(x * 100)', () => {
    assert.equal(Math.round(1.005 * 100), 100)          // alte Implementierung
    assert.equal(euroZuCent(1.005), 101)                 // neue Implementierung
  })

  test('Number.EPSILON haette den Bug NICHT behoben', () => {
    // Festgehalten, damit niemand die Rundung auf den EPSILON-Trick
    // zurueckdreht: EPSILON ist der Double-Abstand bei 1.0, bei 100.5
    // ist er 64-mal groesser — der Summand verpufft.
    assert.equal(Math.round(1.005 * 100 + Number.EPSILON), 100)
  })
})

// ───────────────────────────────────────────────────────────────
describe('euroZuCent — negative Betraege (Gutschrift, Storno)', () => {
  test('Vorzeichen bleibt erhalten', () => {
    assert.equal(euroZuCent(-43.5), -4350)
    assert.equal(euroZuCent(-1234.56), -123456)
  })

  test('kaufmaennisch symmetrisch: -1,005 € ist betragsgleich zu 1,005 €', () => {
    // Math.round(-100.5) waere -100 gewesen — eine Gutschrift haette
    // dann einen anderen Betrag getragen als die Rechnung dazu.
    assert.equal(euroZuCent(-1.005), -101)
    assert.equal(euroZuCent(-1.005), -euroZuCent(1.005))
    for (const [euro, cent] of GELDFAELLE) {
      // `|| 0` normalisiert das -0, das `-cent` bei cent === 0 liefert.
      assert.equal(euroZuCent(-euro), -cent || 0, `${euro} nicht symmetrisch`)
    }
  })

  test('kein negatives Null in einer Cent-Spalte', () => {
    assert.equal(Object.is(euroZuCent(-0.001), 0), true)
    assert.equal(Object.is(euroZuCent(-0), 0), true)
  })
})

// ───────────────────────────────────────────────────────────────
describe('euroZuCent — Grenzwerte und Fehleingaben', () => {
  test('null, undefined und Leerstring zaehlen als 0 — nie NaN', () => {
    assert.equal(euroZuCent(null), 0)
    assert.equal(euroZuCent(undefined), 0)
    assert.equal(euroZuCent(''), 0)
  })

  test('PostgREST liefert NUMERIC teils als Zeichenkette', () => {
    assert.equal(euroZuCent('43.50'), 4350)
    assert.equal(euroZuCent('1.005'), 101)
    assert.equal(euroZuCent(' 12.34 '), 1234)
  })

  test('Nicht-Numerisches wirft, statt still NaN in eine Cent-Spalte zu tragen', () => {
    assert.throws(() => euroZuCent('abc'), TypeError)
    assert.throws(() => euroZuCent(NaN), TypeError)
    assert.throws(() => euroZuCent(Infinity), TypeError)
    assert.throws(() => euroZuCent(-Infinity), TypeError)
  })

  test('Float-Artefakte werden weggerundet', () => {
    assert.equal(euroZuCent(19.99), 1999)          // 1998.9999999999998
    assert.equal(euroZuCent(0.07), 7)              // 7.000000000000001
    assert.equal(euroZuCent(0.1 + 0.2), 30)        // 0.30000000000000004
    assert.equal(euroZuCent(999.999), 100000)
  })

  test('Ergebnis ist immer ganzzahlig', () => {
    for (const e of [0.001, 12.3456, 999.999, 7.005, 1.005, 0.004, -8.335]) {
      assert.ok(Number.isInteger(euroZuCent(e)), `${e} ergab keinen Integer`)
    }
  })

  test('Rundung geht zur naechsten ganzen Cent-Zahl', () => {
    assert.equal(euroZuCent(0.004), 0)
    assert.equal(euroZuCent(0.005), 1)
    assert.equal(euroZuCent(0.006), 1)
  })

  test('grosse Betraege bleiben exakt', () => {
    assert.equal(euroZuCent(1_000_000), 100_000_000)
    assert.equal(euroZuCent(99_999_999.99), 9_999_999_999)
  })

  test('Summen driften nicht', () => {
    const rechnungen = [43.5, 70, 0.01]
    assert.equal(rechnungen.reduce((s, e) => s + euroZuCent(e), 0), 11351)
    // 100 x 0,01 € muss glatt 100 Cent ergeben — in Euro addiert waere es
    // 1.0000000000000007.
    assert.equal(Array.from({ length: 100 }, () => euroZuCent(0.01)).reduce((a, b) => a + b, 0), 100)
  })
})

// ───────────────────────────────────────────────────────────────
describe('centZuEuro', () => {
  test('Umkehrung von euroZuCent fuer alle geforderten Faelle', () => {
    for (const [, cent] of GELDFAELLE) {
      assert.equal(euroZuCent(centZuEuro(cent)), cent)
    }
  })

  test('kein Float-Rest: 4335 Cent sind 43,35 € (nicht 43.349999999999994)', () => {
    assert.equal(centZuEuro(4335), 43.35)
    assert.equal(String(centZuEuro(4335)), '43.35')
  })

  test('Null, negative Betraege und Zeichenketten', () => {
    assert.equal(centZuEuro(0), 0)
    assert.equal(centZuEuro(null), 0)
    assert.equal(centZuEuro(undefined), 0)
    assert.equal(centZuEuro(-4350), -43.5)
    assert.equal(centZuEuro('10500'), 105)
  })

  test('Nicht-Numerisches wirft', () => {
    assert.throws(() => centZuEuro('abc'), TypeError)
  })
})

// ───────────────────────────────────────────────────────────────
describe('aufCent — Euro-Zwischenergebnisse', () => {
  test('geforderte Testfaelle in Euro', () => {
    for (const [euro, cent] of GELDFAELLE) {
      assert.equal(aufCent(euro), cent / 100)
    }
  })

  test('1,005 € rundet auf 1,01 € auf', () => {
    assert.equal(aufCent(1.005), 1.01)
    assert.equal(aufCent(-1.005), -1.01)
  })

  test('idempotent — zweimal runden aendert nichts', () => {
    for (const e of [1.005, 2.675, 999.995, 0, -10.005]) {
      assert.equal(aufCent(aufCent(e)), aufCent(e))
    }
  })

  test('Grenzwerte', () => {
    assert.equal(aufCent(0), 0)
    assert.equal(aufCent(null), 0)
    assert.equal(aufCent(undefined), 0)
    assert.throws(() => aufCent(NaN), TypeError)
  })
})

// ───────────────────────────────────────────────────────────────
describe('rundeAufStellen / dezimalVerschieben', () => {
  test('verschiebt das Komma exakt, nicht per Multiplikation', () => {
    assert.equal(dezimalVerschieben(1.005, 2), 100.5)
    assert.notEqual(1.005 * 100, 100.5)
    assert.equal(dezimalVerschieben(4350, -2), 43.5)
  })

  test('Exponentialschreibweise laeuft nicht in NaN', () => {
    // String(1e21) ist "1e+21" — naives Anhaengen von "e2" ergaebe NaN.
    assert.equal(Number.isFinite(dezimalVerschieben(1e21, 2)), true)
    assert.equal(dezimalVerschieben(1e21, 2), 1e23)
    assert.equal(dezimalVerschieben(1.5e-7, 2), 1.5e-5)
  })

  test('beliebige Nachkommastellen, kaufmaennisch', () => {
    assert.equal(rundeAufStellen(1.2345, 2), 1.23)
    assert.equal(rundeAufStellen(1.005, 2), 1.01)
    assert.equal(rundeAufStellen(-1.005, 2), -1.01)
    assert.equal(rundeAufStellen(66.6666, 0), 67)
    assert.equal(rundeAufStellen(0, 2), 0)
  })
})

// ───────────────────────────────────────────────────────────────
describe('formatCentDe', () => {
  test('deutsche Waehrungsdarstellung', () => {
    assert.match(formatCentDe(10500), /^105,00\s?€$/)
    assert.match(formatCentDe(0), /^0,00\s?€$/)
    assert.match(formatCentDe(101), /^1,01\s?€$/)
    assert.match(formatCentDe(-4350), /^-43,50\s?€$/)
  })
})

// ───────────────────────────────────────────────────────────────
// Aufrufer, die frueher eine eigene Kopie der Rundung hielten
// ───────────────────────────────────────────────────────────────
describe('Aufrufer benutzen dieselbe Rundung', () => {
  test('kassenabrechnung-engine.euroZuCent', () => {
    assert.equal(euroZuCentEngine, euroZuCent)
    for (const [euro, cent] of GELDFAELLE) {
      assert.equal(euroZuCentEngine(euro), cent)
    }
    // Der belegte Live-Fall: total_amount=43.50 ↔ soll_betrag_cent=4350.
    assert.equal(euroZuCentEngine(43.5), 4350)
    assert.equal(euroZuCentEngine(null), 0)
  })

  test('vpkzp/berechnung.aufCent', () => {
    assert.equal(aufCentVpKzp, aufCent)
    assert.equal(aufCentVpKzp(1.005), 1.01)
    assert.equal(aufCentVpKzp(1612.0), 1612)
  })

  test('admin/betrag.parseBetragZuCent — deutsche Eingaben', () => {
    assert.equal(parseBetragZuCent('1,005'), 101)
    assert.equal(parseBetragZuCent('1.005,00'), 100500)
    assert.equal(parseBetragZuCent('105,00 €'), 10500)
    assert.equal(parseBetragZuCent('1234.56'), 123456)
    assert.equal(parseBetragZuCent('0'), 0)
    assert.equal(parseBetragZuCent('-43,50'), -4350)
    assert.ok(Number.isNaN(parseBetragZuCent('abc')))
    assert.ok(Number.isNaN(parseBetragZuCent('')))
  })

  test('admin/ops.euroToCent', () => {
    assert.equal(euroToCent(1.005), 101)
    assert.equal(euroToCent('1,005'), 101)
    assert.equal(euroToCent(1234.56), 123456)
    assert.equal(euroToCent(0), 0)
    assert.equal(euroToCent(-10.005), -1001)
    assert.equal(euroToCent(null), null)
    assert.equal(euroToCent(''), null)
    assert.equal(euroToCent('abc'), null)
  })
})
