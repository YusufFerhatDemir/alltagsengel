// ═══════════════════════════════════════════════════════════════
// Welle 5g — Geo-Hilfsfunktionen Tests
// ═══════════════════════════════════════════════════════════════
//
// Reine Funktionen aus lib/geo.ts + lib/geocoding.ts:
// haversineDistanceMeters, checkWithinRadius, haversineDistance, extractPLZ.
// ═══════════════════════════════════════════════════════════════

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { haversineDistanceMeters, checkWithinRadius } from '../geo'
import { haversineDistance, extractPLZ } from '../geocoding'

// ---------------------------------------------------------------------------
// haversineDistanceMeters (lib/geo.ts)
// ---------------------------------------------------------------------------

describe('haversineDistanceMeters', () => {
  test('gleicher Punkt → 0', () => {
    assert.equal(haversineDistanceMeters(50.11, 8.68, 50.11, 8.68), 0)
  })

  test('Frankfurt → Offenbach ≈ 5-7 km', () => {
    const m = haversineDistanceMeters(50.1109, 8.6821, 50.0956, 8.7761)
    assert.ok(m > 5000 && m < 8000, `Erwartet 5-8 km, bekommen ${(m / 1000).toFixed(1)} km`)
  })

  test('Frankfurt → München ≈ 300-310 km', () => {
    const m = haversineDistanceMeters(50.1109, 8.6821, 48.1351, 11.5820)
    const km = m / 1000
    assert.ok(km > 290 && km < 320, `Erwartet ~305 km, bekommen ${km.toFixed(0)} km`)
  })

  test('Symmetrie: A→B = B→A', () => {
    const ab = haversineDistanceMeters(50.11, 8.68, 48.14, 11.58)
    const ba = haversineDistanceMeters(48.14, 11.58, 50.11, 8.68)
    assert.ok(Math.abs(ab - ba) < 0.01, 'Asymmetrie erkannt')
  })
})

// ---------------------------------------------------------------------------
// haversineDistance (lib/geocoding.ts, km)
// ---------------------------------------------------------------------------

describe('haversineDistance (km)', () => {
  test('gleicher Punkt → 0', () => {
    assert.equal(haversineDistance(50.11, 8.68, 50.11, 8.68), 0)
  })

  test('Frankfurt → Offenbach ≈ 5-8 km', () => {
    const km = haversineDistance(50.1109, 8.6821, 50.0956, 8.7761)
    assert.ok(km > 5 && km < 8, `Erwartet 5-8 km, bekommen ${km.toFixed(1)} km`)
  })

  test('Konsistenz mit Meter-Version (Abweichung < 10m)', () => {
    const km = haversineDistance(50.11, 8.68, 48.14, 11.58)
    const m = haversineDistanceMeters(50.11, 8.68, 48.14, 11.58)
    assert.ok(Math.abs(km * 1000 - m) < 10, 'Meter/km Inkonsistenz')
  })
})

// ---------------------------------------------------------------------------
// checkWithinRadius
// ---------------------------------------------------------------------------

describe('checkWithinRadius', () => {
  test('identischer Punkt → within', () => {
    const r = checkWithinRadius(50.11, 8.68, 50.11, 8.68)
    assert.equal(r.withinRadius, true)
    assert.equal(r.distanceM, 0)
  })

  test('100m Entfernung bei 150m Radius → within', () => {
    // ~100m nördlich: 0.0009° ≈ 100m
    const r = checkWithinRadius(50.1109, 8.6821, 50.1100, 8.6821, 150)
    assert.equal(r.withinRadius, true)
  })

  test('5 km Entfernung bei 150m Radius → nicht within', () => {
    const r = checkWithinRadius(50.11, 8.68, 50.06, 8.68, 150)
    assert.equal(r.withinRadius, false)
    assert.ok(r.distanceM > 4000)
  })

  test('distanceM ist gerundet', () => {
    const r = checkWithinRadius(50.11, 8.68, 50.12, 8.69)
    assert.equal(r.distanceM, Math.round(r.distanceM))
  })
})

// ---------------------------------------------------------------------------
// extractPLZ (lib/geocoding.ts)
// ---------------------------------------------------------------------------

describe('extractPLZ', () => {
  test('PLZ aus "60311 Frankfurt" → 60311', () => {
    assert.equal(extractPLZ('60311 Frankfurt am Main'), '60311')
  })

  test('PLZ mitten im Text', () => {
    assert.equal(extractPLZ('Wohnt in 65933 seit 2020'), '65933')
  })

  test('null → null', () => {
    assert.equal(extractPLZ(null), null)
  })

  test('kein Match → null', () => {
    assert.equal(extractPLZ('kein PLZ hier'), null)
  })

  test('zu kurze Zahlenfolge → null', () => {
    assert.equal(extractPLZ('1234'), null)
  })
})
