/**
 * Gesetzliche Budgetgrenzen für Pflegeleistungen.
 *
 * Quellen: SGB XI §§ 36, 39, 42, 42a, 45b
 * Gültig: 01.01.2025 – 31.12.2027 (nächste Dynamisierung §30 SGB XI voraussichtlich 01.01.2028)
 *
 * ── Neue Werte eintragen (z. B. 2028) ──────────────────────────────────────
 * 1. gueltigBis des bisher offenen Eintrags von '9999-12-31' auf den letzten
 *    Tag des Vorjahres setzen (z. B. '2027-12-31').
 * 2. NEUEN Eintrag mit gueltigAb='2028-01-01', gueltigBis='9999-12-31'
 *    anhängen. Alte Werte NIEMALS überschreiben — Rechnungen und Budget-
 *    prüfungen vergangener Jahre müssen reproduzierbar bleiben.
 * 3. Nichts weiter: budgetVersionFuerJahr() findet den Eintrag automatisch.
 *
 * Fail-Closed: Für ein Jahr ohne passenden Eintrag wirft budgetVersionFuerJahr()
 * eine Exception. Es gibt bewusst KEINEN stillen Fallback auf den neuesten oder
 * ältesten Satz — ein falsches Budgetlimit erzeugt entweder unzulässige
 * Abrechnungen oder blockiert berechtigte Leistungen.
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

/** Frühestes Jahr, für das gesetzliche Werte hinterlegt sind. */
export const FRUEHESTES_BUDGETJAHR = 2024

export class BudgetVersionFehltError extends Error {
  public readonly jahr: number

  constructor(jahr: number) {
    const bekannt = BUDGET_VERSIONEN
      .map(v => `${v.gueltigAb.slice(0, 4)}–${v.gueltigBis === '9999-12-31' ? 'offen' : v.gueltigBis.slice(0, 4)}`)
      .join(', ')
    super(
      `Keine gesetzlichen Budgetwerte für das Jahr ${jahr} hinterlegt. `
      + `Bekannte Zeiträume: ${bekannt}. `
      + `Neue Werte in BUDGET_VERSIONEN (lib/config/budget-constants.ts) eintragen — `
      + `es wird bewusst kein Ersatzwert geraten.`
    )
    this.name = 'BudgetVersionFehltError'
    this.jahr = jahr
  }
}

/**
 * Liefert die für ein Leistungsjahr gültigen Budgetwerte.
 *
 * Fail-Closed: wirft BudgetVersionFehltError, wenn kein Eintrag das Jahr
 * abdeckt — kein Fallback auf einen benachbarten Zeitraum.
 */
export function budgetVersionFuerJahr(jahr: number): BudgetVersion {
  if (!Number.isInteger(jahr)) {
    throw new BudgetVersionFehltError(jahr)
  }

  // Ein Kalenderjahr ist genau dann abgedeckt, wenn der Eintrag am 01.01.
  // bereits gilt und am 31.12. noch gilt. Zeiträume in BUDGET_VERSIONEN
  // beginnen und enden immer auf Jahresgrenzen (§30 SGB XI dynamisiert zum
  // 01.01.) — ein unterjähriger Wechsel wäre nicht als Jahreswert darstellbar
  // und muss dann als eigener Mechanismus abgebildet werden.
  const jahresBeginn = `${jahr}-01-01`
  const jahresEnde = `${jahr}-12-31`

  for (let i = BUDGET_VERSIONEN.length - 1; i >= 0; i--) {
    const v = BUDGET_VERSIONEN[i]
    if (v.gueltigAb <= jahresBeginn && v.gueltigBis >= jahresEnde) {
      return v
    }
  }

  throw new BudgetVersionFehltError(jahr)
}

/**
 * Wie budgetVersionFuerJahr, liefert aber null statt zu werfen.
 * Für Aufrufer, die eine fehlende Version selbst als Warnung behandeln
 * (z. B. Vorschau-Ansichten). Abrechnungs- und Budgetprüfpfade nutzen
 * budgetVersionFuerJahr und lassen den Fehler durchschlagen.
 */
export function budgetVersionFuerJahrOderNull(jahr: number): BudgetVersion | null {
  try {
    return budgetVersionFuerJahr(jahr)
  } catch {
    return null
  }
}

/** Aktuell gültige Version — Quelle der Einzelkonstanten unten. */
const AKTUELL = BUDGET_VERSIONEN[BUDGET_VERSIONEN.length - 1]

/** § 45b SGB XI — Entlastungsbetrag: 131 €/Monat (seit 01.01.2025) */
export const ENTLASTUNG_MONATLICH_EUR = AKTUELL.entlastungMonatlich

/** § 45b SGB XI — Entlastungsbetrag: 1.572 €/Kalenderjahr (seit 01.01.2025) */
export const ENTLASTUNG_JAEHRLICH_EUR = AKTUELL.entlastungJaehrlich

/** § 39 Abs. 1 SGB XI — Rechnerischer VP-Anteil: 1.685 € (seit 01.01.2025, PUEG +4,5%).
 *  Seit 01.07.2025 nur noch Referenzwert — das operative Limit ist VP_KZP_KOMBINIERT_EUR. */
export const VP_JAEHRLICH_EUR = AKTUELL.vpJaehrlich

/** § 42 SGB XI — Rechnerischer KZP-Anteil: 1.854 € (seit 01.01.2025, PUEG +4,5%).
 *  Seit 01.07.2025 nur noch Referenzwert — das operative Limit ist VP_KZP_KOMBINIERT_EUR. */
export const KZP_JAEHRLICH_EUR = AKTUELL.kzpJaehrlich

/**
 * § 42a SGB XI — Gemeinsamer Jahresbetrag VP + KZP: 3.539 €/Kalenderjahr.
 * Seit 01.07.2025 EIN flexibles Budget — frei aufteilbar zwischen VP und KZP.
 * Kann vollständig für VP oder vollständig für KZP genutzt werden.
 */
export const VP_KZP_KOMBINIERT_EUR = AKTUELL.vpKzpKombiniert

/** Budget-Typen für client_budgets.budget_type */
export type BudgetTyp = 'entlastung' | 'verhinderungspflege'
