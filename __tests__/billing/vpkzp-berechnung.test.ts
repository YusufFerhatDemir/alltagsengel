/**
 * VP/KZP — kombinierte Tage- und Budgetrechnung
 *
 * Haelt die beiden Dimensionen auseinander fest:
 *   GELD  EIN gemeinsamer Topf (§ 42a) — VP-Verbrauch mindert KZP.
 *   TAGE  ZWEI getrennte Kontingente — VP-Tage mindern KZP-Tage NICHT.
 *
 * Beide Richtungen werden geprueft, weil beide Verwechslungen echten
 * Schaden anrichten: gemeinsame Tage sperren berechtigte Leistungen,
 * getrenntes Geld laesst zu viel durch.
 */

import { describe, it, expect } from 'vitest'
import {
  berechneBuchung,
  berechneJahresLage,
  berechneSegmente,
  leererStand,
  type JahresStand,
} from '@/lib/billing/vpkzp/berechnung'
import { VP_KZP_KOMBINIERT_EUR } from '@/lib/config/budget-constants'
import { BudgetVersionFehltError } from '@/lib/config/budget-constants'
import { ZeitVersionFehltError, zeitVersionFuerJahr } from '@/lib/billing/vpkzp/konstanten'

const JAHR = 2026

function stand(teil: Partial<JahresStand> = {}): JahresStand {
  return { ...leererStand(JAHR), ...teil }
}

describe('berechneJahresLage', () => {
  it('nimmt den gesetzlichen gemeinsamen Jahresbetrag, wenn nichts bewilligt ist', () => {
    const lage = berechneJahresLage(stand())
    expect(lage.kombiniertesBudgetEuro).toBe(VP_KZP_KOMBINIERT_EUR)
    expect(lage.kombiniertesBudgetEuro).toBe(3539)
    expect(lage.budgetQuelle).toBe('gesetzlich')
    // Beide Kontingente sind seit dem Rechtsstand 2025 gleich gross:
    // 8 Wochen a 7 Tage (BMG, § 39 / § 42 SGB XI).
    expect(lage.vpMaxTage).toBe(56)
    expect(lage.kzpMaxTage).toBe(56)
  })

  it('bevorzugt eine abweichende Bewilligung aus client_budgets', () => {
    const lage = berechneJahresLage(stand({ kombiniertesBudgetEuro: 2000 }))
    expect(lage.kombiniertesBudgetEuro).toBe(2000)
    expect(lage.budgetQuelle).toBe('client_budgets')
  })

  it('kennt keinen Uebertrag ins Folgejahr (§ 42a Abs. 1 SGB XI)', () => {
    expect(berechneJahresLage(stand()).uebertragInsFolgejahr).toBe(false)
  })

  it('faellt fail-closed fuer Jahre ohne hinterlegte Werte', () => {
    // Beide Kataloge (Geld und Tage) beginnen 2024. Es wird bewusst kein
    // benachbarter Zeitraum geraten.
    expect(() => berechneJahresLage(stand({ jahr: 2019 })))
      .toThrow(BudgetVersionFehltError)
    expect(() => berechneJahresLage(stand({ jahr: 2023 })))
      .toThrow(BudgetVersionFehltError)
  })

  it('meldet Rest-Budget und Rest-Tage getrennt', () => {
    const lage = berechneJahresLage(stand({
      vpTageVerbraucht: 10,
      kzpTageVerbraucht: 4,
      vpBetragVerbrauchtEuro: 1000,
      kzpBetragVerbrauchtEuro: 500,
    }))
    expect(lage.kombiniertVerbrauchtEuro).toBe(1500)
    expect(lage.kombiniertRestEuro).toBe(2039)
    expect(lage.vpTageRest).toBe(46)
    expect(lage.kzpTageRest).toBe(52)
  })
})

describe('Geld ist ein gemeinsamer Topf', () => {
  it('VP-Verbrauch mindert, was fuer KZP bleibt', () => {
    const lage = berechneJahresLage(stand({ vpBetragVerbrauchtEuro: 3000 }))
    const kzp = berechneBuchung(lage, {
      art: 'kurzzeitpflege', tage: 5, betragEuro: 1000,
    })
    expect(kzp.budgetBetragEuro).toBe(539)   // 3539 - 3000
    expect(kzp.privatBetragEuro).toBe(461)
    expect(kzp.budgetReicht).toBe(false)
  })

  it('KZP-Verbrauch mindert umgekehrt genauso, was fuer VP bleibt', () => {
    const lage = berechneJahresLage(stand({ kzpBetragVerbrauchtEuro: 3539 }))
    const vp = berechneBuchung(lage, {
      art: 'verhinderungspflege', tage: 3, betragEuro: 400,
    })
    expect(vp.budgetBetragEuro).toBe(0)
    expect(vp.privatBetragEuro).toBe(400)
    expect(vp.budgetReicht).toBe(false)
    expect(vp.hinweise.join(' ')).toContain('§ 42a')
  })
})

