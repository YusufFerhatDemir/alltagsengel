// ═══════════════════════════════════════════════════════════════
// Tests: PUSH-Tool 3.0 — Flächenklassen, Exsudat, Gewebetyp, Gesamt
// Ausführen: npm run test:unit
// ═══════════════════════════════════════════════════════════════

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  berechnePushScore, pushExsudatPunkte, pushFlaechePunkte, pushGewebePunkte,
} from '../push-score'

test('pushFlaechePunkte bildet die PUSH-Flächenklassen exakt ab', () => {
  const faelle: Array<[number, number, number]> = [
    [0, 0, 0],        // geschlossen
    [0.5, 0.5, 1],    // 0.25 cm² ≤ 0.3
    [0.6, 1, 2],      // 0.6 cm²
    [1, 1, 3],        // 1.0 cm²
    [2, 1, 4],        // 2.0 cm²
    [3, 1, 5],        // 3.0 cm²
    [2, 2, 6],        // 4.0 cm²
    [4, 2, 7],        // 8.0 cm²
    [4, 3, 8],        // 12.0 cm²
    [6, 4, 9],        // 24.0 cm²
    [5, 5, 10],       // 25 cm² > 24
  ]
  for (const [l, b, erwartet] of faelle) {
    assert.equal(pushFlaechePunkte(l, b), erwartet, `${l}×${b} cm`)
  }
})

test('pushFlaechePunkte: ohne Maße kein Teilwert, negative Maße werfen', () => {
  assert.equal(pushFlaechePunkte(null, 2), null)
  assert.equal(pushFlaechePunkte(2, null), null)
  assert.throws(() => pushFlaechePunkte(-1, 2), /negativ/)
})

test('pushExsudatPunkte deckt alle Mengen ab', () => {
  assert.equal(pushExsudatPunkte(null), null)
  assert.equal(pushExsudatPunkte('keine'), 0)
  assert.equal(pushExsudatPunkte('wenig'), 1)
  assert.equal(pushExsudatPunkte('maessig'), 2)
  assert.equal(pushExsudatPunkte('viel'), 3)
})

test('pushGewebePunkte nimmt das schlechteste vorhandene Gewebe', () => {
  const basis = { laengeCm: 2, breiteCm: 1, granulationPct: null, fibrinPct: null, nekrosePct: null, epithelPct: null }
  assert.equal(pushGewebePunkte({ ...basis, nekrosePct: 10, granulationPct: 90 }), 4)
  assert.equal(pushGewebePunkte({ ...basis, fibrinPct: 5, granulationPct: 95 }), 3)
  assert.equal(pushGewebePunkte({ ...basis, granulationPct: 100 }), 2)
  assert.equal(pushGewebePunkte({ ...basis, epithelPct: 100 }), 1)
})

test('pushGewebePunkte: alle Anteile 0 → geschlossen nur bei Fläche 0', () => {
  const nullAnteile = { granulationPct: 0, fibrinPct: 0, nekrosePct: 0, epithelPct: 0 }
  assert.equal(pushGewebePunkte({ laengeCm: 0, breiteCm: 0, ...nullAnteile }), 0)
  assert.equal(pushGewebePunkte({ laengeCm: 2, breiteCm: 1, ...nullAnteile }), 1)
})

test('pushGewebePunkte: ohne jede Wundgrund-Angabe kein Teilwert', () => {
  assert.equal(pushGewebePunkte({
    laengeCm: 2, breiteCm: 1,
    granulationPct: null, fibrinPct: null, nekrosePct: null, epithelPct: null,
  }), null)
})

test('berechnePushScore summiert nur bei vollständigen Teilwerten', () => {
  const voll = berechnePushScore({
    laengeCm: 4, breiteCm: 2, exsudatMenge: 'maessig',
    granulationPct: 60, fibrinPct: 30, nekrosePct: 10, epithelPct: 0,
  })
  assert.equal(voll.flaechePunkte, 7)   // 8 cm²
  assert.equal(voll.exsudatPunkte, 2)
  assert.equal(voll.gewebePunkte, 4)    // Nekrose vorhanden
  assert.equal(voll.gesamt, 13)

  const unvollstaendig = berechnePushScore({
    laengeCm: 4, breiteCm: 2, exsudatMenge: null,
    granulationPct: 100, fibrinPct: 0, nekrosePct: 0, epithelPct: 0,
  })
  assert.equal(unvollstaendig.gesamt, null)
})

test('berechnePushScore: abgeheilte Wunde ergibt 0', () => {
  const abgeheilt = berechnePushScore({
    laengeCm: 0, breiteCm: 0, exsudatMenge: 'keine',
    granulationPct: 0, fibrinPct: 0, nekrosePct: 0, epithelPct: 0,
  })
  assert.equal(abgeheilt.gesamt, 0)
})
