// ═══════════════════════════════════════════════════════════════
// Welle 6 — Kostenrechnung der Preis-Engine (lib/pricing-engine.ts)
// ═══════════════════════════════════════════════════════════════
//
// calculateCosts() ist der einzige rein rechnende Export des Moduls:
// Kostensätze rein, Kostenaufstellung raus, keine Datenbank beteiligt.
// Alles andere (calculatePrice, calculateMargin, evaluateReviewRules)
// lädt Preisdaten über Supabase und ist hier bewusst ausgeklammert.
//
// Die eingesetzten Sätze sind TESTWERTE, keine echten Tarife — sie sind
// bewusst so gewählt, dass sich jede Position von Hand nachrechnen lässt.
// ═══════════════════════════════════════════════════════════════

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { calculateCosts } from '../pricing-engine'
import type { PricingCost } from '../types/pricing'

/** Kostensatz-Doppelgänger mit glatten Zahlen — nur für die Nachrechnung. */
function satz(werte: Partial<PricingCost> = {}): PricingCost {
  return {
    id: 'test',
    tier_id: 'test',
    fuel_cost_per_km: 0.1,
    driver_rate_per_km: 0.2,
    vehicle_cost_per_km: 0.3,
    driver_rate_per_min: 0.5,
    fixed_overhead: 5,
    effective_from: '2026-01-01',
    effective_to: null,
    ...werte,
  }
}

// ───────────────────────────────────────────────────────────────
describe('calculateCosts — Positionen', () => {
  test('jede Position folgt ihrem eigenen Satz', () => {
    const c = calculateCosts(satz(), 10, 20)
    assert.equal(c.fuel, 1)              // 10 km × 0,10
    assert.equal(c.driver_distance, 2)   // 10 km × 0,20
    assert.equal(c.vehicle, 3)           // 10 km × 0,30
    assert.equal(c.driver_time, 10)      // 20 min × 0,50
    assert.equal(c.fixed_overhead, 5)
  })

  test('die Summe ist die Summe aller Positionen', () => {
    const c = calculateCosts(satz(), 10, 20)
    assert.equal(c.total, c.fuel + c.driver_distance + c.driver_time + c.vehicle + c.fixed_overhead)
    assert.equal(c.total, 21)
  })

  test('der Gemeinkostenanteil geht unverändert durch — er hängt an keiner Strecke', () => {
    assert.equal(calculateCosts(satz({ fixed_overhead: 7.5 }), 0, 0).fixed_overhead, 7.5)
    assert.equal(calculateCosts(satz({ fixed_overhead: 7.5 }), 100, 100).fixed_overhead, 7.5)
  })

  test('das Ergebnis trägt genau die sechs Felder der Aufstellung', () => {
    assert.deepEqual(
      Object.keys(calculateCosts(satz(), 1, 1)).sort(),
      ['driver_distance', 'driver_time', 'fixed_overhead', 'fuel', 'total', 'vehicle'],
    )
  })
})

describe('calculateCosts — Grenzfälle', () => {
  test('Fahrt ohne Strecke und ohne Wartezeit kostet nur die Gemeinkosten', () => {
    const c = calculateCosts(satz(), 0, 0)
    assert.equal(c.fuel, 0)
    assert.equal(c.driver_distance, 0)
    assert.equal(c.driver_time, 0)
    assert.equal(c.vehicle, 0)
    assert.equal(c.total, 5)
  })

  test('Wartezeit ohne Strecke schlägt nur auf die Zeitposition durch', () => {
    const c = calculateCosts(satz(), 0, 30)
    assert.equal(c.driver_time, 15)
    assert.equal(c.fuel, 0)
    assert.equal(c.total, 20)
  })

  test('Strecke ohne Wartezeit schlägt nur auf die Streckenpositionen durch', () => {
    const c = calculateCosts(satz(), 25, 0)
    assert.equal(c.driver_time, 0)
    assert.equal(c.fuel, 2.5)
    assert.equal(c.driver_distance, 5)
    assert.equal(c.vehicle, 7.5)
    assert.equal(c.total, 20)
  })

  test('die Kosten wachsen linear mit der Strecke', () => {
    const einfach = calculateCosts(satz({ fixed_overhead: 0 }), 10, 0).total
    const doppelt = calculateCosts(satz({ fixed_overhead: 0 }), 20, 0).total
    assert.equal(doppelt, einfach * 2)
  })

  test('Sätze von 0 ergeben Kosten von 0', () => {
    const nullsatz = satz({
      fuel_cost_per_km: 0, driver_rate_per_km: 0, vehicle_cost_per_km: 0,
      driver_rate_per_min: 0, fixed_overhead: 0,
    })
    assert.equal(calculateCosts(nullsatz, 100, 100).total, 0)
  })
})

describe('calculateCosts — Rundung', () => {
  test('jede Position ist auf zwei Nachkommastellen gerundet', () => {
    const c = calculateCosts(satz({ fuel_cost_per_km: 0.137, driver_rate_per_km: 0.219 }), 7, 3)
    for (const [name, wert] of Object.entries(c)) {
      const stellen = String(wert).split('.')[1]?.length ?? 0
      assert.ok(stellen <= 2, `${name} = ${wert} hat mehr als zwei Nachkommastellen`)
    }
  })

  test('kaufmännisch gerundet: 0,137 €/km × 7 km = 0,96 €', () => {
    // 0.959 → 0.96
    assert.equal(calculateCosts(satz({ fuel_cost_per_km: 0.137 }), 7, 0).fuel, 0.96)
  })

  test('die Summe wird eigenständig gerundet und weicht daher nie um mehr als einen Cent ab', () => {
    const c = calculateCosts(
      satz({ fuel_cost_per_km: 0.111, driver_rate_per_km: 0.222, vehicle_cost_per_km: 0.333, driver_rate_per_min: 0.444 }),
      7, 3,
    )
    const summeDerTeile = c.fuel + c.driver_distance + c.driver_time + c.vehicle + c.fixed_overhead
    assert.ok(Math.abs(c.total - summeDerTeile) <= 0.01, `total=${c.total}, Teile=${summeDerTeile}`)
  })

  test('Float-Artefakte tauchen im Ergebnis nicht auf', () => {
    const c = calculateCosts(satz({ fuel_cost_per_km: 0.1, fixed_overhead: 0.2 }), 3, 0)
    // 0.1 * 3 wäre roh 0.30000000000000004
    assert.equal(c.fuel, 0.3)
  })
})
