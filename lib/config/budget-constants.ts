/**
 * Gesetzliche Budgetgrenzen für Pflegeleistungen.
 *
 * Quellen: SGB XI §§ 36, 39, 42, 42a, 45b
 * Gültig: 01.01.2025 – 31.12.2027 (nächste Dynamisierung §30 SGB XI voraussichtlich 01.01.2028)
 * Bei Gesetzesänderungen: neuen Eintrag in BUDGET_VERSIONEN anlegen, NICHT alte Werte überschreiben.
 */

export interface BudgetVersion {
  gueltigAb: string   // ISO-Datum (YYYY-MM-DD)
  gueltigBis: string   // ISO-Datum (YYYY-MM-DD), '9999-12-31' = aktuell
  entlastungMonatlich: number
  entlastungJaehrlich: number
  vpJaehrlich: number
  kzpJaehrlich: number
  vpKzpKombiniert: number
  minPflegegradVpKzp: number
}

export const BUDGET_VERSIONEN: BudgetVersion[] = [
  {
    gueltigAb: '2024-01-01',
    gueltigBis: '2024-12-31',
    entlastungMonatlich: 125,
    entlastungJaehrlich: 1500,
    vpJaehrlich: 1612,
    kzpJaehrlich: 1774,
    vpKzpKombiniert: 3386,
    minPflegegradVpKzp: 2,
  },
  {
    gueltigAb: '2025-01-01',
    gueltigBis: '9999-12-31',
    entlastungMonatlich: 131,
    entlastungJaehrlich: 1572,
    vpJaehrlich: 1685,
    kzpJaehrlich: 1854,
    vpKzpKombiniert: 3539,
    minPflegegradVpKzp: 2,
  },
]

export function budgetVersionFuerJahr(jahr: number): BudgetVersion {
  const stichtag = `${jahr}-01-01`
  for (let i = BUDGET_VERSIONEN.length - 1; i >= 0; i--) {
    if (BUDGET_VERSIONEN[i].gueltigAb <= stichtag) {
      return BUDGET_VERSIONEN[i]
    }
  }
  return BUDGET_VERSIONEN[BUDGET_VERSIONEN.length - 1]
}

/** § 45b SGB XI — Entlastungsbetrag: 131 €/Monat (seit 01.01.2025) */
export const ENTLASTUNG_MONATLICH_EUR = 131

/** § 45b SGB XI — Entlastungsbetrag: 1.572 €/Kalenderjahr (seit 01.01.2025) */
export const ENTLASTUNG_JAEHRLICH_EUR = 1572

/** § 39 Abs. 1 SGB XI — Rechnerischer VP-Anteil: 1.685 € (seit 01.01.2025, PUEG +4,5%).
 *  Seit 01.07.2025 nur noch Referenzwert — das operative Limit ist VP_KZP_KOMBINIERT_EUR. */
export const VP_JAEHRLICH_EUR = 1685

/** § 42 SGB XI — Rechnerischer KZP-Anteil: 1.854 € (seit 01.01.2025, PUEG +4,5%).
 *  Seit 01.07.2025 nur noch Referenzwert — das operative Limit ist VP_KZP_KOMBINIERT_EUR. */
export const KZP_JAEHRLICH_EUR = 1854

/**
 * § 42a SGB XI — Gemeinsamer Jahresbetrag VP + KZP: 3.539 €/Kalenderjahr.
 * Seit 01.07.2025 EIN flexibles Budget — frei aufteilbar zwischen VP und KZP.
 * Kann vollständig für VP oder vollständig für KZP genutzt werden.
 */
export const VP_KZP_KOMBINIERT_EUR = 3539

/** Budget-Typen für client_budgets.budget_type */
export type BudgetTyp = 'entlastung' | 'verhinderungspflege'
