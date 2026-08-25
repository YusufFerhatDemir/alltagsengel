/**
 * Budgetdeckel im Rechnungsweg (§ 45b / § 42a SGB XI)
 *
 * ── Warum es diese Datei gibt ────────────────────────────────────────────
 * `create_invoice_draft_atomic()` kennt `client_budgets` nicht. Die RPC teilt
 * den Rechnungsbetrag ausschliesslich nach `service_records.budget_type` auf:
 * alles was nicht `private` ist, wird zum Kassenanteil — ungedeckelt. Eine
 * Rechnung ueber 400 EUR gegen § 45b fuer einen Monat entstand anstandslos
 * als Kassenanteil (Befund A-1, docs/ALLTAGSENGEL_RECHECK_2026-08-19.md).
 *
 * `pruefeBudget()` (lib/personal/einsatzfreigabe.ts) sitzt nur im
 * **Planungs**pfad, ist per `force_override` uebersteuerbar und rechnet
 * ausschliesslich jahresbasiert. Zwischen Planung und Rechnung lag keine
 * erneute Pruefung.
 *
 * ── Was hier passiert ────────────────────────────────────────────────────
 * Vor der Rechnungserstellung wird die Budgetlage des Klienten ermittelt
 * (Anspruch, Uebertrag, bereits fakturierter Verbrauch). Nach der atomaren
 * RPC wird der Kassenanteil auf den verfuegbaren Anspruch gedeckelt; der
 * Ueberschuss wandert nach `private_amount`. **Es wird nicht blockiert** —
 * die Leistung wurde erbracht und ist abzurechnen, nur eben nicht zulasten
 * eines Anspruchs, der nicht besteht.
 *
 * ── Monatlich, nicht nur jaehrlich ───────────────────────────────────────
 * Der Entlastungsbetrag nach § 45b entsteht mit **131 EUR je Kalendermonat**
 * und ist erst danach uebertragbar. Wer im Januar 1.572 EUR abrechnet,
 * greift auf noch nicht entstandene Ansprueche zu. Deshalb gilt fuer
 * § 45b ein kumulierter Monatsdeckel (Monatsbetrag x Monatsindex + Uebertrag)
 * **zusaetzlich** zum Jahresdeckel; der jeweils engere greift.
 *
 * § 42a (Verhinderungs-/Kurzzeitpflege) kennt seit 01.07.2025 **einen**
 * flexiblen Jahresbetrag (3.539 EUR) ohne Monatsstaffelung und ohne
 * Uebertrag — dort greift nur der Jahresdeckel.
 *
 * ── Fail-Closed ──────────────────────────────────────────────────────────
 * Die Budgetlage wird **vor** der RPC gelesen. Ist sie nicht ermittelbar
 * (Lesefehler, unbekannter Budget-Typ, Jahr ohne gesetzliche Werte), wird
 * geworfen, bevor irgendetwas angelegt ist. Eine Rechnung mit unbelegter
 * Aufteilung entsteht so gar nicht erst.
 *
 * Beträge sind durchgaengig EURO (numerisch), nicht Cent — so liegen sie in
 * `invoices.total_amount` / `budget_amount` / `private_amount` und in
 * `client_budgets`.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { aufCent } from '@/lib/geld'
import { budgetVersionFuerJahr } from '@/lib/config/budget-constants'

// ---------------------------------------------------------------------------
// Budget-Töpfe
// ---------------------------------------------------------------------------

/**
 * Der Anspruchstopf hinter einem `budget_type`.
 *
 * Massgeblich ist die Liste, die alle Rechnungs-RPCs selbst fuehren
 * (`Erlaubt: entlastung, verhinderung, carryover, haeusliche_pflege_36,
 * private` — u. a. 20260914000000_audit_persistenz_v9.sql:174).
 *
 * `carryover` ist **kein eigener Anspruch**, sondern der Uebertrag desselben
 * § 45b-Topfes aus dem Vorjahr. Er wird deshalb mit `entlastung` zusammen
 * gedeckelt — sonst waere der Uebertrag ein zweites, unbegrenztes Budget.
 *
 * `sachleistung_36` (§ 36 SGB XI, Pflegesachleistung) hat **bewusst keinen
 * Deckel**: der Anspruch ist pflegegradabhaengig und in diesem Repo sind
 * dafuer keine gesetzlichen Saetze hinterlegt. Einen Betrag zu erfinden waere
 * schlimmer als kein Deckel — er saehe geprueft aus. Siehe
 * `UNGEDECKELTE_TOEPFE`.
 */
