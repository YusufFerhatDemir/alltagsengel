// ═══════════════════════════════════════════════════════════════
// Welle 5a — § 302 SGB V Versionsengine Tests
// ═══════════════════════════════════════════════════════════════
//
// Reine Funktionen: monatsStichtag, giltAm, loeseVersionAuf.
// ladeFormatVersionen und aktuelleVersion brauchen Supabase → nicht getestet.
// ═══════════════════════════════════════════════════════════════

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
  monatsStichtag,
  giltAm,
  loeseVersionAuf,
  SGB_V_FORMAT_LABELS,
  SGB_V_SPERRGRUND_TEXT,
  type SgbVFormatVersion,
  type SgbVFormat,
} from '../versionen'

// ---------------------------------------------------------------------------
// Testdaten-Helfer
// ---------------------------------------------------------------------------

function version(overrides: Partial<SgbVFormatVersion> = {}): SgbVFormatVersion {
  return {
    id: 'fv-1',
    bezeichnung: 'SLGA/SLLA v21',
    format: 'edifact_slga_slla',
    ta_version: '21',
    gueltig_von: '2024-01-01',
    gueltig_bis: null,
    spec_bestaetigt: true,
    spec_quelle: 'TA 1 Version 21',
    hinweis: null,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// monatsStichtag
// ---------------------------------------------------------------------------

describe('monatsStichtag', () => {
  test('erzeugt korrekten Stichtag', () => {
    assert.equal(monatsStichtag('2026-08'), '2026-08-01')
    assert.equal(monatsStichtag('2027-02'), '2027-02-01')
  })

  test('wirft bei ungueltigem Format', () => {
    assert.throws(() => monatsStichtag('2026'), /JJJJ-MM/)
    assert.throws(() => monatsStichtag('08-2026'), /JJJJ-MM/)
    assert.throws(() => monatsStichtag('2026/08'), /JJJJ-MM/)
    assert.throws(() => monatsStichtag('2026-08-15'), /JJJJ-MM/)
  })
})

// ---------------------------------------------------------------------------
// giltAm
// ---------------------------------------------------------------------------

describe('giltAm', () => {
  test('Version ohne Ende gilt immer nach gueltig_von', () => {
    assert.equal(giltAm(version({ gueltig_von: '2024-01-01', gueltig_bis: null }), '2026-06-15'), true)
  })

  test('Version gilt genau am Starttag', () => {
    assert.equal(giltAm(version({ gueltig_von: '2026-01-01' }), '2026-01-01'), true)
  })

  test('Version gilt nicht vor gueltig_von', () => {
    assert.equal(giltAm(version({ gueltig_von: '2026-01-01' }), '2025-12-31'), false)
  })

  test('Version gilt genau am letzten Tag', () => {
    assert.equal(giltAm(version({ gueltig_von: '2024-01-01', gueltig_bis: '2026-12-31' }), '2026-12-31'), true)
  })

  test('Version gilt nicht nach gueltig_bis', () => {
    assert.equal(giltAm(version({ gueltig_von: '2024-01-01', gueltig_bis: '2026-12-31' }), '2027-01-01'), false)
  })
})

// ---------------------------------------------------------------------------
// loeseVersionAuf
// ---------------------------------------------------------------------------

describe('loeseVersionAuf', () => {
  test('findet bestaetigte Version', () => {
    const result = loeseVersionAuf([version()], '2026-08', 'edifact_slga_slla')
    assert.equal(result.ok, true)
    assert.equal(result.version?.id, 'fv-1')
    assert.equal(result.sperrgrund, null)
  })

  test('keine_version_hinterlegt bei leerem Array', () => {
    const result = loeseVersionAuf([], '2026-08', 'edifact_slga_slla')
    assert.equal(result.ok, false)
    assert.equal(result.sperrgrund, 'keine_version_hinterlegt')
  })

  test('keine_version_hinterlegt wenn nur anderes Format vorhanden', () => {
    const result = loeseVersionAuf([version({ format: 'xml_hkp' })], '2026-08', 'edifact_slga_slla')
    assert.equal(result.ok, false)
    assert.equal(result.sperrgrund, 'keine_version_hinterlegt')
  })

  test('keine_version_gueltig wenn Version abgelaufen', () => {
    const v = version({ gueltig_von: '2020-01-01', gueltig_bis: '2025-12-31' })
    const result = loeseVersionAuf([v], '2026-08', 'edifact_slga_slla')
    assert.equal(result.ok, false)
    assert.equal(result.sperrgrund, 'keine_version_gueltig')
  })

  test('keine_version_gueltig wenn Version noch nicht begonnen', () => {
    const v = version({ gueltig_von: '2027-02-01' })
    const result = loeseVersionAuf([v], '2026-08', 'edifact_slga_slla')
    assert.equal(result.ok, false)
    assert.equal(result.sperrgrund, 'keine_version_gueltig')
  })

  test('spec_nicht_bestaetigt bei unbestaetigter Version', () => {
    const v = version({ spec_bestaetigt: false })
    const result = loeseVersionAuf([v], '2026-08', 'edifact_slga_slla')
    assert.equal(result.ok, false)
    assert.equal(result.sperrgrund, 'spec_nicht_bestaetigt')
    assert.equal(result.version?.id, 'fv-1', 'Version ist trotzdem als Kandidat sichtbar')
  })

  test('bei mehreren gueltigen Versionen gewinnt die neuere', () => {
    const alt = version({ id: 'alt', gueltig_von: '2020-01-01', ta_version: '20' })
    const neu = version({ id: 'neu', gueltig_von: '2024-01-01', ta_version: '21' })
    const result = loeseVersionAuf([alt, neu], '2026-08', 'edifact_slga_slla')
    assert.equal(result.ok, true)
    assert.equal(result.version?.id, 'neu', 'Neuere gueltig_von gewinnt')
  })

  test('unbestaetigte Version wird uebersprungen, bestaetigte gewinnt', () => {
    const unbestaetigt = version({ id: 'v22', gueltig_von: '2026-01-01', spec_bestaetigt: false })
    const bestaetigt = version({ id: 'v21', gueltig_von: '2024-01-01', spec_bestaetigt: true })
    const result = loeseVersionAuf([unbestaetigt, bestaetigt], '2026-08', 'edifact_slga_slla')
    assert.equal(result.ok, true)
    assert.equal(result.version?.id, 'v21', 'Bestätigte v21 gewinnt über unbestätigte v22')
    assert.equal(result.kandidaten.length, 2, 'Beide sind Kandidaten')
  })

  test('kandidaten enthalten nur gueltige Versionen des richtigen Formats', () => {
    const abgelaufen = version({ id: 'v-alt', gueltig_bis: '2020-12-31' })
    const andererTyp = version({ id: 'v-xml', format: 'xml_hkp' })
    const gueltig = version({ id: 'v-ok' })
    const result = loeseVersionAuf([abgelaufen, andererTyp, gueltig], '2026-08', 'edifact_slga_slla')
    assert.equal(result.kandidaten.length, 1)
    assert.equal(result.kandidaten[0].id, 'v-ok')
  })
})

// ---------------------------------------------------------------------------
// Konstanten — Konsistenz
// ---------------------------------------------------------------------------

describe('SGB_V-Konstanten', () => {
  test('jedes Format hat ein Label', () => {
    const formate: SgbVFormat[] = ['edifact_slga_slla', 'xml_hkp']
    for (const f of formate) {
      assert.ok(SGB_V_FORMAT_LABELS[f].length > 0, `Label fehlt für ${f}`)
    }
  })

  test('jeder Sperrgrund hat einen Text', () => {
    const gruende = ['keine_version_hinterlegt', 'keine_version_gueltig', 'spec_nicht_bestaetigt'] as const
    for (const g of gruende) {
      assert.ok(SGB_V_SPERRGRUND_TEXT[g].length > 0, `Text fehlt für ${g}`)
    }
  })
})
