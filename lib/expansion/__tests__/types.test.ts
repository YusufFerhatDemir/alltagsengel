// ═══════════════════════════════════════════════════════════════
// Welle 5g — Expansion Types & Type Guards Tests
// ═══════════════════════════════════════════════════════════════
//
// Reine Funktionen: istBundeslandCode, istExpansionStatus, kassenHinweisText.
// Konstanten: BUNDESLAND_CODES, BUNDESLAND_NAMEN, EXPANSION_STATUS, etc.
// ═══════════════════════════════════════════════════════════════

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
  istBundeslandCode,
  istExpansionStatus,
  kassenHinweisText,
  BUNDESLAND_CODES,
  BUNDESLAND_NAMEN,
  BUNDESLAND_ISO,
  EXPANSION_STATUS,
  STATUS_META,
  UNABHAENGIGE_MODULE,
  KASSEN_MODULE,
  MODUL_LABELS,
  TEXT_KASSE_IM_VERFAHREN,
  TEXT_KASSE_ABGELEHNT,
  TEXT_PLZ_UNBEKANNT,
  TEXT_WARTELISTE,
  FALLBACK_STATE,
} from '../types'

// ---------------------------------------------------------------------------
// istBundeslandCode
// ---------------------------------------------------------------------------

describe('istBundeslandCode', () => {
  test('"hessen" → true', () => {
    assert.equal(istBundeslandCode('hessen'), true)
  })

  test('"bayern" → true', () => {
    assert.equal(istBundeslandCode('bayern'), true)
  })

  test('"nordrhein_westfalen" → true', () => {
    assert.equal(istBundeslandCode('nordrhein_westfalen'), true)
  })

  test('"Hessen" (Großbuchstabe) → false', () => {
    assert.equal(istBundeslandCode('Hessen'), false)
  })

  test('"atlantis" → false', () => {
    assert.equal(istBundeslandCode('atlantis'), false)
  })

  test('null → false', () => {
    assert.equal(istBundeslandCode(null), false)
  })

  test('42 (Zahl) → false', () => {
    assert.equal(istBundeslandCode(42), false)
  })
})

// ---------------------------------------------------------------------------
// istExpansionStatus
// ---------------------------------------------------------------------------

describe('istExpansionStatus', () => {
  test('"ANERKANNT" → true', () => {
    assert.equal(istExpansionStatus('ANERKANNT'), true)
  })

  test('"VORBEREITUNG" → true', () => {
    assert.equal(istExpansionStatus('VORBEREITUNG'), true)
  })

  test('"anerkannt" (lowercase) → false', () => {
    assert.equal(istExpansionStatus('anerkannt'), false)
  })

  test('"AKTIV" → false', () => {
    assert.equal(istExpansionStatus('AKTIV'), false)
  })
})

// ---------------------------------------------------------------------------
// kassenHinweisText
// ---------------------------------------------------------------------------

describe('kassenHinweisText', () => {
  test('ANERKANNT → Freischaltungs-Text', () => {
    assert.ok(kassenHinweisText('ANERKANNT').includes('freigeschaltet'))
  })

  test('ABGELEHNT → Ablehnungs-Text', () => {
    assert.equal(kassenHinweisText('ABGELEHNT'), TEXT_KASSE_ABGELEHNT)
  })

  test('VORBEREITUNG → Verfahrens-Text', () => {
    assert.equal(kassenHinweisText('VORBEREITUNG'), TEXT_KASSE_IM_VERFAHREN)
  })

  test('IN_PRUEFUNG → Verfahrens-Text', () => {
    assert.equal(kassenHinweisText('IN_PRUEFUNG'), TEXT_KASSE_IM_VERFAHREN)
  })

  test('ANTRAG_EINGEREICHT → Verfahrens-Text', () => {
    assert.equal(kassenHinweisText('ANTRAG_EINGEREICHT'), TEXT_KASSE_IM_VERFAHREN)
  })
})

