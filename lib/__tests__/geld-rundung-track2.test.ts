// ═══════════════════════════════════════════════════════════════
// Geldrundung — Regressionssuite fuer die Reststellen (Track 2)
// ═══════════════════════════════════════════════════════════════
//
// lib/__tests__/geld-rundung.test.ts deckt den zentralen Konverter und
// die damals bereits umgestellten Aufrufer ab. Diese Datei deckt die
// Stellen ab, die dabei uebrig geblieben waren — jede von ihnen hatte
// eine eigene Kopie von `Math.round(x * 100)` bzw. `Math.round(cent)`:
//
//   lib/billing/camt/camt-parser.ts   Kontoauszug → Cent
//   lib/geld.ts (centRunden)          Cent-Zwischenergebnisse
//   lib/coach/rechnung.ts             Brutto → Netto + Steuer
//   lib/abrechnung/edifact-generator  Einzelpreis × Menge
//   lib/admin/betrag.ts               Betragsfelder der Oberflaeche
//                                     (Gutschrift-, Zahlungs- und
//                                     Zuordnungsdialog nutzen es jetzt)
//
// Zwei getrennte Fehlerbilder werden geprueft:
//
//   1. Der EURO→CENT-Fehler: `1.005 * 100` ist in IEEE-754
//      100.49999999999999 und faellt auf 100 statt auf 101.
//   2. Die ASYMMETRIE: `Math.round(-100.5)` ist -100, `Math.round(100.5)`
//      ist 101. Eine Gutschrift ueber -1,005 € war damit einen Cent
//      kleiner als die Rechnung, die sie ausgleichen soll.
//
// Alle Betraege hier sind TESTWERTE, keine Tarife und keine echten
// Geschaeftsvorfaelle.
// ═══════════════════════════════════════════════════════════════

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { centRunden, euroZuCent, aufCent } from '../geld'
import { parseBetragZuCent } from '../admin/betrag'
import { parseCamtXml } from '../billing/camt/camt-parser'
import { zerlegeBrutto } from '../coach/rechnung'
import { leistungsBetragCent } from '../abrechnung/edifact-generator'

/** [Euro, erwartete Cent] — die vom Auftrag geforderten Grenzfaelle. */
const HALBE_CENT: [number, number][] = [
  [1.005, 101],
  [2.675, 268],
  [10.005, 1001],
  [999.995, 100000],
  [0.005, 1],
  [-1.005, -101],
  [-2.675, -268],
  [-0.005, -1],
]

// ───────────────────────────────────────────────────────────────
// centRunden — der neue Konverter fuer Cent-Zwischenergebnisse
// ───────────────────────────────────────────────────────────────
describe('centRunden — symmetrisch, DIN 1333', () => {
  test('rundet den exakten halben Cent vom Nullpunkt weg', () => {
    assert.equal(centRunden(100.5), 101)
    assert.equal(centRunden(-100.5), -101)
    // Math.round tut genau das NICHT — der Grund fuer diesen Konverter.
    assert.equal(Math.round(-100.5), -100)
  })

  test('Gutschrift ist betragsgleich zur Rechnung', () => {
    for (let cent = -50; cent <= 50; cent++) {
      const wert = cent + 0.5
      assert.equal(
        centRunden(wert),
        -centRunden(-wert),
        `centRunden(${wert}) und centRunden(${-wert}) sind nicht betragsgleich`
      )
    }
  })

  test('ganze Cent bleiben unveraendert', () => {
    for (const c of [0, 1, -1, 4350, -4350, 123456789]) {
      assert.equal(centRunden(c), c)
    }
  })

  test('-0 wird zu 0 normalisiert — kein negativer Nullbetrag in der DB', () => {
    assert.equal(Object.is(centRunden(-0.2), 0), true)
  })

  test('leere Eingabe ist ein Nullbetrag, Muell wirft', () => {
    assert.equal(centRunden(null), 0)
    assert.equal(centRunden(''), 0)
    assert.throws(() => centRunden('keine Zahl'), TypeError)
  })
})

// ───────────────────────────────────────────────────────────────
// CAMT — Kontoauszug → Cent
// ───────────────────────────────────────────────────────────────

/** Minimaler camt.053 mit genau einer Buchung. Reine Testdatei. */
function camtMitBetrag(betrag: string, richtung: 'CRDT' | 'DBIT' = 'CRDT'): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">
  <BkToCstmrStmt>
    <Stmt>
      <CreDtTm>2026-01-15T09:00:00</CreDtTm>
      <Acct><Id><IBAN>DE00000000000000000000</IBAN></Id></Acct>
      <Ntry>
        <Amt Ccy="EUR">${betrag}</Amt>
        <CdtDbtInd>${richtung}</CdtDbtInd>
        <Sts>BOOK</Sts>
        <BookgDt><Dt>2026-01-15</Dt></BookgDt>
        <NtryDtls><TxDtls>
          <RmtInf><Ustrd>Testbuchung</Ustrd></RmtInf>
        </TxDtls></NtryDtls>
      </Ntry>
    </Stmt>
  </BkToCstmrStmt>