export type BudgetTopf = 'entlastung' | 'verhinderung' | 'sachleistung_36' | 'privat'

/** Toepfe, fuer die ein Anspruch gerechnet und gedeckelt wird. */
export type GedeckelterTopf = 'entlastung' | 'verhinderung'

/** Alle `budget_type`-Werte, die auf den § 45b-Topf zeigen. */
export const ENTLASTUNG_BUDGET_TYPEN = ['entlastung', 'carryover'] as const

/** Alle `budget_type`-Werte, die auf den § 42a-Topf zeigen. */
export const VERHINDERUNG_BUDGET_TYPEN = ['verhinderung', 'verhinderungspflege', 'kurzzeitpflege'] as const

/** `budget_type`-Werte fuer § 36 SGB XI (Pflegesachleistung). */
export const SACHLEISTUNG_36_BUDGET_TYPEN = ['haeusliche_pflege_36'] as const

/** `budget_type`-Werte ohne Kassenbezug. */
export const PRIVAT_BUDGET_TYPEN = ['private', 'privat', 'selbstzahler'] as const

/**
 * Toepfe, die dieser Deckel **nicht** begrenzt — mit dem Grund, warum nicht.
 * Bewusst als Datenstruktur und nicht als Kommentar: so faellt beim Lesen des
 * Codes und im Test auf, dass hier eine Luecke *bekannt* ist.
 */
export const UNGEDECKELTE_TOEPFE: Record<Exclude<BudgetTopf, GedeckelterTopf>, string> = {
  privat: 'Selbstzahlerleistung — es gibt keinen Kassenanspruch zu begrenzen.',
  sachleistung_36:
    '§ 36 SGB XI ist pflegegradabhaengig; die Saetze sind in lib/config/budget-constants.ts '
    + 'nicht hinterlegt. Es wird bewusst kein Betrag geraten. Solange das so ist, laeuft '
    + 'dieser Topf ungedeckelt durch — vor dem ersten Sachleistungsvertrag zu schliessen.',
}

export class UnbekannterBudgetTypError extends Error {
  public readonly budgetType: string

  constructor(budgetType: string) {
    super(
      `Unbekannter budget_type "${budgetType}" — der Budgetdeckel kann nicht bestimmt werden. `
      + `Erlaubt: ${[
        ...ENTLASTUNG_BUDGET_TYPEN,
        ...VERHINDERUNG_BUDGET_TYPEN,
        ...SACHLEISTUNG_36_BUDGET_TYPEN,
        ...PRIVAT_BUDGET_TYPEN,
      ].join(', ')}. `
      + `Es wird bewusst kein Topf geraten: ein falsch zugeordneter Anspruch erzeugt `
      + `eine unzulaessige Kassenforderung.`
    )
    this.name = 'UnbekannterBudgetTypError'
    this.budgetType = budgetType
  }
}

/**
 * Ordnet einen `budget_type` seinem Anspruchstopf zu.
 * Fail-closed: unbekannte Werte werfen, statt still als `privat` zu gelten.
 */
export function budgetTopfFuer(budgetType: string): BudgetTopf {
  const wert = String(budgetType || '').trim().toLowerCase()
  if ((ENTLASTUNG_BUDGET_TYPEN as readonly string[]).includes(wert)) return 'entlastung'
  if ((VERHINDERUNG_BUDGET_TYPEN as readonly string[]).includes(wert)) return 'verhinderung'
  if ((SACHLEISTUNG_36_BUDGET_TYPEN as readonly string[]).includes(wert)) return 'sachleistung_36'
  if ((PRIVAT_BUDGET_TYPEN as readonly string[]).includes(wert)) return 'privat'
  throw new UnbekannterBudgetTypError(budgetType)
}

/** true, wenn fuer diesen Topf ein Anspruch gerechnet werden kann. */
export function istGedeckelt(topf: BudgetTopf): topf is GedeckelterTopf {
  return topf === 'entlastung' || topf === 'verhinderung'
}

