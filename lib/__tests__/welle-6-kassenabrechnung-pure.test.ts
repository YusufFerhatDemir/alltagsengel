// ═══════════════════════════════════════════════════════════════
// Welle 6 — Kassenabrechnung, reine Rechenteile
// (lib/abrechnung/kassenabrechnung-engine.ts)
// ═══════════════════════════════════════════════════════════════
//
// Zwei Funktionen ohne Datenbankbezug, beide mit Live-Historie:
//   monatsGrenzen — der Filter, dessen Fehlen den DTA-Pfad mit
//                   Postgres 42703 (invoices.period_month) stilllegte
//   euroZuCent    — total_amount steht in EURO, jede *_cent-Spalte
//                   und der EDIFACT-Generator erwarten CENT
//
// Alles andere im Modul braucht einen Supabase-Client.
// ═══════════════════════════════════════════════════════════════

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { monatsGrenzen, euroZuCent } from '../abrechnung/kassenabrechnung-engine'

// ───────────────────────────────────────────────────────────────
describe('monatsGrenzen', () => {
  test('31-Tage-Monat', () => {
    assert.deepEqual(monatsGrenzen('2026-07'), { von: '2026-07-01', bis: '2026-07-31' })
  })

  test('30-Tage-Monat', () => {
    assert.deepEqual(monatsGrenzen('2026-04'), { von: '2026-04-01', bis: '2026-04-30' })
  })

  test('Februar im Normaljahr hat 28 Tage', () => {
    assert.deepEqual(monatsGrenzen('2026-02'), { von: '2026-02-01', bis: '2026-02-28' })
  })

  test('Februar im Schaltjahr hat 29 Tage', () => {
    assert.deepEqual(monatsGrenzen('2028-02'), { von: '2028-02-01', bis: '2028-02-29' })
  })

  test('Jahrhundert-Schaltjahrregel: 2000 ja, 2100 nein', () => {
    assert.equal(monatsGrenzen('2000-02').bis, '2000-02-29')
    assert.equal(monatsGrenzen('2100-02').bis, '2100-02-28')
  })

  test('akzeptiert auch ein volles Datum und schneidet auf den Monat', () => {
    assert.deepEqual(monatsGrenzen('2026-07-17'), { von: '2026-07-01', bis: '2026-07-31' })
    assert.deepEqual(monatsGrenzen('2026-07-01'), { von: '2026-07-01', bis: '2026-07-31' })
  })

  test('Dezember läuft nicht ins Folgejahr', () => {
    assert.deepEqual(monatsGrenzen('2026-12'), { von: '2026-12-01', bis: '2026-12-31' })
  })

  test('Januar', () => {
    assert.deepEqual(monatsGrenzen('2027-01'), { von: '2027-01-01', bis: '2027-01-31' })
  })

  test('Grenzen sind immer als ISO-Datum formatiert — Tag zweistellig', () => {
    for (const m of ['2026-01', '2026-02', '2026-06', '2026-09', '2026-11']) {
      const g = monatsGrenzen(m)
      assert.match(g.von, /^\d{4}-\d{2}-\d{2}$/)
      assert.match(g.bis, /^\d{4}-\d{2}-\d{2}$/)
    }
  })

  test('von liegt nie nach bis', () => {
    for (let monat = 1; monat <= 12; monat++) {
      const m = `2026-${String(monat).padStart(2, '0')}`
      const g = monatsGrenzen(m)
      assert.ok(g.von <= g.bis, `${m}: ${g.von} > ${g.bis}`)
    }
  })

  test('alle zwölf Monate 2026 haben die erwartete Länge', () => {
    const laengen = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    laengen.forEach((tage, i) => {
      const m = `2026-${String(i + 1).padStart(2, '0')}`
      assert.equal(monatsGrenzen(m).bis.slice(8), String(tage).padStart(2, '0'), m)
    })
  })
})

// ───────────────────────────────────────────────────────────────
describe('euroZuCent', () => {
  test('der belegte Live-Fall: 43,50 € → 4350 Cent', () => {
    assert.equal(euroZuCent(43.5), 4350)
  })

  test('ganze Euro', () => {
    assert.equal(euroZuCent(1), 100)
    assert.equal(euroZuCent(100), 10000)
  })

  test('Float-Artefakte werden weggerundet', () => {
    // 19.99 * 100 ergibt in IEEE-754 1998.9999999999998
    assert.equal(euroZuCent(19.99), 1999)
    assert.equal(euroZuCent(0.07), 7)   // 7.000000000000001
    assert.equal(euroZuCent(999.999), 100000)
  })

  test('Grenzfall der Float-Rundung: 1,005 € ergibt 101 Cent', () => {
    // Hier stand frueher die Erwartung 100: `Math.round(1.005 * 100)` ergab
    // 100, weil 1.005 * 100 in IEEE-754 100.49999999999999 ist. Seit die
    // Rundung in lib/geld.ts auf Dezimalverschiebung umgestellt ist, faellt
    // der Halb-Cent korrekt auf. Die ausfuehrliche Regressionssuite steht in
    // lib/__tests__/geld-rundung.test.ts.
    assert.equal(euroZuCent(1.005), 101)
    assert.equal(euroZuCent(7.005), 701)   // 700.5 → rundet auf
  })

  test('null und undefined zählen als 0 — nie NaN in eine Cent-Spalte', () => {
    assert.equal(euroZuCent(null), 0)
    assert.equal(euroZuCent(undefined), 0)
  })

  test('0 bleibt 0', () => {
    assert.equal(euroZuCent(0), 0)
  })

  test('negative Beträge (Gutschrift) behalten ihr Vorzeichen', () => {
    assert.equal(euroZuCent(-43.5), -4350)
  })

  test('Ergebnis ist immer ganzzahlig', () => {
    for (const e of [0.001, 12.3456, 999.999, 7.005]) {
      assert.ok(Number.isInteger(euroZuCent(e)), `${e} ergab keinen Integer`)
    }
  })

  test('Rundung geht zur nächsten ganzen Cent-Zahl', () => {
    assert.equal(euroZuCent(0.004), 0)
    assert.equal(euroZuCent(0.005), 1)
    assert.equal(euroZuCent(0.006), 1)
  })
})