// ---------------------------------------------------------------------------
// Konstanten-Vollständigkeit
// ---------------------------------------------------------------------------

describe('BUNDESLAND_CODES Vollständigkeit', () => {
  test('exakt 16 Bundesländer', () => {
    assert.equal(BUNDESLAND_CODES.length, 16)
  })

  test('jedes Bundesland hat einen Klartextnamen', () => {
    for (const code of BUNDESLAND_CODES) {
      assert.ok(BUNDESLAND_NAMEN[code], `Name fehlt für ${code}`)
      assert.ok(BUNDESLAND_NAMEN[code].length > 3, `Name zu kurz für ${code}`)
    }
  })

  test('jedes Bundesland hat einen ISO-Code', () => {
    for (const code of BUNDESLAND_CODES) {
      assert.ok(BUNDESLAND_ISO[code], `ISO fehlt für ${code}`)
      assert.ok(BUNDESLAND_ISO[code].startsWith('DE-'), `ISO muss mit DE- beginnen: ${code}`)
    }
  })
})

describe('EXPANSION_STATUS', () => {
  test('5 Status definiert', () => {
    assert.equal(EXPANSION_STATUS.length, 5)
  })

  test('jeder Status hat Meta-Info', () => {
    for (const s of EXPANSION_STATUS) {
      assert.ok(STATUS_META[s], `Meta fehlt für ${s}`)
      assert.ok(STATUS_META[s].label.length > 0, `Label leer für ${s}`)
      assert.ok(STATUS_META[s].color.startsWith('#'), `Farbe ungültig für ${s}`)
    }
  })
})

describe('Modul-Labels', () => {
  test('alle unabhängigen Module haben Labels', () => {
    for (const m of UNABHAENGIGE_MODULE) {
      assert.ok(MODUL_LABELS[m], `Label fehlt für ${m}`)
    }
  })

  test('alle Kassen-Module haben Labels', () => {
    for (const m of KASSEN_MODULE) {
      assert.ok(MODUL_LABELS[m], `Label fehlt für ${m}`)
    }
  })
})

// ---------------------------------------------------------------------------
// FALLBACK_STATE — Compliance-Sicherheit
// ---------------------------------------------------------------------------

describe('FALLBACK_STATE (Compliance)', () => {
  test('insurance_enabled ist false (fail-safe)', () => {
    assert.equal(FALLBACK_STATE.insurance_enabled, false)
  })

  test('private_enabled ist false (fail-safe)', () => {
    assert.equal(FALLBACK_STATE.private_enabled, false)
  })

  test('marketing_enabled ist true (nur Werbung)', () => {
    assert.equal(FALLBACK_STATE.marketing_enabled, true)
  })

  test('waitinglist_enabled ist true', () => {
    assert.equal(FALLBACK_STATE.waitinglist_enabled, true)
  })

  test('status ist VORBEREITUNG', () => {
    assert.equal(FALLBACK_STATE.status, 'VORBEREITUNG')
  })
})

// ---------------------------------------------------------------------------
// UI-Texte — keine Zeitzusagen
// ---------------------------------------------------------------------------

describe('UI-Texte', () => {
  test('TEXT_KASSE_IM_VERFAHREN enthält KEINE Zeitzusage', () => {
    const verboten = ['Wochen', 'Tagen', 'demnächst', 'in Kürze']
    for (const w of verboten) {
      assert.ok(!TEXT_KASSE_IM_VERFAHREN.includes(w), `Zeitzusage gefunden: "${w}"`)
    }
  })

  test('TEXT_PLZ_UNBEKANNT fordert PLZ-Prüfung', () => {
    assert.ok(TEXT_PLZ_UNBEKANNT.includes('Postleitzahl'))
  })

  test('TEXT_WARTELISTE erwähnt Benachrichtigung', () => {
    assert.ok(TEXT_WARTELISTE.includes('benachrichtigen'))
  })
})
