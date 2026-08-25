// ═══════════════════════════════════════════════════════════════
// Welle 6 — MIS-Konstanten (lib/mis/constants.ts)
// ═══════════════════════════════════════════════════════════════
//
// Die Zahlen in FINANCIAL_PROJECTIONS / UNIT_ECONOMICS / MARKET_DATA
// gehen in Data-Room-Ansichten. Sie sind Geschäftsannahmen und werden
// hier NICHT bewertet — geprüft wird nur, ob sie in sich stimmig sind:
// Gewinn = Umsatz − Kosten, Marge = Abrechnungssatz − Vergütung, und
// der Entlastungsbetrag steht in beiden Blöcken auf demselben Wert.
//
// So fällt eine halbherzig aktualisierte Zahl auf, statt still eine
// zweite Wahrheit zu erzeugen.
// ═══════════════════════════════════════════════════════════════

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
  BRAND,
  NAV_ITEMS,
  DOC_STATUS_LABELS,
  PRIORITY_LABELS,
  RISK_COLORS,
  CLASSIFICATION_LABELS,
  FINANCIAL_PROJECTIONS,
  UNIT_ECONOMICS,
  MARKET_DATA,
} from '../mis/constants'

const istFarbe = (v: string) => /^#[0-9A-Fa-f]{6}$/.test(v) || /^rgba?\([\d\s.,]+\)$/.test(v)

// ───────────────────────────────────────────────────────────────
describe('BRAND', () => {
  test('jeder Wert ist eine verwendbare CSS-Farbe', () => {
    for (const [name, wert] of Object.entries(BRAND)) {
      assert.ok(istFarbe(wert), `BRAND.${name} = "${wert}" ist keine Farbe`)
    }
  })

  test('die Statusfarben sind gesetzt und unterscheidbar', () => {
    const status = [BRAND.success, BRAND.warning, BRAND.error, BRAND.info]
    assert.equal(new Set(status).size, status.length, 'Statusfarben sind nicht unterscheidbar')
  })
})

// ───────────────────────────────────────────────────────────────
describe('NAV_ITEMS', () => {
  test('nicht leer', () => {
    assert.ok(NAV_ITEMS.length > 0)
  })

  test('jeder Eintrag hat href, Label, Icon und Modul', () => {
    for (const n of NAV_ITEMS) {
      assert.ok(n.href.startsWith('/mis'), `${n.href} liegt außerhalb von /mis`)
      assert.ok(n.label.trim().length > 0, `${n.href} ohne Label`)
      assert.ok(n.icon.trim().length > 0, `${n.href} ohne Icon`)
      assert.ok(n.module.trim().length > 0, `${n.href} ohne Modul`)
    }
  })

  test('hrefs sind eindeutig', () => {
    const hrefs = NAV_ITEMS.map((n) => n.href)
    assert.equal(new Set(hrefs).size, hrefs.length)
  })

  test('Modulnamen sind eindeutig', () => {
    const module = NAV_ITEMS.map((n) => n.module)
    assert.equal(new Set(module).size, module.length)
  })

  test('das Dashboard ist der erste Eintrag und liegt auf /mis', () => {
    assert.equal(NAV_ITEMS[0].href, '/mis')
    assert.equal(NAV_ITEMS[0].module, 'dashboard')
  })

  test('der Modulname entspricht dem letzten Pfadsegment', () => {
    for (const n of NAV_ITEMS.slice(1)) {
      assert.equal(n.module, n.href.split('/').pop(), `${n.href} ↔ ${n.module}`)
    }
  })
})

// ───────────────────────────────────────────────────────────────
describe('Label-Tabellen', () => {
  test('DOC_STATUS_LABELS: jedes Label hat Text und Farbe', () => {
    for (const [k, v] of Object.entries(DOC_STATUS_LABELS)) {
      assert.ok(v.label.trim().length > 0, `${k} ohne Label`)
      assert.ok(istFarbe(v.color), `${k}: "${v.color}" ist keine Farbe`)
    }
  })

  test('PRIORITY_LABELS: jedes Label hat Text und Farbe', () => {
    for (const [k, v] of Object.entries(PRIORITY_LABELS)) {
      assert.ok(v.label.trim().length > 0, `${k} ohne Label`)
      assert.ok(istFarbe(v.color), `${k}: "${v.color}" ist keine Farbe`)
    }
  })

  test('PRIORITY_LABELS und RISK_COLORS decken dieselben Stufen ab', () => {
    assert.deepEqual(Object.keys(PRIORITY_LABELS).sort(), Object.keys(RISK_COLORS).sort())
  })

  test('RISK_COLORS: alle Werte sind Farben', () => {
    for (const [k, v] of Object.entries(RISK_COLORS)) {
      assert.ok(istFarbe(v), `${k}: "${v}" ist keine Farbe`)
    }
  })

  test('CLASSIFICATION_LABELS deckt die vier Vertraulichkeitsstufen ab', () => {
    assert.deepEqual(
      Object.keys(CLASSIFICATION_LABELS).sort(),
      ['confidential', 'internal', 'public', 'restricted'],
    )
    for (const v of Object.values(CLASSIFICATION_LABELS)) {
      assert.ok(v.trim().length > 0)
    }
  })
})

