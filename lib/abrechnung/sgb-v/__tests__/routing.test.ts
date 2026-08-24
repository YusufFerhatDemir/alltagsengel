// ═══════════════════════════════════════════════════════════════
// Welle 5a — § 302 SGB V Kostenträger-Routing Tests
// ═══════════════════════════════════════════════════════════════
//
// Reine Funktionen: istGueltigeIK, findeRouting.
// ladeRouting braucht Supabase → nicht getestet.
// ═══════════════════════════════════════════════════════════════

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
  istGueltigeIK,
  findeRouting,
  ROUTING_PROBLEM_TEXT,
  type SgbVRouting,
  type RoutingProblem,
} from '../routing'

// ---------------------------------------------------------------------------
// Testdaten-Helfer
// ---------------------------------------------------------------------------

function routing(overrides: Partial<SgbVRouting> = {}): SgbVRouting {
  return {
    id: 'r-1',
    kostentraeger_ik: '104593971',
    kostentraeger_name: 'AOK Baden-Württemberg',
    kassenart: 'AOK',
    datenannahmestelle_ik: '100000001',
    datenannahmestelle_name: 'BITMARCK',
    annahme_format: 'edifact_slga_slla',
    gueltig_von: '2024-01-01',
    gueltig_bis: null,
    quelle: 'Kassenverzeichnis 2024',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// istGueltigeIK
// ---------------------------------------------------------------------------

describe('istGueltigeIK', () => {
  test('9 Ziffern → gueltig', () => {
    assert.equal(istGueltigeIK('104593971'), true)
  })

  test('weniger als 9 Ziffern → ungueltig', () => {
    assert.equal(istGueltigeIK('12345'), false)
  })

  test('mehr als 9 Ziffern → ungueltig', () => {
    assert.equal(istGueltigeIK('1234567890'), false)
  })

  test('Buchstaben → ungueltig', () => {
    assert.equal(istGueltigeIK('12345678A'), false)
  })

  test('null → ungueltig', () => {
    assert.equal(istGueltigeIK(null), false)
  })

  test('undefined → ungueltig', () => {
    assert.equal(istGueltigeIK(undefined), false)
  })

  test('leerer String → ungueltig', () => {
    assert.equal(istGueltigeIK(''), false)
  })
})

// ---------------------------------------------------------------------------
// findeRouting
// ---------------------------------------------------------------------------

describe('findeRouting', () => {
  test('findet gültiges Routing', () => {
    const result = findeRouting([routing()], '104593971', '2026-08-01')
    assert.equal(result.ok, true)
    assert.equal(result.routing?.id, 'r-1')
    assert.equal(result.problem, null)
  })

  test('kein_eintrag bei unbekannter IK', () => {
    const result = findeRouting([routing()], '999999999', '2026-08-01')
    assert.equal(result.ok, false)
    assert.equal(result.problem, 'kein_eintrag')
  })

  test('kein_eintrag bei leerem Array', () => {
    const result = findeRouting([], '104593971', '2026-08-01')
    assert.equal(result.ok, false)
    assert.equal(result.problem, 'kein_eintrag')
  })

  test('nicht_gueltig bei abgelaufenem Routing', () => {
    const r = routing({ gueltig_von: '2020-01-01', gueltig_bis: '2025-12-31' })
    const result = findeRouting([r], '104593971', '2026-08-01')
    assert.equal(result.ok, false)
    assert.equal(result.problem, 'nicht_gueltig')
  })

  test('nicht_gueltig wenn Routing noch nicht begonnen', () => {
    const r = routing({ gueltig_von: '2027-01-01' })
    const result = findeRouting([r], '104593971', '2026-08-01')
    assert.equal(result.ok, false)
    assert.equal(result.problem, 'nicht_gueltig')
  })

  test('Routing ohne gueltig_von und gueltig_bis gilt immer', () => {
    const r = routing({ gueltig_von: null, gueltig_bis: null })
    const result = findeRouting([r], '104593971', '2026-08-01')
    assert.equal(result.ok, true)
  })

  test('annahmestelle_fehlt bei fehlender DAS-IK', () => {
    const r = routing({ datenannahmestelle_ik: null })
    const result = findeRouting([r], '104593971', '2026-08-01')
    assert.equal(result.ok, false)
    assert.equal(result.problem, 'annahmestelle_fehlt')
  })

  test('annahmestelle_fehlt bei ungueltigem DAS-IK-Format', () => {
    const r = routing({ datenannahmestelle_ik: '12345' })
    const result = findeRouting([r], '104593971', '2026-08-01')
    assert.equal(result.ok, false)
    assert.equal(result.problem, 'annahmestelle_fehlt')
  })

  test('format_fehlt bei fehlendem Annahmeformat', () => {
    const r = routing({ annahme_format: null })
    const result = findeRouting([r], '104593971', '2026-08-01')
    assert.equal(result.ok, false)
    assert.equal(result.problem, 'format_fehlt')
  })

  test('bei mehreren gueltigen Routings gewinnt das neuere', () => {
    const alt = routing({ id: 'r-alt', gueltig_von: '2020-01-01' })
    const neu = routing({ id: 'r-neu', gueltig_von: '2025-01-01' })
    const result = findeRouting([alt, neu], '104593971', '2026-08-01')
    assert.equal(result.ok, true)
    assert.equal(result.routing?.id, 'r-neu', 'Neueres gueltig_von gewinnt')
  })

  test('abgelaufenes Routing wird als Kontext zurueckgegeben', () => {
    const r = routing({ gueltig_bis: '2025-12-31' })
    const result = findeRouting([r], '104593971', '2026-08-01')
    assert.equal(result.ok, false)
    assert.notEqual(result.routing, null, 'Routing-Objekt fuer Fehlerkontext zurueckgeben')
  })
})

// ---------------------------------------------------------------------------
// ROUTING_PROBLEM_TEXT — Konsistenz
// ---------------------------------------------------------------------------

describe('ROUTING_PROBLEM_TEXT', () => {
  test('jeder Problemtyp hat einen nicht-leeren Text', () => {
    const typen: RoutingProblem[] = ['kein_eintrag', 'nicht_gueltig', 'annahmestelle_fehlt', 'format_fehlt']
    for (const typ of typen) {
      assert.ok(ROUTING_PROBLEM_TEXT[typ].length > 0, `Text fehlt für ${typ}`)
    }
  })
})
