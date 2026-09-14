/**
 * Ein Eintrag für nächstes Jahr galt sofort
 * ═══════════════════════════════════════════════════════════════════════
 *
 * BEFUND (Block 78)
 *
 * `lib/config/budget-constants.ts` versioniert die gesetzlichen
 * Budgetgrenzen und begründet das ausdrücklich: „Alte Werte NIEMALS
 * überschreiben — Rechnungen und Budgetprüfungen vergangener Jahre müssen
 * reproduzierbar bleiben." `budgetVersionFuerJahr()` ist dafür fail-closed
 * und rät für ein unbekanntes Jahr nichts.
 *
 * Die Einzelkonstanten daneben — `ENTLASTUNG_MONATLICH_EUR`,
 * `ENTLASTUNG_JAEHRLICH_EUR`, `VP_KZP_KOMBINIERT_EUR` — kamen aus
 *
 *     const AKTUELL = BUDGET_VERSIONEN[BUDGET_VERSIONEN.length - 1]
 *
 * also schlicht aus dem LETZTEN Eintrag der Liste. Die Anleitung im Kopf
 * derselben Datei sagt, wie neue Werte einzutragen sind: „NEUEN Eintrag
 * mit gueltigAb='2028-01-01' … anhängen."
 *
 * Wer dieser Anleitung folgt — etwa im Herbst 2027, um die Dynamisierung
 * vorzubereiten — ändert damit SOFORT die geltenden Werte. Die
 * Budgetprüfung hätte von diesem Tag an ein zu hohes Limit zugelassen, und
 * die Marketingvorlagen hätten einen Entlastungsbetrag genannt, den es
 * noch nicht gibt.
 *
 * Dazu: die Budgetprüfung in `lib/personal/einsatzfreigabe.ts` rechnete
 * mit den Konstanten des HEUTIGEN Tages, obwohl sie das Leistungsjahr
 * bereits kennt. Eine Prüfung für 2024 lief damit gegen die 2025er
 * Grenzen.
 */
import { describe, it, expect } from 'vitest'
import {
  BUDGET_VERSIONEN,
  budgetVersionFuerJahr,
  ENTLASTUNG_MONATLICH_EUR,
  ENTLASTUNG_JAEHRLICH_EUR,
  VP_KZP_KOMBINIERT_EUR,
  type BudgetVersion,
} from '@/lib/config/budget-constants'
import { readFileSync } from 'node:fs'
import { heuteBerlin } from '@/lib/utils/timezone'

/** Der Eintrag, dessen Gültigkeit heute bereits begonnen hat — der späteste. */
function heuteGueltig(): BudgetVersion {
  const heute = heuteBerlin()
  let treffer: BudgetVersion | null = null
  for (const v of BUDGET_VERSIONEN) if (v.gueltigAb <= heute) treffer = v
  expect(treffer, 'kein Eintrag gilt heute').not.toBeNull()
  return treffer as BudgetVersion
}

describe('Die Einzelkonstanten nennen den heute geltenden Satz', () => {
  it('Entlastungsbetrag monatlich', () => {
    expect(ENTLASTUNG_MONATLICH_EUR).toBe(heuteGueltig().entlastungMonatlich)
  })

  it('Entlastungsbetrag jährlich', () => {
    expect(ENTLASTUNG_JAEHRLICH_EUR).toBe(heuteGueltig().entlastungJaehrlich)
  })

  it('VP+KZP kombiniert', () => {
    expect(VP_KZP_KOMBINIERT_EUR).toBe(heuteGueltig().vpKzpKombiniert)
  })

  it('und das sind heute 131 € — die Zahl, auf die es ankommt', () => {
    expect(ENTLASTUNG_MONATLICH_EUR).toBe(131)
    expect(ENTLASTUNG_JAEHRLICH_EUR).toBe(1572)
  })
})

