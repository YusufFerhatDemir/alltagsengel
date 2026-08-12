/**
 * Gesetzliche Budgetgrenzen für Pflegeleistungen.
 *
 * Quellen: SGB XI §§ 36, 39, 42, 45b (Stand 01.01.2025, Pflegestärkungsgesetz).
 * Bei Gesetzesänderungen: Werte hier aktualisieren, NICHT im Code verstreut.
 */

/** § 45b SGB XI — Entlastungsbetrag: 131 €/Monat */
export const ENTLASTUNG_MONATLICH_EUR = 131

/** § 45b SGB XI — Entlastungsbetrag: 1.572 €/Kalenderjahr */
export const ENTLASTUNG_JAEHRLICH_EUR = 1572

/** § 39 Abs. 1 SGB XI — Verhinderungspflege: 1.685 €/Kalenderjahr (seit 01.01.2025, PUEG +4,5%) */
export const VP_JAEHRLICH_EUR = 1685

/** § 42 SGB XI — Kurzzeitpflege: 1.854 €/Kalenderjahr (seit 01.01.2025, PUEG +4,5%) */
export const KZP_JAEHRLICH_EUR = 1854

/**
 * § 39 Abs. 1 S. 3 i.V.m. § 42 Abs. 2 S. 2 SGB XI — Maximales Kombinations-
 * budget VP + KZP: 3.539 €/Kalenderjahr (seit 01.01.2025, PUEG +4,5%).
 *
 * Seit der Pflegereform kann nicht verbrauchte Kurzzeitpflege auf die VP
 * übertragen werden und umgekehrt (bis zum Gesamtlimit).
 */
export const VP_KZP_KOMBINIERT_EUR = 3539

/** Budget-Typen für client_budgets.budget_type */
export type BudgetTyp = 'entlastung' | 'verhinderungspflege'