// ---------------------------------------------------------------------------
// Reine Rechenlogik
// ---------------------------------------------------------------------------

export interface BudgetDeckelEingabe {
  /** Anspruchstopf — ungedeckelte Toepfe erreichen diese Funktion nicht. */
  topf: GedeckelterTopf
  /** Abrechnungsmonat als `YYYY-MM`. */
  periodMonth: string
  /** Kassenanteil, den die RPC ausgewiesen hat (EUR). */
  kassenBetragEuro: number
  /** Jahresanspruch (EUR) — aus `client_budgets` oder gesetzlich. */
  jahresanspruchEuro: number
  /** Monatsanspruch (EUR) — nur § 45b; bei § 42a `null`. */
  monatsanspruchEuro: number | null
  /** Uebertrag aus dem Vorjahr (EUR) — nur § 45b. */
  uebertragEuro: number
  /** Bereits fakturierter Verbrauch bis einschliesslich Abrechnungsmonat (EUR). */
  verbrauchtBisMonatEuro: number
  /** Bereits fakturierter Verbrauch im gesamten Kalenderjahr (EUR). */
  verbrauchtJahrEuro: number
}

export interface BudgetDeckelErgebnis {
  /** Kassenanteil nach Deckelung (EUR). */
  budgetAnteilEuro: number
  /** Was zusaetzlich privat zu tragen ist (EUR) — der abgeschnittene Ueberschuss. */
  privatAnteilEuro: number
  /** Betrag, der vom Kassenanteil in den Privatanteil verschoben wurde (EUR). */
  ueberschussEuro: number
  /** true, wenn tatsaechlich verschoben wurde. */
  gedeckelt: boolean
  /** Klartext fuer Audit-Trail und Rechnungsnotiz. */
  grund: string | null
  /** Verfuegbarer Anspruch zum Zeitpunkt der Rechnung (EUR, nie negativ). */
  verfuegbarEuro: number
  /** Kumulierter Monatsdeckel inkl. Uebertrag (EUR) — `null` bei § 42a. */
  limitBisMonatEuro: number | null
  /** Jahresdeckel inkl. Uebertrag (EUR). */
  limitJahrEuro: number
  /** Welcher der beiden Deckel gegriffen hat. */
  greifenderDeckel: 'monat' | 'jahr' | null
}

// Die frueher hier stehende Eigenbau-Rundung
// `Math.round((betrag + Number.EPSILON) * 100) / 100` ist ersatzlos
// entfallen. Sie war nicht durchgehend falsch — genau das machte sie
// gefaehrlich: fuer 1,005 € und 2,675 € lieferte sie zufaellig das
// richtige Ergebnis, fuer 8,575 € aber 8,57 € statt 8,58 €. Number.EPSILON
// ist der Double-Abstand *bei 1.0*; je groesser der Betrag, desto weniger
// richtet der Summand aus.
//
// Bei NEGATIVEN Betraegen schiebt er zusaetzlich in die falsche Richtung:
// -1,005 € wurde zu -1,00 €, waehrend +1,005 € zu 1,01 € wurde. Eine
// Gutschrift war damit einen Cent kleiner als die Rechnung, die sie
// ausgleichen soll.
//
// aufCent() aus lib/geld.ts verschiebt das Komma stattdessen auf der
// Dezimal-Zeichenkette und rundet symmetrisch (DIN 1333).

function monatsIndex(periodMonth: string): number {
  const treffer = /^(\d{4})-(\d{2})$/.exec(String(periodMonth || ''))
  if (!treffer) {
    throw new Error(`Abrechnungsmonat "${periodMonth}" ist kein YYYY-MM — Budgetdeckel nicht bestimmbar.`)
  }
  const monat = Number(treffer[2])
  if (monat < 1 || monat > 12) {
    throw new Error(`Abrechnungsmonat "${periodMonth}" liegt ausserhalb 01–12.`)
  }
  return monat
}

/**
 * Berechnet die Aufteilung Kassen-/Privatanteil unter Beachtung von
 * Monats- und Jahresdeckel. Rein rechnend — kein DB-Zugriff, keine Seiteneffekte.
 *
 * Sonderfall **negativer Kassenbetrag**: Storno- und Gutschriftbelege tragen
 * negative Betraege. Sie *entlasten* das Budget, sie verbrauchen es nicht —
 * ein Deckel darauf waere sinnlos und wuerde die Gutschrift verfaelschen.
 * Solche Betraege bleiben unveraendert.
 */
