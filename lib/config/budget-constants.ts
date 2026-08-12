/**
 * Gesetzliche Budgetgrenzen für Pflegeleistungen.
 *
 * Quellen: SGB XI §§ 36, 39, 42, 42a, 45b
 * Stand: 01.07.2025 (PUEG — Gemeinsamer Jahresbetrag § 42a SGB XI)
 * Bei Gesetzesänderungen: Werte hier aktualisieren, NICHT im Code verstreut.
 */

/** § 45b SGB XI — Entlastungsbetrag: 131 €/Monat */
export const ENTLASTUNG_MONATLICH_EUR = 131

/** § 45b SGB XI — Entlastungsbetrag: 1.572 €/Kalenderjahr */
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