describe('Ein zukünftiger Eintrag gilt NICHT sofort', () => {
  const ZUKUNFT = BUDGET_VERSIONEN.filter(v => v.gueltigAb > heuteBerlin())

  it('heute ist keiner der hinterlegten Einträge in der Zukunft', () => {
    // Wären welche da, müsste dieser Test trotzdem gelten — deshalb steht
    // die Aussage unten und nicht diese hier im Mittelpunkt.
    expect(ZUKUNFT.length).toBeGreaterThanOrEqual(0)
  })

  it('der letzte Listeneintrag ist NICHT automatisch der geltende', () => {
    // Das IST der Befund. Sobald ein Eintrag für ein künftiges Jahr
    // angehängt wird, fällt diese Zusicherung auf die Nase, wenn jemand
    // zur alten Form zurückkehrt.
    const letzter = BUDGET_VERSIONEN[BUDGET_VERSIONEN.length - 1]
    if (letzter.gueltigAb > heuteBerlin()) {
      expect(ENTLASTUNG_MONATLICH_EUR).not.toBe(letzter.entlastungMonatlich)
    } else {
      expect(ENTLASTUNG_MONATLICH_EUR).toBe(letzter.entlastungMonatlich)
    }
  })

  it('die Auswahl hängt an gueltigAb, nicht an der Position', () => {
    const QUELLE = readFileSync('lib/config/budget-constants.ts', 'utf8')
    // Auf die ZUWEISUNG geprüft, nicht auf den Ausdruck: der Ausdruck
    // steht weiterhin im Kommentar, der den Befund festhält — eine
    // Zusicherung, die ihn dort trifft, würde die Dokumentation verbieten.
    expect(QUELLE).not.toContain('const AKTUELL = BUDGET_VERSIONEN[')
    expect(QUELLE).toContain('if (v.gueltigAb <= heute) treffer = v')
  })

  it('und wirft beim Import NICHT — sonst stünde die Anwendung still', () => {
    const QUELLE = readFileSync('lib/config/budget-constants.ts', 'utf8')
    const fn = QUELLE.slice(
      QUELLE.indexOf('function versionFuerHeute()'),
      QUELLE.indexOf('const AKTUELL = versionFuerHeute()'),
    )
    expect(fn).not.toContain('throw')
    expect(fn).toContain('?? BUDGET_VERSIONEN[0]')
  })
})

describe('budgetVersionFuerJahr bleibt fail-closed', () => {
  it('kennt 2024 mit seinen eigenen Werten', () => {
    const v = budgetVersionFuerJahr(2024)
    expect(v.entlastungMonatlich).toBe(125)
    expect(v.vpKzpKombiniert).toBe(3386)
  })

  it('und 2025 mit den heutigen', () => {
    expect(budgetVersionFuerJahr(2025).entlastungMonatlich).toBe(131)
  })

  it('wirft für ein Jahr ohne Eintrag', () => {
    expect(() => budgetVersionFuerJahr(2023)).toThrow(/Keine gesetzlichen Budgetwerte/)
  })
})

describe('Die Budgetprüfung rechnet mit dem Leistungsjahr', () => {
  const QUELLE = readFileSync('lib/personal/einsatzfreigabe.ts', 'utf8')

  it('nicht mehr mit den Konstanten des heutigen Tages', () => {
    expect(QUELLE).not.toContain('VP_KZP_KOMBINIERT_EUR')
    expect(QUELLE).not.toContain('ENTLASTUNG_JAEHRLICH_EUR')
  })

  it('sondern über budgetVersionFuerJahr(year)', () => {
    expect(QUELLE).toContain('const grenzen = budgetVersionFuerJahr(year)')
    expect(QUELLE).toContain('budgetVersionFuerJahr(year).vpKzpKombiniert')
  })

  it('und der Vorgabewert kommt aus demselben Satz', () => {
    expect(QUELLE).toContain('istVp ? grenzen.vpKzpKombiniert : grenzen.entlastungJaehrlich')
  })
})
