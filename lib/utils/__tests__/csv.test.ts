// ═══════════════════════════════════════════════════════════════
// Welle 5b — CSV-Utility Tests (csvZelle, csvZeile)
// ═══════════════════════════════════════════════════════════════
//
// Sicherheitsrelevant: CSV-Injection-Schutz muss greifen, da Daten
// aus kundenseitigen Formularen stammen und in Excel geöffnet werden.
// ═══════════════════════════════════════════════════════════════

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { csvZelle, csvZeile } from '../csv'

// ---------------------------------------------------------------------------
// csvZelle — Einzelzelle
// ---------------------------------------------------------------------------

describe('csvZelle', () => {
  test('normaler String wird in Anführungszeichen gesetzt', () => {
    assert.equal(csvZelle('Hallo'), '"Hallo"')
  })

  test('Anführungszeichen werden verdoppelt', () => {
    assert.equal(csvZelle('Er sagte "Ja"'), '"Er sagte ""Ja"""')
  })

  test('null wird zu leerem String', () => {
    assert.equal(csvZelle(null), '')
  })

  test('undefined wird zu leerem String', () => {
    assert.equal(csvZelle(undefined), '')
  })

  test('Zahl wird zum String', () => {
    assert.equal(csvZelle(42), '"42"')
  })

  test('Objekt wird JSON-serialisiert', () => {
    assert.equal(csvZelle({ a: 1 }), '"{""a"":1}"')
  })

  // CSV-Injection-Schutz
  test('= wird mit Apostroph entschaerft', () => {
    assert.equal(csvZelle('=SUM(A1:A10)'), '"\'=SUM(A1:A10)"')
  })

  test('+ wird mit Apostroph entschaerft', () => {
    assert.equal(csvZelle('+cmd|/C calc'), `"'+cmd|/C calc"`)
  })

  test('- wird mit Apostroph entschaerft', () => {
    assert.equal(csvZelle('-evil'), '"\'-evil"')
  })

  test('@ wird mit Apostroph entschaerft', () => {
    assert.equal(csvZelle('@SUM(A1)'), '"\'@SUM(A1)"')
  })

  test('Normaler String mit = in der Mitte wird NICHT entschaerft', () => {
    assert.equal(csvZelle('a=b'), '"a=b"')
  })

  test('Semikolon im Wert bleibt erhalten (wird durch Quotes geschuetzt)', () => {
    assert.equal(csvZelle('A;B'), '"A;B"')
  })

  test('Zeilenumbruch bleibt erhalten (wird durch Quotes geschuetzt)', () => {
    assert.equal(csvZelle('Zeile1\nZeile2'), '"Zeile1\nZeile2"')
  })
})

// ---------------------------------------------------------------------------
// csvZeile — ganze Zeile
// ---------------------------------------------------------------------------

describe('csvZeile', () => {
  test('verbindet Zellen mit Semikolon', () => {
    assert.equal(csvZeile(['A', 'B', 'C']), '"A";"B";"C"')
  })

  test('leeres Array ergibt leeren String', () => {
    assert.equal(csvZeile([]), '')
  })

  test('null-Werte werden zu leeren Zellen', () => {
    assert.equal(csvZeile([null, 'X', undefined]), ';"X";')
  })

  test('gemischte Typen werden korrekt behandelt', () => {
    const zeile = csvZeile(['Name', 42, null, '=EVIL'])
    assert.equal(zeile, '"Name";"42";;"\'=EVIL"')
  })
})
