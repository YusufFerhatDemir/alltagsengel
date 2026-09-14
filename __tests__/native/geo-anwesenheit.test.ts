/**
 * Anwesenheitsnachweis — ein Haekchen, das nichts belegt
 * ═══════════════════════════════════════════════════════════════════════
 *
 * BEFUND (Block 54, 14.09.2026)
 *
 * `POST /api/native/geo-events` speichert den Standort einer Pflegekraft
 * und gleicht ihn gegen den genehmigten Einsatzort ab. Zwei Luecken:
 *
 *   1. Der Lesefehler der Ortsabfrage wurde VERWORFEN. Faellt sie aus,
 *      ist `location` null und der Radius wird nicht geprueft — „kein Ort
 *      hinterlegt" und „konnte nicht nachsehen" sahen identisch aus.
 *
 *   2. Fuer `within_radius === false` gab es einen Pruefeintrag fuers
 *      Buero, fuer `null` NICHTS. Dabei ist `null` heute der Normalfall:
 *      `approved_locations` ist live LEER (0 Zeilen bei 4 Klienten).
 *      Jeder Check-in waere als unpruefbar gespeichert worden, ohne dass
 *      im Buero je etwas aufgeschlagen waere.
 *
 * Der Nachweis sah damit aus wie einer und war keiner.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const ROUTE = readFileSync('app/api/native/geo-events/route.ts', 'utf8')

describe('der Lesefehler wird nicht mehr verworfen', () => {
  it('die Ortsabfrage nimmt den Fehler entgegen', () => {
    expect(ROUTE).toContain('const { data: location, error: ortFehler }')
  })

  it('und bricht fail-closed ab, statt ungeprueft zu speichern', () => {
    const ab = ROUTE.indexOf('if (ortFehler)')
    expect(ab).toBeGreaterThan(-1)
    const block = ROUTE.slice(ab, ab + 600)
    expect(block).toContain('503')
    expect(block).toContain('es wurde nichts gespeichert')
  })

  it('der Abbruch steht VOR dem Schreiben des Ereignisses', () => {
    // Sonst laege der Nachweis schon in der Tabelle, wenn der Abbruch kommt.
    expect(ROUTE.indexOf('if (ortFehler)'))
      .toBeLessThan(ROUTE.indexOf(".from('geo_events')"))
  })
})

describe('„kein genehmigter Ort" wird sichtbar', () => {
  it('erzeugt einen Pruefeintrag fuers Buero', () => {
    const ab = ROUTE.indexOf('if (withinRadius === null)')
    expect(ab).toBeGreaterThan(-1)
    expect(ROUTE.slice(ab, ab + 900)).toContain("from('review_errors')")
  })

  it('mit zulaessigem error_type und severity', () => {
    // review_errors traegt CHECKs: error_type IN (…,'geo_mismatch',…) und
    // severity IN ('info','warning','critical'). Ein anderer Wert liesse
    // den Insert lautlos scheitern — genau die Form, die hier behoben wird.
    const ab = ROUTE.indexOf('if (withinRadius === null)')
    const block = ROUTE.slice(ab, ab + 900)
    expect(block).toContain("error_type: 'geo_mismatch'")
    expect(block).toContain("severity: 'info'")
  })

  it('sagt im Text, dass keine Anwesenheit belegt ist', () => {
    const ab = ROUTE.indexOf('if (withinRadius === null)')
    expect(ROUTE.slice(ab, ab + 900)).toContain('belegt aber keine')
  })

  it('der Pruefeintrag laesst den Aufrufer nicht scheitern', () => {
    // Das Ereignis ist bereits gespeichert; ein Wurf hier wuerde die App
    // in einen Wiederholungslauf schicken und das Ereignis verdoppeln.
    const ab = ROUTE.indexOf('if (withinRadius === null)')
    expect(ROUTE.slice(ab, ab + 900)).toContain('log.errorWithException(')
  })

  it('der bestehende Fall „ausserhalb des Radius" bleibt unveraendert', () => {
    expect(ROUTE).toContain('if (withinRadius === false)')
    const ab = ROUTE.indexOf('if (withinRadius === false)')
    expect(ROUTE.slice(ab, ab + 700)).toContain("severity: 'warning'")
  })
})

describe('die Antwort unterscheidet geprueft und ungeprueft', () => {
  it('traegt einen Hinweis, wenn nicht abgeglichen werden konnte', () => {
    // Ein Haekchen fuer „im Radius" und dasselbe Haekchen fuer
    // „ungeprueft" waere eine Falschauskunft gegenueber der Pflegekraft.
    expect(ROUTE).toContain('hinweis: withinRadius === null')
  })

  it('und null, wenn abgeglichen wurde', () => {
    const ab = ROUTE.indexOf('hinweis: withinRadius === null')
    expect(ROUTE.slice(ab, ab + 400)).toContain(': null,')
  })
})