export function berechneBudgetDeckel(eingabe: BudgetDeckelEingabe): BudgetDeckelErgebnis {
  const {
    topf,
    periodMonth,
    kassenBetragEuro,
    jahresanspruchEuro,
    monatsanspruchEuro,
    uebertragEuro,
    verbrauchtBisMonatEuro,
    verbrauchtJahrEuro,
  } = eingabe

  const monat = monatsIndex(periodMonth)

  // § 42a kennt keinen Uebertrag (§ 42a Abs. 1 SGB XI: ein Jahresbetrag).
  const uebertrag = topf === 'entlastung' ? Math.max(0, Number(uebertragEuro) || 0) : 0

  const limitJahrEuro = aufCent(Math.max(0, Number(jahresanspruchEuro) || 0) + uebertrag)

  const limitBisMonatEuro =
    topf === 'entlastung' && monatsanspruchEuro !== null && monatsanspruchEuro !== undefined
      ? aufCent(Math.max(0, Number(monatsanspruchEuro) || 0) * monat + uebertrag)
      : null

  const verfuegbarJahr = limitJahrEuro - (Number(verbrauchtJahrEuro) || 0)
  const verfuegbarMonat =
    limitBisMonatEuro === null
      ? Number.POSITIVE_INFINITY
      : limitBisMonatEuro - (Number(verbrauchtBisMonatEuro) || 0)

  const verfuegbarRoh = Math.min(verfuegbarJahr, verfuegbarMonat)
  const verfuegbarEuro = aufCent(Math.max(0, verfuegbarRoh))

  const kassenBetrag = aufCent(Number(kassenBetragEuro) || 0)

  // Gutschrift/Storno: nicht deckeln (siehe Docstring).
  if (kassenBetrag <= 0) {
    return {
      budgetAnteilEuro: kassenBetrag,
      privatAnteilEuro: 0,
      ueberschussEuro: 0,
      gedeckelt: false,
      grund: null,
      verfuegbarEuro,
      limitBisMonatEuro,
      limitJahrEuro,
      greifenderDeckel: null,
    }
  }

  if (kassenBetrag <= verfuegbarEuro) {
    return {
      budgetAnteilEuro: kassenBetrag,
      privatAnteilEuro: 0,
      ueberschussEuro: 0,
      gedeckelt: false,
      grund: null,
      verfuegbarEuro,
      limitBisMonatEuro,
      limitJahrEuro,
      greifenderDeckel: null,
    }
  }

  const budgetAnteilEuro = verfuegbarEuro
  const ueberschussEuro = aufCent(kassenBetrag - verfuegbarEuro)
  const greifenderDeckel: 'monat' | 'jahr' =
    verfuegbarMonat < verfuegbarJahr ? 'monat' : 'jahr'

  const bezeichnung = topf === 'entlastung'
    ? 'Entlastungsbetrag § 45b SGB XI'
    : 'Verhinderungs-/Kurzzeitpflege § 42a SGB XI'

  const grund = greifenderDeckel === 'monat'
    ? `${bezeichnung}: Monatsanspruch bis ${periodMonth} ausgeschoepft `
      + `(Anspruch kumuliert ${limitBisMonatEuro?.toFixed(2)} EUR, bereits abgerechnet `
      + `${aufCent(Number(verbrauchtBisMonatEuro) || 0).toFixed(2)} EUR). `
      + `${ueberschussEuro.toFixed(2)} EUR als Privatanteil ausgewiesen.`
    : `${bezeichnung}: Jahresanspruch ausgeschoepft `
      + `(Anspruch ${limitJahrEuro.toFixed(2)} EUR, bereits abgerechnet `
      + `${aufCent(Number(verbrauchtJahrEuro) || 0).toFixed(2)} EUR). `
      + `${ueberschussEuro.toFixed(2)} EUR als Privatanteil ausgewiesen.`

  return {
    budgetAnteilEuro,
    privatAnteilEuro: ueberschussEuro,
    ueberschussEuro,
    gedeckelt: true,
    grund,
    verfuegbarEuro,
    limitBisMonatEuro,
    limitJahrEuro,
    greifenderDeckel,
  }
}