describe('Tage sind zwei getrennte Kontingente', () => {
  it('56 verbrauchte VP-Tage lassen das KZP-Kontingent unberuehrt', () => {
    const lage = berechneJahresLage(stand({ vpTageVerbraucht: 56 }))
    expect(lage.vpTageRest).toBe(0)
    expect(lage.kzpTageRest).toBe(56)

    const kzp = berechneBuchung(lage, {
      art: 'kurzzeitpflege', tage: 14, betragEuro: 500,
    })
    expect(kzp.tageReichen).toBe(true)
    expect(kzp.anrechenbareTage).toBe(14)
  })

  it('gibt 56 VP-Tage frei — der 57. faellt aus dem Kontingent', () => {
    // BMG: "fuer laengstens acht Wochen je Kalenderjahr". 56 Tage sind der
    // volle Topf, alles darueber ist nicht mehr anrechenbar.
    const voll = berechneJahresLage(stand())
    expect(voll.vpTageRest).toBe(56)
    const ganz = berechneBuchung(voll, {
      art: 'verhinderungspflege', tage: 56, betragEuro: 0,
    })
    expect(ganz.tageReichen).toBe(true)
    expect(ganz.anrechenbareTage).toBe(56)
    expect(ganz.standNachher.vpTageVerbraucht).toBe(56)

    const tag57 = berechneBuchung(berechneJahresLage(ganz.standNachher), {
      art: 'verhinderungspflege', tage: 1, betragEuro: 50,
    })
    expect(tag57.tageReichen).toBe(false)
    expect(tag57.anrechenbareTage).toBe(0)
    expect(tag57.tageUeberschuss).toBe(1)
    expect(tag57.hinweise.join(' ')).toContain('56 Tage')
  })

  it('erlaubt im Rechtsstand 2024 weiterhin nur 42 VP-Tage', () => {
    // Alte Jahre bleiben reproduzierbar: die Anhebung auf 8 Wochen gilt
    // erst ab dem Rechtsstand 2025, nicht rueckwirkend.
    const lage = berechneJahresLage(stand({ jahr: 2024 }))
    expect(lage.vpMaxTage).toBe(42)
    expect(lage.kzpMaxTage).toBe(56)
    const zuViel = berechneBuchung(lage, {
      art: 'verhinderungspflege', tage: 43, betragEuro: 0,
    })
    expect(zuViel.anrechenbareTage).toBe(42)
    expect(zuViel.tageUeberschuss).toBe(1)
  })

  it('56 verbrauchte KZP-Tage lassen das VP-Kontingent unberuehrt', () => {
    const lage = berechneJahresLage(stand({ kzpTageVerbraucht: 56 }))
    const vp = berechneBuchung(lage, {
      art: 'verhinderungspflege', tage: 7, betragEuro: 300,
    })
    expect(vp.tageReichen).toBe(true)
    expect(vp.anrechenbareTage).toBe(7)
  })

  it('deckelt Tage am jeweils eigenen Kontingent', () => {
    // 54 von 56 verbraucht — von sieben angefragten Tagen passen noch zwei.
    const lage = berechneJahresLage(stand({ vpTageVerbraucht: 54 }))
    const vp = berechneBuchung(lage, {
      art: 'verhinderungspflege', tage: 7, betragEuro: 300,
    })
    expect(vp.anrechenbareTage).toBe(2)
    expect(vp.tageUeberschuss).toBe(5)
    expect(vp.tageReichen).toBe(false)
  })
})

describe('Mehrfachleistungen im selben Zeitraum', () => {
  it('zaehlt bereits erfasste Tage nicht erneut auf das Kontingent', () => {
    const lage = berechneJahresLage(stand({ vpTageVerbraucht: 5 }))
    const vp = berechneBuchung(lage, {
      art: 'verhinderungspflege', tage: 5, betragEuro: 200, bereitsGezaehlteTage: 5,
    })
    expect(vp.anrechenbareTage).toBe(0)
    expect(vp.standNachher.vpTageVerbraucht).toBe(5)
    // Das GELD wird trotzdem verbraucht — es sind zwei Leistungen.
    expect(vp.budgetBetragEuro).toBe(200)
    expect(vp.standNachher.vpBetragVerbrauchtEuro).toBe(200)
  })
})