// ───────────────────────────────────────────────────────────────
describe('FINANCIAL_PROJECTIONS — innere Stimmigkeit', () => {
  const F = FINANCIAL_PROJECTIONS

  test('alle Reihen sind gleich lang wie die Jahresliste', () => {
    for (const [name, reihe] of Object.entries({
      revenue: F.revenue, costs: F.costs, profit: F.profit, users: F.users, bookings: F.bookings,
    })) {
      assert.equal(reihe.length, F.years.length, `${name} hat ${reihe.length} statt ${F.years.length} Werte`)
    }
  })

  test('Jahre sind aufsteigend und lückenlos', () => {
    const jahre = F.years.map(Number)
    for (let i = 1; i < jahre.length; i++) {
      assert.equal(jahre[i], jahre[i - 1] + 1, `Lücke zwischen ${jahre[i - 1]} und ${jahre[i]}`)
    }
  })

  test('Gewinn ist exakt Umsatz minus Kosten', () => {
    F.years.forEach((jahr, i) => {
      assert.equal(F.profit[i], F.revenue[i] - F.costs[i], `${jahr}: Gewinn passt nicht zu Umsatz − Kosten`)
    })
  })

  test('Umsatz, Kosten, Nutzer und Buchungen wachsen monoton', () => {
    for (const [name, reihe] of Object.entries({ revenue: F.revenue, costs: F.costs, users: F.users, bookings: F.bookings })) {
      for (let i = 1; i < reihe.length; i++) {
        assert.ok(reihe[i] > reihe[i - 1], `${name} fällt zwischen ${F.years[i - 1]} und ${F.years[i]}`)
      }
    }
  })

  test('alle Werte außer dem Gewinn sind nichtnegativ', () => {
    for (const reihe of [F.revenue, F.costs, F.users, F.bookings]) {
      for (const w of reihe) assert.ok(w >= 0)
    }
  })
})

// ───────────────────────────────────────────────────────────────
describe('UNIT_ECONOMICS — innere Stimmigkeit', () => {
  const U = UNIT_ECONOMICS

  test('Marge je Stunde ist Abrechnungssatz minus Engel-Vergütung', () => {
    assert.equal(U.marginPerHour, U.billingRatePerHour - U.helperPayPerHour)
  })

  test('Marge je Kunde und Monat ist Stundenmarge mal Stunden', () => {
    assert.equal(U.marginPerCustomerMonth, U.marginPerHour * U.avgHoursPerCustomerMonth)
  })

  test('marginPercent entspricht der Stundenmarge (auf zwei Stellen)', () => {
    assert.equal(Number((U.marginPerHour / U.billingRatePerHour).toFixed(2)), U.marginPercent)
  })

  test('LTV entspricht 24 Monaten Marge', () => {
    assert.equal(U.ltv, U.marginPerCustomerMonth * 24)
  })

  test('LTV/CAC-Verhältnis passt zu LTV und CAC (auf eine Stelle)', () => {
    assert.equal(Number((U.ltv / U.cac).toFixed(1)), U.ltvCacRatio)
  })

  test('Amortisationsdauer passt zu CAC und Monatsmarge (auf eine Stelle)', () => {
    assert.equal(Number((U.cac / U.marginPerCustomerMonth).toFixed(1)), U.paybackMonths)
  })

  test('Engel-Vergütung liegt unter dem Abrechnungssatz', () => {
    assert.ok(U.helperPayPerHour < U.billingRatePerHour)
  })

  test('monatliche Abwanderung ist ein Anteil zwischen 0 und 1', () => {
    assert.ok(U.monthlyChurn > 0 && U.monthlyChurn < 1)
  })
})

// ───────────────────────────────────────────────────────────────
describe('MARKET_DATA — innere Stimmigkeit', () => {
  const M = MARKET_DATA

  test('Entlastungsbetrag steht in beiden Blöcken auf demselben Wert', () => {
    assert.equal(M.entlastungsbetrag, UNIT_ECONOMICS.entlastungsbetrag)
  })

  test('Entlastungsbetrag ist der seit der Pflegereform 2025 geltende Satz', () => {
    assert.equal(M.entlastungsbetrag, 131)
  })

  test('SAM entspricht Pflegebedürftige × Entlastungsbetrag × 12 (gerundet)', () => {
    const berechnet = M.pflegebeduerftige * M.entlastungsbetrag * 12
    const abweichung = Math.abs(berechnet - M.sam) / M.sam
    assert.ok(abweichung < 0.01, `SAM weicht um ${(abweichung * 100).toFixed(2)} % ab`)
  })

  test('ungenutztes Volumen ist SAM mal ungenutztem Anteil', () => {
    assert.equal(M.unusedVolume, M.sam * M.unusedRate)
  })

  test('Marktgrößen sind ineinander geschachtelt: SOM < SAM < TAM', () => {
    assert.ok(M.som5yr < M.sam, 'SOM ist nicht kleiner als SAM')
    assert.ok(M.sam < M.tam, 'SAM ist nicht kleiner als TAM')
  })

  test('ungenutzter Anteil ist ein Anteil zwischen 0 und 1', () => {
    assert.ok(M.unusedRate > 0 && M.unusedRate < 1)
  })
})
