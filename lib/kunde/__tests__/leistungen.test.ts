// ═══════════════════════════════════════════════════════════════
// Welle 5g — Kunden-Portal Labels & Formatierung Tests
// ═══════════════════════════════════════════════════════════════
//
// Reine Funktionen: budgetTypeLabel, serviceTypeLabel, fmtDuration.
// Konstanten: BUDGET_TYPE_LABEL, SERVICE_TYPE_LABEL, MONTH_NAMES.
// ═══════════════════════════════════════════════════════════════

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
  budgetTypeLabel,
  serviceTypeLabel,
  fmtDuration,
  BUDGET_TYPE_LABEL,
  BUDGET_TYPE_SHORT,
  BUDGET_TYPE_COLOR,
  SERVICE_TYPE_LABEL,
  MONTH_NAMES,
} from '../leistungen'

// ---------------------------------------------------------------------------
// budgetTypeLabel
// ---------------------------------------------------------------------------

describe('budgetTypeLabel', () => {
  test('entlastung → Entlastungsbetrag §45b SGB XI', () => {
    assert.equal(budgetTypeLabel('entlastung'), 'Entlastungsbetrag §45b SGB XI')
  })

  test('verhinderung → mit §39', () => {
    assert.ok(budgetTypeLabel('verhinderung').includes('§39'))
  })

  test('private → Privat', () => {
    assert.equal(budgetTypeLabel('private'), 'Privat')
  })

  test('unbekannter Typ → Durchreichung', () => {
    assert.equal(budgetTypeLabel('sonstwas'), 'sonstwas')
  })

  test('null → "—"', () => {
    assert.equal(budgetTypeLabel(null), '—')
  })

  test('undefined → "—"', () => {
    assert.equal(budgetTypeLabel(undefined), '—')
  })
})

// ---------------------------------------------------------------------------
// serviceTypeLabel
// ---------------------------------------------------------------------------

describe('serviceTypeLabel', () => {
  test('alltagsbegleitung → Alltagsbegleitung', () => {
    assert.equal(serviceTypeLabel('alltagsbegleitung'), 'Alltagsbegleitung')
  })

  test('hauswirtschaft → Hauswirtschaftliche Unterstützung', () => {
    assert.equal(serviceTypeLabel('hauswirtschaft'), 'Hauswirtschaftliche Unterstützung')
  })

  test('null → "Leistung"', () => {
    assert.equal(serviceTypeLabel(null), 'Leistung')
  })

  test('unbekannt → Durchreichung', () => {
    assert.equal(serviceTypeLabel('xyz'), 'xyz')
  })
})

// ---------------------------------------------------------------------------
// fmtDuration
// ---------------------------------------------------------------------------

describe('fmtDuration', () => {
  test('45 → "45 Min"', () => {
    assert.equal(fmtDuration(45), '45 Min')
  })

  test('60 → "1 Std"', () => {
    assert.equal(fmtDuration(60), '1 Std')
  })

  test('90 → "1 Std 30 Min"', () => {
    assert.equal(fmtDuration(90), '1 Std 30 Min')
  })

  test('120 → "2 Std"', () => {
    assert.equal(fmtDuration(120), '2 Std')
  })

  test('0 → "—"', () => {
    assert.equal(fmtDuration(0), '—')
  })

  test('null → "—"', () => {
    assert.equal(fmtDuration(null), '—')
  })

  test('undefined → "—"', () => {
    assert.equal(fmtDuration(undefined), '—')
  })

  test('negative Zahl → "—"', () => {
    assert.equal(fmtDuration(-10), '—')
  })
})

// ---------------------------------------------------------------------------
// Konstanten-Konsistenz
// ---------------------------------------------------------------------------

describe('Label-Konstanten', () => {
  test('BUDGET_TYPE_SHORT hat gleiche Keys wie BUDGET_TYPE_LABEL', () => {
    const labelKeys = Object.keys(BUDGET_TYPE_LABEL).sort()
    const shortKeys = Object.keys(BUDGET_TYPE_SHORT).sort()
    assert.deepEqual(shortKeys, labelKeys)
  })

  test('BUDGET_TYPE_COLOR hat gleiche Keys wie BUDGET_TYPE_LABEL', () => {
    const labelKeys = Object.keys(BUDGET_TYPE_LABEL).sort()
    const colorKeys = Object.keys(BUDGET_TYPE_COLOR).sort()
    assert.deepEqual(colorKeys, labelKeys)
  })

  test('alle Farben sind gültige Hex-Codes', () => {
    for (const [key, color] of Object.entries(BUDGET_TYPE_COLOR)) {
      assert.ok(/^#[0-9A-Fa-f]{6}$/.test(color), `Ungültige Farbe für ${key}: ${color}`)
    }
  })

  test('MONTH_NAMES hat 12 Einträge', () => {
    assert.equal(MONTH_NAMES.length, 12)
  })

  test('erster Monat ist Januar', () => {
    assert.equal(MONTH_NAMES[0], 'Januar')
  })

  test('letzter Monat ist Dezember', () => {
    assert.equal(MONTH_NAMES[11], 'Dezember')
  })

  test('SERVICE_TYPE_LABEL hat mindestens 5 Einträge', () => {
    assert.ok(Object.keys(SERVICE_TYPE_LABEL).length >= 5)
  })
})
