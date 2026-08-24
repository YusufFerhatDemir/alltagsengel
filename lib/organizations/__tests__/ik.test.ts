// ═══════════════════════════════════════════════════════════════
// Welle 5e — IK-Nummer Validierung Tests
// ═══════════════════════════════════════════════════════════════
//
// Reine Funktion: validateIkNummer — Luhn-Prüfziffer nach § 293 SGB V.
// ═══════════════════════════════════════════════════════════════

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { validateIkNummer } from '../ik'

describe('validateIkNummer', () => {
  // ─ Gültige IKs ─
  test('Alltagsengel IK 460629986 ist gueltig', () => {
    const r = validateIkNummer('460629986')
    assert.equal(r.valid, true)
    assert.equal(r.error, undefined)
  })

  test('AOK Baden-Württemberg 104593971', () => {
    // Stellen 3-8: 459397, Gewichte 2,1,2,1,2,1
    // 4·2=8, 5·1=5, 9·2=18→9, 3·1=3, 9·2=18→9, 7·1=7 → 8+5+9+3+9+7=41 → 41%10=1 ✓
    assert.equal(validateIkNummer('104593971').valid, true)
  })

  test('IK mit Leerzeichen wird bereinigt', () => {
    assert.equal(validateIkNummer('460 629 986').valid, true)
  })

  // ─ Ungültige IKs ─
  test('zu kurz → ungueltig', () => {
    const r = validateIkNummer('12345')
    assert.equal(r.valid, false)
    assert.ok(r.error!.includes('9 Ziffern'))
  })

  test('zu lang → ungueltig', () => {
    assert.equal(validateIkNummer('1234567890').valid, false)
  })

  test('Buchstaben → ungueltig', () => {
    assert.equal(validateIkNummer('12345678A').valid, false)
  })

  test('leerer String → ungueltig', () => {
    assert.equal(validateIkNummer('').valid, false)
  })

  test('falsche Pruefziffer → ungueltig mit Hinweis', () => {
    const r = validateIkNummer('460629985') // Letzte Ziffer falsch
    assert.equal(r.valid, false)
    assert.ok(r.error!.includes('Prüfziffer'))
  })

  test('nur Nullen → formale Pruefung (000000000)', () => {
    // Stellen 3-8: 000000, Summe=0, Prüfziffer=0
    assert.equal(validateIkNummer('000000000').valid, true)
  })
})