</Document>`
}

function ersteBuchung(betrag: string, richtung: 'CRDT' | 'DBIT' = 'CRDT') {
  const ergebnis = parseCamtXml(camtMitBetrag(betrag, richtung))
  assert.deepEqual(ergebnis.fehler, [], `Parser meldete Fehler fuer "${betrag}"`)
  assert.equal(ergebnis.buchungen.length, 1)
  return ergebnis.buchungen[0]
}

describe('CAMT-Parser — Betrag in Cent', () => {
  for (const [euro, cent] of HALBE_CENT.filter(([e]) => e > 0)) {
    test(`Eingang ueber ${euro} → ${cent} Cent`, () => {
      assert.equal(ersteBuchung(String(euro)).betragCent, cent)
    })
  }

  test('1.005 ergibt 101 Cent — vorher 100 (Math.round(n * 100))', () => {
    assert.equal(Math.round(1.005 * 100), 100)
    assert.equal(ersteBuchung('1.005').betragCent, 101)
  })

  test('Ruecklastschrift (DBIT) ist betragsgleich zum Eingang', () => {
    const eingang = ersteBuchung('2.675', 'CRDT').betragCent
    const ausgang = ersteBuchung('2.675', 'DBIT').betragCent
    assert.equal(eingang, 268)
    assert.equal(ausgang, -268)
    assert.equal(eingang + ausgang, 0)
  })

  test('grosse Betraege bleiben exakt', () => {
    assert.equal(ersteBuchung('1234567.89').betragCent, 123456789)
  })

  test('deutsch formatierter Betrag wird abgewiesen, nicht stillschweigend gelesen', () => {
    const ergebnis = parseCamtXml(camtMitBetrag('1.234,56'))
    assert.equal(ergebnis.buchungen.length, 0)
    assert.equal(ergebnis.fehler.length, 1)
    assert.match(ergebnis.fehler[0], /ISO-20022-Betrag/)
  })
})

// ───────────────────────────────────────────────────────────────
// Betragsfelder der Oberflaeche
// (Gutschrift-, Zahlungs- und Zuordnungsdialog rufen dies jetzt auf)
// ───────────────────────────────────────────────────────────────
describe('parseBetragZuCent — Dialogeingaben', () => {
  for (const [euro, cent] of HALBE_CENT) {
    const eingabe = String(euro).replace('.', ',')
    test(`"${eingabe}" → ${cent} Cent`, () => {
      assert.equal(parseBetragZuCent(eingabe), cent)
    })
  }

  test('deutsche und englische Schreibweise ergeben denselben Betrag', () => {
    assert.equal(parseBetragZuCent('12,50'), 1250)
    // Regression: der eigene Parser im Gutschriften-Dialog strich Punkte
    // bedingungslos und las "12.50" als 1250 € statt als 12,50 €.
    assert.equal(parseBetragZuCent('12.50'), 1250)
    assert.equal(parseBetragZuCent('1.234,56'), 123456)
    assert.equal(parseBetragZuCent('105,00 €'), 10500)
  })

  test('unlesbare Eingabe ergibt NaN statt einer stillen Zahl', () => {
    for (const muell of ['', '   ', 'abc', '1,2,3', '12,34,56', '1e3']) {
      assert.equal(Number.isNaN(parseBetragZuCent(muell)), true, `"${muell}"`)
    }
  })

  test('Waehrungszeichen INNERHALB der Zahl wird abgewiesen', () => {
    // Gefunden durch diese Suite: der Parser strich das € global, „12€34"
    // wurde zu „1234" und ergab 1234,00 € statt der gemeinten 12,34 € —
    // der hundertfache Betrag, ohne Warnung, direkt in einen
    // Gutschrift-, Zahlungs- oder Zuordnungsdialog.
    assert.equal(Number.isNaN(parseBetragZuCent('12€34')), true)
    // An den Raendern bleibt das € erlaubt — so kommt es aus der Zwischenablage.
    assert.equal(parseBetragZuCent('105,00 €'), 10500)
    assert.equal(parseBetragZuCent('€105,00'), 10500)
    // Leerraum als Tausendertrenner bleibt ebenfalls lesbar.
    assert.equal(parseBetragZuCent(' 1 234,56 '), 123456)
  })
})

// ───────────────────────────────────────────────────────────────
// PflegeCoach — Bruttozerlegung
// ───────────────────────────────────────────────────────────────
describe('zerlegeBrutto — Netto + Steuer ergeben wieder das Brutto', () => {
  test('Summe stimmt fuer jeden Cent-Betrag', () => {
    for (const brutto of [1, 99, 100, 101, 4350, 11900, 999999]) {
      const { nettoCent, steuerCent } = zerlegeBrutto(brutto, 19)
      assert.equal(nettoCent + steuerCent, brutto, `Brutto ${brutto}`)
    }
  })

  test('Gutschrift: negatives Brutto zerlegt sich betragsgleich', () => {
    const positiv = zerlegeBrutto(11900, 19)
    const negativ = zerlegeBrutto(-11900, 19)
    assert.equal(negativ.nettoCent, -positiv.nettoCent)
    assert.equal(negativ.steuerCent, -positiv.steuerCent)
    assert.equal(negativ.nettoCent + negativ.steuerCent, -11900)
  })

  test('ohne Steuersatz bleibt das Brutto unangetastet', () => {
    assert.deepEqual(zerlegeBrutto(4350, 0), { nettoCent: 4350, steuerCent: 0 })
  })
})

// ───────────────────────────────────────────────────────────────
// EDIFACT — Einzelpreis × Menge
// ───────────────────────────────────────────────────────────────
describe('EDIFACT — Leistungsbetrag', () => {
  /** Zeitbasierte Leistung mit frei gewaehlten Werten — kein echter Tarif. */
  function leistung(einzelpreis_cent: number, menge: number) {
    return {
      datum: '2026-01-15',
      leistungsart: 'alltagsbegleitung_45a',
      menge,
      einzelpreis_cent,
      pflegekraft_name: 'TT',
    }
  }

  test('halbe Cent runden vom Nullpunkt weg', () => {
    // 201 Cent x 0,5 = 100,5 Cent → 101, nicht 100.
    assert.equal(leistungsBetragCent(leistung(201, 0.5)), 101)
    assert.equal(Math.round(201 * 0.5), 101)
  })

  test('Storno: negativer Einzelpreis ist betragsgleich zur Leistung', () => {
    // Genau hier lag Math.round daneben: Math.round(-100.5) ist -100.
    assert.equal(Math.round(-201 * 0.5), -100)
    assert.equal(leistungsBetragCent(leistung(-201, 0.5)), -101)
    assert.equal(
      leistungsBetragCent(leistung(201, 0.5)) + leistungsBetragCent(leistung(-201, 0.5)),
      0
    )
  })

  test('ganze Mengen bleiben exakt', () => {
    assert.equal(leistungsBetragCent(leistung(3500, 2)), 7000)
    assert.equal(leistungsBetragCent(leistung(0, 5)), 0)
  })

  test('gebrochene Mengen (1,5 Stunden) runden kaufmaennisch', () => {
    assert.equal(leistungsBetragCent(leistung(3333, 1.5)), 5000)  // 4999,5
    assert.equal(leistungsBetragCent(leistung(-3333, 1.5)), -5000)
  })
})

// ───────────────────────────────────────────────────────────────
// Der frueher an mehreren Stellen genutzte EPSILON-Trick
// ───────────────────────────────────────────────────────────────
describe('Number.EPSILON war nie eine Loesung', () => {
  /** So stand die Rundung in budget-cap.ts und invoice-engine.ts. */
  const mitEpsilon = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100

  test('EPSILON trifft kleine Betraege zufaellig richtig', () => {
    // Das ist der Grund, warum der Trick so lange unauffaellig blieb.
    assert.equal(mitEpsilon(1.005), 1.01)
    assert.equal(mitEpsilon(2.675), 2.68)
  })

  test('… und verfehlt groessere — der Summand ist dort zu klein', () => {
    assert.equal(mitEpsilon(8.575), 8.57)   // falsch
    assert.equal(aufCent(8.575), 8.58)      // richtig
    assert.equal(euroZuCent(8.575), 858)
  })

  test('… und schiebt negative Betraege in die falsche Richtung', () => {
    assert.equal(mitEpsilon(-1.005), -1)          // falsch
    assert.equal(mitEpsilon(1.005), 1.01)         // Gegenstueck
    assert.notEqual(mitEpsilon(1.005) + mitEpsilon(-1.005), 0)

    assert.equal(aufCent(-1.005), -1.01)
    assert.equal(aufCent(1.005) + aufCent(-1.005), 0)
  })

  test('aufCent bleibt ueber die gesamte Halb-Cent-Reihe symmetrisch', () => {
    for (const euro of [1.005, 2.675, 8.575, 10.005, 16.235, 105.045, 999.995]) {
      assert.equal(
        euroZuCent(euro),
        -euroZuCent(-euro),
        `${euro} € ist nicht betragsgleich zu ${-euro} €`
      )
    }
  })
})