describe('Storno und Gutschrift', () => {
  it('deckelt negative Betraege nicht — sie entlasten den Topf', () => {
    const lage = berechneJahresLage(stand({ vpBetragVerbrauchtEuro: 3539 }))
    const gutschrift = berechneBuchung(lage, {
      art: 'verhinderungspflege', tage: 1, betragEuro: -250,
    })
    expect(gutschrift.budgetBetragEuro).toBe(-250)
    expect(gutschrift.privatBetragEuro).toBe(0)
    expect(gutschrift.budgetReicht).toBe(true)
  })
})

describe('Budget-Erschoepfung', () => {
  it('laesst den Rest exakt aufgehen', () => {
    const lage = berechneJahresLage(stand({ vpBetragVerbrauchtEuro: 3539 - 120 }))
    const vp = berechneBuchung(lage, {
      art: 'verhinderungspflege', tage: 2, betragEuro: 120,
    })
    expect(vp.budgetReicht).toBe(true)
    expect(vp.budgetBetragEuro).toBe(120)
    expect(berechneJahresLage(vp.standNachher).kombiniertRestEuro).toBe(0)
  })

  it('schreibt nur den gedeckten Anteil fort', () => {
    const lage = berechneJahresLage(stand({ kzpBetragVerbrauchtEuro: 3400 }))
    const vp = berechneBuchung(lage, {
      art: 'verhinderungspflege', tage: 2, betragEuro: 500,
    })
    expect(vp.budgetBetragEuro).toBe(139)
    expect(vp.privatBetragEuro).toBe(361)
    // Der Privatanteil darf den Topf NICHT weiter belasten.
    expect(vp.standNachher.vpBetragVerbrauchtEuro).toBe(139)
    expect(berechneJahresLage(vp.standNachher).kombiniertRestEuro).toBe(0)
  })
})

describe('Jahreswechsel', () => {
  it('setzt Geld und Tage zum 01.01. zurueck — kein Uebertrag', () => {
    const staende = [
      stand({ jahr: 2025, vpTageVerbraucht: 56, vpBetragVerbrauchtEuro: 3539 }),
    ]
    const ergebnisse = berechneSegmente(staende, [
      { jahr: 2025, art: 'verhinderungspflege', tage: 5, betragEuro: 250 },
      { jahr: 2026, art: 'verhinderungspflege', tage: 9, betragEuro: 450 },
    ])

    // 2025 ist alles aus: keine Tage, kein Geld.
    expect(ergebnisse[0].anrechenbareTage).toBe(0)
    expect(ergebnisse[0].budgetBetragEuro).toBe(0)
    expect(ergebnisse[0].privatBetragEuro).toBe(250)

    // 2026 beginnt bei null — voller Anspruch.
    expect(ergebnisse[1].anrechenbareTage).toBe(9)
    expect(ergebnisse[1].budgetBetragEuro).toBe(450)
    expect(ergebnisse[1].privatBetragEuro).toBe(0)
  })

  it('rechnet aufeinanderfolgende Buchungen desselben Jahres kumulativ', () => {
    const ergebnisse = berechneSegmente([stand({ jahr: 2026 })], [
      { jahr: 2026, art: 'kurzzeitpflege', tage: 30, betragEuro: 2000 },
      { jahr: 2026, art: 'kurzzeitpflege', tage: 30, betragEuro: 2000 },
    ])
    expect(ergebnisse[0].anrechenbareTage).toBe(30)
    expect(ergebnisse[1].anrechenbareTage).toBe(26)   // 56 - 30
    expect(ergebnisse[1].tageUeberschuss).toBe(4)
    expect(ergebnisse[1].budgetBetragEuro).toBe(1539) // 3539 - 2000
  })

  it('faellt fail-closed, wenn ein betroffenes Jahr keine Kontingente hat', () => {
    expect(() => berechneSegmente([], [
      { jahr: 2023, art: 'verhinderungspflege', tage: 1, betragEuro: 10 },
    ])).toThrow()
    // Der Zeitkatalog ist eigenstaendig fail-closed. Ueber
    // berechneJahresLage() greift zuerst der Budgetkatalog, deshalb hier
    // direkt geprueft — sonst waere diese Sperre nie belegt.
    expect(() => zeitVersionFuerJahr(2023)).toThrow(ZeitVersionFehltError)
  })
})
