// ═══════════════════════════════════════════════════════════════
// Welle 5e — Einzugsgebiet PLZ-Prüfung Tests
// ═══════════════════════════════════════════════════════════════
//
// Reine Funktion: pruefePlz + Konstanten KERN/RAND.
// ═══════════════════════════════════════════════════════════════

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { pruefePlz, KERN, RAND } from '../einzugsgebiet-plz'

// ---------------------------------------------------------------------------
// pruefePlz — Kerngebiet
// ---------------------------------------------------------------------------

describe('pruefePlz — Kerngebiet', () => {
  test('60311 (Frankfurt Innenstadt) → kern', () => {
    const r = pruefePlz('60311')
    assert.equal(r.zone, 'kern')
    assert.ok(r.region.includes('Frankfurt'))
  })

  test('60599 (Frankfurt Sachsenhausen) → kern', () => {
    assert.equal(pruefePlz('60599').zone, 'kern')
  })

  test('63065 (Offenbach) → kern', () => {
    const r = pruefePlz('63065')
    assert.equal(r.zone, 'kern')
    assert.ok(r.region.includes('Offenbach'))
  })

  test('61348 (Bad Homburg) → kern', () => {
    const r = pruefePlz('61348')
    assert.equal(r.zone, 'kern')
    assert.ok(r.region.includes('Homburg') || r.region.includes('Hochtaunus'))
  })

  test('65760 (Eschborn) → kern', () => {
    assert.equal(pruefePlz('65760').zone, 'kern')
  })
})

// ---------------------------------------------------------------------------
// pruefePlz — Randgebiet
// ---------------------------------------------------------------------------

describe('pruefePlz — Randgebiet', () => {
  test('65185 (Wiesbaden) → rand', () => {
    const r = pruefePlz('65185')
    assert.equal(r.zone, 'rand')
    assert.ok(r.region.includes('Wiesbaden'))
  })

  test('55116 (Mainz) → rand', () => {
    const r = pruefePlz('55116')
    assert.equal(r.zone, 'rand')
    assert.ok(r.region.includes('Mainz'))
  })
})

// ---------------------------------------------------------------------------
// pruefePlz — Außerhalb
// ---------------------------------------------------------------------------

describe('pruefePlz — Außerhalb', () => {
  test('80331 (München) → null', () => {
    const r = pruefePlz('80331')
    assert.equal(r.zone, null)
    assert.equal(r.region, '')
  })

  test('10115 (Berlin) → null', () => {
    assert.equal(pruefePlz('10115').zone, null)
  })

  test('20095 (Hamburg) → null', () => {
    assert.equal(pruefePlz('20095').zone, null)
  })
})

// ---------------------------------------------------------------------------
// pruefePlz — Präfix-Spezifitaet
// ---------------------------------------------------------------------------

describe('pruefePlz — Praefixspezifitaet', () => {
  test('spezifischerer Praefix gewinnt (6350x → Seligenstadt, nicht allg. 635)', () => {
    const r = pruefePlz('63500')
    assert.equal(r.zone, 'kern')
    assert.ok(r.region.includes('Seligenstadt'))
  })
})

// ---------------------------------------------------------------------------
// KERN / RAND — Konsistenz
// ---------------------------------------------------------------------------

describe('KERN/RAND Konsistenz', () => {
  test('keine doppelten Praefixe', () => {
    const alle = [...KERN.map(k => k.praefix), ...RAND.map(r => r.praefix)]
    const unique = new Set(alle)
    assert.equal(unique.size, alle.length, 'Doppelte Präfixe: ' + alle.filter((p, i) => alle.indexOf(p) !== i))
  })

  test('alle Praefixe sind numerisch', () => {
    for (const e of [...KERN, ...RAND]) {
      assert.ok(/^\d+$/.test(e.praefix), `Nicht-numerischer Präfix: ${e.praefix}`)
    }
  })

  test('alle Regionen sind nicht leer', () => {
    for (const e of [...KERN, ...RAND]) {
      assert.ok(e.region.length > 0, `Leere Region für Präfix ${e.praefix}`)
    }
  })
})
