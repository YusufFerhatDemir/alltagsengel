// ═══════════════════════════════════════════════════════════════
// Welle 5h — Tourenplanung Fahrtzeit-Schätzung Tests
// ═══════════════════════════════════════════════════════════════
//
// Reine Funktionen: durchschnittsgeschwindigkeitKmh, fahrtZwischenPlz,
// fahrtzeitenEntlangRoute. Offline-Berechnung (keine API).
// Konstanten: UMWEGFAKTOR, FAHRZEIT_GLEICHE_PLZ_MINUTEN, etc.
// ═══════════════════════════════════════════════════════════════

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
  durchschnittsgeschwindigkeitKmh,
  fahrtZwischenPlz,
  fahrtzeitenEntlangRoute,
  UMWEGFAKTOR,
  FAHRZEIT_GLEICHE_PLZ_MINUTEN,
  DISTANZ_GLEICHE_PLZ_KM,
  PUFFER_PRO_STOP_MINUTEN,
} from '../fahrtzeit'

// ---------------------------------------------------------------------------
// durchschnittsgeschwindigkeitKmh
// ---------------------------------------------------------------------------

describe('durchschnittsgeschwindigkeitKmh', () => {
  test('kurze Strecke (≤3 km) → 22 km/h (innerorts)', () => {
    assert.equal(durchschnittsgeschwindigkeitKmh(2), 22)
    assert.equal(durchschnittsgeschwindigkeitKmh(3), 22)
  })

  test('mittlere Strecke (4-15 km) → 35 km/h', () => {
    assert.equal(durchschnittsgeschwindigkeitKmh(4), 35)
    assert.equal(durchschnittsgeschwindigkeitKmh(15), 35)
  })

  test('lange Strecke (>15 km) → 55 km/h', () => {
    assert.equal(durchschnittsgeschwindigkeitKmh(16), 55)
    assert.equal(durchschnittsgeschwindigkeitKmh(100), 55)
  })

  test('0 km → innerorts (22)', () => {
    assert.equal(durchschnittsgeschwindigkeitKmh(0), 22)
  })
})

// ---------------------------------------------------------------------------
// fahrtZwischenPlz
// ---------------------------------------------------------------------------

describe('fahrtZwischenPlz', () => {
  test('gleiche PLZ → Pauschale', () => {
    const r = fahrtZwischenPlz('60311', '60311')
    assert.ok(r !== null)
    assert.equal(r!.distanzKm, DISTANZ_GLEICHE_PLZ_KM)
    assert.equal(r!.fahrzeitMinuten, FAHRZEIT_GLEICHE_PLZ_MINUTEN)
  })

  test('Frankfurt → Offenbach = realistische Distanz', () => {
    const r = fahrtZwischenPlz('60311', '63065')
    assert.ok(r !== null)
    assert.ok(r!.distanzKm > 5 && r!.distanzKm < 25, `Distanz: ${r!.distanzKm}`)
    assert.ok(r!.fahrzeitMinuten > 5 && r!.fahrzeitMinuten < 45, `Fahrzeit: ${r!.fahrzeitMinuten}`)
  })

  test('distanzKm hat maximal 1 Nachkommastelle', () => {
    const r = fahrtZwischenPlz('60311', '65185')
    assert.ok(r !== null)
    const nachkomma = String(r!.distanzKm).split('.')
    assert.ok(!nachkomma[1] || nachkomma[1].length <= 1)
  })

  test('fahrzeitMinuten ist aufgerundet (ganzzahlig)', () => {
    const r = fahrtZwischenPlz('60311', '63065')
    assert.ok(r !== null)
    assert.equal(r!.fahrzeitMinuten, Math.ceil(r!.fahrzeitMinuten))
  })

  test('null PLZ → null', () => {
    assert.equal(fahrtZwischenPlz(null, '60311'), null)
    assert.equal(fahrtZwischenPlz('60311', null), null)
    assert.equal(fahrtZwischenPlz(null, null), null)
  })

  test('unbekannte PLZ → null', () => {
    assert.equal(fahrtZwischenPlz('00000', '60311'), null)
  })
})

// ---------------------------------------------------------------------------
// fahrtzeitenEntlangRoute
// ---------------------------------------------------------------------------

describe('fahrtzeitenEntlangRoute', () => {
  test('leere Route → leeres Array', () => {
    assert.deepEqual(fahrtzeitenEntlangRoute([]), [])
  })

  test('ein Stop ohne startPlz → null-Fahrt', () => {
    const r = fahrtzeitenEntlangRoute([{ plz: '60311' }])
    assert.equal(r.length, 1)
    assert.equal(r[0].fahrzeitMinuten, null)
  })

  test('ein Stop mit startPlz → berechnete Fahrt', () => {
    const r = fahrtzeitenEntlangRoute([{ plz: '63065' }], '60311')
    assert.equal(r.length, 1)
    assert.ok(r[0].fahrzeitMinuten !== null && r[0].fahrzeitMinuten > 0)
  })

  test('zwei Stops → Fahrt zwischen Stops', () => {
    const r = fahrtzeitenEntlangRoute(
      [{ plz: '60311' }, { plz: '63065' }],
      '60599'
    )
    assert.equal(r.length, 2)
    assert.ok(r[0].fahrzeitMinuten !== null) // startPlz → Stop 1
    assert.ok(r[1].fahrzeitMinuten !== null) // Stop 1 → Stop 2
  })

  test('Stop ohne PLZ → null', () => {
    const r = fahrtzeitenEntlangRoute([{ plz: null }], '60311')
    assert.equal(r[0].fahrzeitMinuten, null)
    assert.equal(r[0].distanzKm, null)
  })
})

// ---------------------------------------------------------------------------
// Konstanten-Plausibilität
// ---------------------------------------------------------------------------

describe('Fahrtzeit-Konstanten', () => {
  test('UMWEGFAKTOR ist > 1 und < 2', () => {
    assert.ok(UMWEGFAKTOR > 1 && UMWEGFAKTOR < 2, `Unplausibel: ${UMWEGFAKTOR}`)
  })

  test('FAHRZEIT_GLEICHE_PLZ_MINUTEN ist > 0', () => {
    assert.ok(FAHRZEIT_GLEICHE_PLZ_MINUTEN > 0)
  })

  test('PUFFER_PRO_STOP_MINUTEN ist > 0', () => {
    assert.ok(PUFFER_PRO_STOP_MINUTEN > 0)
  })

  test('DISTANZ_GLEICHE_PLZ_KM ist > 0', () => {
    assert.ok(DISTANZ_GLEICHE_PLZ_KM > 0)
  })
})
