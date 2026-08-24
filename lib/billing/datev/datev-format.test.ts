import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generateDatevBuchungszeile } from './datev-format'
import type { DatevBuchungssatz } from './datev-format'

function satz(teil: Partial<DatevBuchungssatz>): DatevBuchungssatz {
  return {
    umsatz: 100,
    sollHaben: 'S',
    konto: '10000',
    gegenkonto: '8400',
    belegdatum: '2026-08-24',
    belegnummer: 'RE-1',
    buchungstext: 'Rechnung RE-1 Musterfrau',
    ...teil,
  } as DatevBuchungssatz
}

/** Zaehlt die Felder einer DATEV-Zeile anhand der Trenn-Semikola AUSSERHALB von Anfuehrungszeichen. */
function felderAnzahl(zeile: string): number {
  let inQuotes = false, n = 1
  for (let i = 0; i < zeile.length; i++) {
    const c = zeile[i]
    if (c === '"') { if (inQuotes && zeile[i + 1] === '"') { i++; continue } inQuotes = !inQuotes }
    else if (c === ';' && !inQuotes) n++
  }
  return n
}

// Regression: gekuerzt wurde NACH dem Verdoppeln. Ein Anfuehrungszeichen auf
// der Grenze 60 wurde mittendrin zerschnitten, das Feld endete vorzeitig und
// alles danach rutschte eine Spalte nach links.
test('ein Anfuehrungszeichen an der Kuerzungsgrenze zerschiesst die Zeile nicht', () => {
  const referenz = felderAnzahl(generateDatevBuchungszeile(satz({ buchungstext: 'harmlos' })))
  for (let pos = 55; pos <= 62; pos++) {
    const text = 'A'.repeat(pos) + '"' + 'B'.repeat(10)
    const zeile = generateDatevBuchungszeile(satz({ buchungstext: text }))
    assert.equal(felderAnzahl(zeile), referenz, `Spaltenzahl kippt bei Anfuehrungszeichen an Position ${pos}`)
  }
})

// Regression: kein Formel-Riegel. KOST1/KOST2 und Belegnummer tragen — anders
// als der Buchungstext — kein festes Praefix.
test('Felder, die mit einem Formelzeichen beginnen, werden entschaerft', () => {
  for (const boese of ['=HYPERLINK("http://x","a")', '+1+1', '-2+3', '@SUM(A1)']) {
    const zeile = generateDatevBuchungszeile(satz({ kost1: boese, belegnummer: boese }))
    assert.ok(!zeile.includes(`"${boese[0]}`), `Formelzeichen ${boese[0]} steht ungeschuetzt am Feldanfang`)
    assert.ok(zeile.includes(`"'${boese[0]}`), `Apostroph-Riegel fehlt fuer ${boese}`)
  }
})

test('unauffaellige Werte bleiben unveraendert', () => {
  const zeile = generateDatevBuchungszeile(satz({ buchungstext: 'Rechnung RE-1 Musterfrau' }))
  assert.ok(zeile.includes('"Rechnung RE-1 Musterfrau"'))
})