// ---------------------------------------------------------------------------
// Budgetlage aus der Datenbank
// ---------------------------------------------------------------------------

export class BudgetLageNichtErmittelbarError extends Error {
  constructor(grund: string) {
    super(
      `Budgetlage nicht ermittelbar: ${grund}. `
      + `Die Rechnung wurde NICHT erstellt — eine Kassenforderung ohne pruefbaren `
      + `Anspruch waere schlimmer als eine ausbleibende Rechnung.`
    )
    this.name = 'BudgetLageNichtErmittelbarError'
  }
}

export interface BudgetLage {
  topf: GedeckelterTopf
  jahr: number
  periodMonth: string
  jahresanspruchEuro: number
  monatsanspruchEuro: number | null
  uebertragEuro: number
  verbrauchtBisMonatEuro: number
  verbrauchtJahrEuro: number
  /** Woher Anspruch und Uebertrag stammen — fuer den Audit-Trail. */
  anspruchQuelle: 'client_budgets' | 'gesetzlich'
}

/** Rechnungsstatus, die keinen Anspruch verbrauchen. */
const NICHT_VERBRAUCHENDE_STATUS = new Set(['storniert', 'abgeschrieben'])

function letzterTagDesMonats(periodMonth: string): string {
  const [jahr, monat] = periodMonth.split('-').map(Number)
  const tag = new Date(Date.UTC(jahr, monat, 0)).getUTCDate()
  return `${periodMonth}-${String(tag).padStart(2, '0')}`
}

/**
 * Liest Anspruch, Uebertrag und bereits fakturierten Verbrauch.
 *
 * **Warum der Verbrauch aus `invoice_items` kommt und nicht aus
 * `client_budgets.used_amount`:** `used_amount` wird per Trigger aus
 * `service_records` fortgeschrieben — also aus Leistungen, die zum Zeitpunkt
 * der Rechnung bereits gezaehlt sind. Als Vorher-Wert wuerde es die gerade
 * abzurechnenden Leistungen doppelt zaehlen. `invoice_items.amount` ist das,
 * was tatsaechlich in Rechnung gestellt wurde.
 *
 * Fail-closed: jeder Lesefehler wirft. Aufrufer rufen diese Funktion **vor**
 * der Rechnungs-RPC auf, damit im Fehlerfall nichts angelegt ist.
 */
export async function ermittleBudgetLage(
  supabase: SupabaseClient,
  params: {
    clientId: string
    organizationId: string
    periodMonth: string
    topf: GedeckelterTopf
  }
): Promise<BudgetLage> {
  const { clientId, organizationId, periodMonth, topf } = params

  const monat = monatsIndex(periodMonth)  // validiert das Format
  const jahr = Number(periodMonth.slice(0, 4))
  const jahresBeginn = `${jahr}-01-01`
  const jahresEnde = `${jahr}-12-31`
  const monatsEnde = letzterTagDesMonats(periodMonth)
  void monat

  // ── 1. Gesetzliche Werte (fail-closed fuer Jahre ohne Eintrag) ──────
  const gesetz = budgetVersionFuerJahr(jahr)

  // ── 2. Individueller Anspruch aus client_budgets ────────────────────
  const { data: budgetZeile, error: budgetError } = await supabase
    .from('client_budgets')
    .select('annual_amount, carryover_amount, combined_annual_amount')
    .eq('client_id', clientId)
    .eq('organization_id', organizationId)
    .eq('year', jahr)
    .maybeSingle()

  if (budgetError) {
    throw new BudgetLageNichtErmittelbarError(
      `client_budgets nicht lesbar (${budgetError.message})`
    )
  }

  let jahresanspruchEuro: number
  let uebertragEuro = 0
  let anspruchQuelle: BudgetLage['anspruchQuelle'] = 'gesetzlich'

  if (topf === 'entlastung') {
    const individuell = Number(budgetZeile?.annual_amount ?? 0)
    jahresanspruchEuro = individuell > 0 ? individuell : gesetz.entlastungJaehrlich
    uebertragEuro = Math.max(0, Number(budgetZeile?.carryover_amount ?? 0))
    anspruchQuelle = individuell > 0 ? 'client_budgets' : 'gesetzlich'
  } else {
    const individuell = Number(budgetZeile?.combined_annual_amount ?? 0)
    jahresanspruchEuro = individuell > 0 ? individuell : gesetz.vpKzpKombiniert
    anspruchQuelle = individuell > 0 ? 'client_budgets' : 'gesetzlich'
  }

  // Der Monatsanspruch wird NICHT aus client_budgets abgeleitet:
  // monthly_amount steht dort als Anzeigewert und wurde nirgends gepflegt.
  // Massgeblich ist der gesetzliche Monatsbetrag — bei abweichendem
  // Jahresanspruch anteilig (Jahresanspruch / 12), damit Monats- und
  // Jahresdeckel nicht auseinanderlaufen.
  const monatsanspruchEuro = topf === 'entlastung'
    ? (anspruchQuelle === 'client_budgets'
        ? aufCent(jahresanspruchEuro / 12)
        : gesetz.entlastungMonatlich)
    : null

  // ── 3. Bereits fakturierter Verbrauch ───────────────────────────────
  const { data: rechnungen, error: rechnungenError } = await supabase
    .from('invoices')
    .select('id, status, period_start')
    .eq('client_id', clientId)
    .eq('organization_id', organizationId)
    .gte('period_start', jahresBeginn)
    .lte('period_start', jahresEnde)

  if (rechnungenError) {
    throw new BudgetLageNichtErmittelbarError(
      `bisherige Rechnungen nicht lesbar (${rechnungenError.message})`
    )
  }

  const relevant = (rechnungen ?? []).filter(
    r => !NICHT_VERBRAUCHENDE_STATUS.has(String(r.status ?? ''))
  )

  let verbrauchtJahrEuro = 0
  let verbrauchtBisMonatEuro = 0

  if (relevant.length > 0) {
    const startNachId = new Map(relevant.map(r => [String(r.id), String(r.period_start ?? '')]))

    const { data: posten, error: postenError } = await supabase
      .from('invoice_items')
      .select('invoice_id, amount, budget_type')
      .in('invoice_id', relevant.map(r => String(r.id)))

    if (postenError) {
      throw new BudgetLageNichtErmittelbarError(
        `bisherige Rechnungspositionen nicht lesbar (${postenError.message})`
      )
    }

    for (const p of posten ?? []) {
      let postenTopf: BudgetTopf
      try {
        postenTopf = budgetTopfFuer(String(p.budget_type ?? ''))
      } catch {
        // Ein Altbestand mit unbekanntem budget_type darf den Deckel nicht
        // still weiten. Er zaehlt konservativ auf den geprueften Topf.
        postenTopf = topf
      }
      if (postenTopf !== topf) continue

      const betrag = Number(p.amount ?? 0)
      if (!Number.isFinite(betrag)) continue

      verbrauchtJahrEuro += betrag
      const start = startNachId.get(String(p.invoice_id)) ?? ''
      if (start && start <= monatsEnde) {
        verbrauchtBisMonatEuro += betrag
      }
    }
  }

  return {
    topf,
    jahr,
    periodMonth,
    jahresanspruchEuro: aufCent(jahresanspruchEuro),
    monatsanspruchEuro,
    uebertragEuro: aufCent(uebertragEuro),
    verbrauchtBisMonatEuro: aufCent(verbrauchtBisMonatEuro),
    verbrauchtJahrEuro: aufCent(verbrauchtJahrEuro),
    anspruchQuelle,
  }
}

/** Verbindet Budgetlage und Rechnungsbetrag zum Deckelergebnis. */
export function deckelAusLage(lage: BudgetLage, kassenBetragEuro: number): BudgetDeckelErgebnis {
  return berechneBudgetDeckel({
    topf: lage.topf,
    periodMonth: lage.periodMonth,
    kassenBetragEuro,
    jahresanspruchEuro: lage.jahresanspruchEuro,
    monatsanspruchEuro: lage.monatsanspruchEuro,
    uebertragEuro: lage.uebertragEuro,
    verbrauchtBisMonatEuro: lage.verbrauchtBisMonatEuro,
    verbrauchtJahrEuro: lage.verbrauchtJahrEuro,
  })
}
