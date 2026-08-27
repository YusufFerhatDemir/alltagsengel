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
  /** Uebertrag, soweit im Abrechnungsmonat noch nutzbar (EUR). */
  uebertragEuro: number
  monatsanspruchEuro: number | null
  verbrauchtBisMonatEuro: number
  verbrauchtJahrEuro: number
  /** Woher Anspruch und Uebertrag stammen — fuer den Audit-Trail. */
  anspruchQuelle: 'client_budgets' | 'gesetzlich'
  /** Stichtag, an dem der § 45b-Uebertrag verfaellt — `null` bei § 42a. */
  uebertragVerfaelltAm: string | null
  /**
   * true, wenn ein Uebertrag hinterlegt war, im Abrechnungsmonat aber nicht
   * mehr gilt. Steht getrennt neben `uebertragEuro: 0`, damit der Audit-Trail
   * „verfallen" von „gab es nie" unterscheiden kann.
   */
  uebertragVerfallen: boolean
}

/** Rechnungsstatus, die keinen Anspruch verbrauchen. */
const NICHT_VERBRAUCHENDE_STATUS = new Set(['storniert', 'abgeschrieben'])

function letzterTagDesMonats(periodMonth: string): string {
  const [jahr, monat] = periodMonth.split('-').map(Number)
  const tag = new Date(Date.UTC(jahr, monat, 0)).getUTCDate()
  return `${periodMonth}-${String(tag).padStart(2, '0')}`
}

// ---------------------------------------------------------------------------
// § 45b-Uebertrag: Verfall zum 30.06.
// ---------------------------------------------------------------------------

/**
 * Stichtag, an dem ein Uebertrag aus dem Vorjahr verfaellt (Monat-Tag).
 *
 * § 45b Abs. 1 S. 4 SGB XI: nicht verbrauchte Betraege des Entlastungs-
 * betrags koennen in das folgende Kalenderhalbjahr uebertragen werden und
 * sind bis zum 30. Juni des Folgejahres zu verwenden. Danach verfallen sie.
 *
 * § 42a (VP/KZP) kennt gar keinen Uebertrag — dort ist der Wert nie gesetzt.
 */
export const UEBERTRAG_VERFALL_MONAT_TAG = '06-30'

/**
 * Verfallstag des Uebertrags fuer ein Leistungsjahr.
 *
 * `client_budgets.carryover_expires` wird von `uebertrageJahresbudgets()`
 * gepflegt. Fehlt der Wert (Altbestand, manuell angelegte Zeile), gilt der
 * gesetzliche Stichtag — das ist kein geratener Ersatzwert, sondern die
 * Regel selbst. Ihn wegzulassen hiesse, den Uebertrag unbegrenzt zu gewaehren.
 */
export function uebertragVerfallsdatum(
  gespeichert: string | null | undefined,
  jahr: number,
): string {
  const wert = String(gespeichert ?? '').trim().slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(wert)) return wert
  return `${jahr}-${UEBERTRAG_VERFALL_MONAT_TAG}`
}

/**
 * Steht der Uebertrag im Abrechnungsmonat noch zur Verfuegung?
 *
 * Massgeblich ist der ERSTE Tag des Abrechnungsmonats: Leistungen aus dem
 * Juni sind bis zum 30.06. erbracht und duerfen den Uebertrag noch nutzen,
 * Leistungen aus dem Juli nicht mehr. Wer stattdessen auf das Rechnungs-
 * datum abstellte, liesse den Verfall davon abhaengen, wann jemand den
 * Rechnungslauf startet.
 */
export function uebertragGiltNoch(periodMonth: string, verfallsdatum: string): boolean {
  return `${periodMonth}-01` <= verfallsdatum
}
/**
 * Liest Anspruch, Uebertrag und bereits fakturierten Verbrauch.
 *
 * **Warum der Verbrauch nicht aus `client_budgets.used_amount` kommt:**
 * `used_amount` wird per Trigger aus `service_records` fortgeschrieben — also
 * aus Leistungen, die zum Zeitpunkt der Rechnung bereits gezaehlt sind. Als
 * Vorher-Wert wuerde es die gerade abzurechnenden Leistungen doppelt zaehlen.
 *
 * **Warum der Verbrauch je Rechnung aus `invoices.budget_amount` kommt und
 * nicht aus der Summe der `invoice_items` (Befund 27.08.2026):**
 * `wendeBudgetDeckelAn()` verschiebt den Ueberschuss einer gedeckelten
 * Rechnung von `budget_amount` nach `private_amount` — die POSITIONEN bleiben
 * dabei unveraendert und tragen weiter den Kassen-`budget_type`. Wer den
 * Verbrauch aus den Positionen summiert, zaehlt also auch den Teil mit, den
 * der Klient privat bezahlt hat. Beispiel: 300 EUR Leistungen im Januar,
 * gedeckelt auf 131 EUR Kassenanteil und 169 EUR privat. Im Februar meldete
 * die Positionssumme 300 EUR Verbrauch gegen einen kumulierten Anspruch von
 * 262 EUR — verfuegbar 0, obwohl tatsaechlich erst 131 EUR verbraucht waren.
 * Der Klient verlor Monat fuer Monat Budget, das er nie in Anspruch genommen
 * hatte. `budget_amount` ist der Betrag, der der Pflegekasse tatsaechlich in
 * Rechnung gestellt wurde.
 *
 * Die Positionen werden trotzdem gelesen: sie sagen, zu WELCHEM Topf eine
 * Rechnung gehoert (`invoices` fuehrt keinen budget_type). Nur wenn alle
 * Positionen einer Rechnung im geprueften Topf liegen, gilt ihr
 * `budget_amount`; sonst wird die Positionssumme genommen.
 *
 * **Gelöschte Rechnungen** (`deleted_at`) zaehlen nicht mehr mit. Sie taten es
 * vorher — ein geloeschter Entwurf verbrauchte dauerhaft Budget, obwohl die
 * Rechnungs-RPC ihn ueber die Idempotenz gar nicht mehr kennt.
 *
 * **Ersetzte Rechnungen**: eine Korrekturrechnung (`correction_type =
 * 'korrektur'`) traegt den vollstaendigen korrigierten Betrag, nicht die
 * Differenz. Zaehlte man Original UND Korrektur, verbrauchte eine Korrektur
 * das Budget ein zweites Mal. Das Original faellt deshalb heraus, sobald eine
 * Korrekturrechnung darauf zeigt. Eine Gutschrift (`'gutschrift'`) ersetzt
 * nichts und laesst das Original stehen.
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
    .select('annual_amount, carryover_amount, carryover_expires, combined_annual_amount')
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
  let uebertragVerfaelltAm: string | null = null
  let uebertragVerfallen = false
  let anspruchQuelle: BudgetLage['anspruchQuelle'] = 'gesetzlich'

  if (topf === 'entlastung') {
    const individuell = Number(budgetZeile?.annual_amount ?? 0)
    jahresanspruchEuro = individuell > 0 ? individuell : gesetz.entlastungJaehrlich
    anspruchQuelle = individuell > 0 ? 'client_budgets' : 'gesetzlich'

    // § 45b Abs. 1 S. 4 SGB XI: der Uebertrag aus dem Vorjahr ist bis zum
    // 30.06. zu verwenden. Er wurde hier bisher ganzjaehrig gewaehrt — eine
    // Rechnung fuer Oktober bekam denselben erhoehten Deckel wie eine fuer
    // Maerz, obwohl der Anspruch im Juli erloschen war.
    const rohUebertrag = Math.max(0, Number(budgetZeile?.carryover_amount ?? 0))
    uebertragVerfaelltAm = uebertragVerfallsdatum(
      budgetZeile?.carryover_expires as string | null | undefined,
      jahr,
    )
    const giltNoch = uebertragGiltNoch(periodMonth, uebertragVerfaelltAm)
    uebertragEuro = giltNoch ? rohUebertrag : 0
    uebertragVerfallen = !giltNoch && rohUebertrag > 0
  } else {
    const individuell = Number(budgetZeile?.combined_annual_amount ?? 0)
    jahresanspruchEuro = individuell > 0 ? individuell : gesetz.vpKzpKombiniert
    anspruchQuelle = individuell > 0 ? 'client_budgets' : 'gesetzlich'
    // § 42a kennt keinen Uebertrag — kein Verfallstag zu fuehren.
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
    .select('id, status, period_start, budget_amount, correction_of, correction_type')
    .eq('client_id', clientId)
    .eq('organization_id', organizationId)
    .gte('period_start', jahresBeginn)
    .lte('period_start', jahresEnde)
    .is('deleted_at', null)

  if (rechnungenError) {
    throw new BudgetLageNichtErmittelbarError(
      `bisherige Rechnungen nicht lesbar (${rechnungenError.message})`
    )
  }

  const nichtStorniert = (rechnungen ?? []).filter(
    r => !NICHT_VERBRAUCHENDE_STATUS.has(String(r.status ?? ''))
  )

  // Originale, auf die eine Korrekturrechnung zeigt, sind ersetzt.
  const ersetzt = new Set(
    nichtStorniert
      .filter(r => String(r.correction_type ?? '') === 'korrektur' && r.correction_of)
      .map(r => String(r.correction_of))
  )
  const relevant = nichtStorniert.filter(r => !ersetzt.has(String(r.id)))

  let verbrauchtJahrEuro = 0
  let verbrauchtBisMonatEuro = 0

  if (relevant.length > 0) {
    const rechnungNachId = new Map(relevant.map(r => [String(r.id), r]))

    const { data: posten, error: postenError } = await supabase
      .from('invoice_items')
      .select('invoice_id, amount, budget_type')
      .in('invoice_id', relevant.map(r => String(r.id)))

    if (postenError) {
      throw new BudgetLageNichtErmittelbarError(
        `bisherige Rechnungspositionen nicht lesbar (${postenError.message})`
      )
    }

    /** Positionslage je Rechnung: Summe im geprueften Topf + Fremdanteil. */
    const lageJeRechnung = new Map<string, { summeImTopf: number; nurImTopf: boolean }>()

    for (const p of posten ?? []) {
      const rechnungId = String(p.invoice_id)
      if (!rechnungNachId.has(rechnungId)) continue

      let postenTopf: BudgetTopf
      try {
        postenTopf = budgetTopfFuer(String(p.budget_type ?? ''))
      } catch {
        // Ein Altbestand mit unbekanntem budget_type darf den Deckel nicht
        // still weiten. Er zaehlt konservativ auf den geprueften Topf.
        postenTopf = topf
      }

      const betrag = Number(p.amount ?? 0)
      const eintrag = lageJeRechnung.get(rechnungId)
        ?? { summeImTopf: 0, nurImTopf: true }

      if (postenTopf === topf) {
        if (Number.isFinite(betrag)) eintrag.summeImTopf += betrag
      } else {
        eintrag.nurImTopf = false
      }

      lageJeRechnung.set(rechnungId, eintrag)
    }

    for (const [rechnungId, lage] of lageJeRechnung) {
      const rechnung = rechnungNachId.get(rechnungId)
      if (!rechnung) continue

      const kassenBetrag = Number(rechnung.budget_amount)
      // `budget_amount` gilt nur, wenn die ganze Rechnung im geprueften Topf
      // liegt — sonst enthaelt der Kopfbetrag auch fremde Toepfe. Ist er
      // nicht gesetzt (Korrekturrechnungen fuehren ihn nicht), bleibt die
      // Positionssumme massgeblich. `Math.min` deckelt zusaetzlich gegen
      // einen Kopfbetrag, der ueber der Positionssumme laege.
      const verbrauch =
        lage.nurImTopf
          && rechnung.budget_amount !== null
          && rechnung.budget_amount !== undefined
          && Number.isFinite(kassenBetrag)
          ? Math.min(kassenBetrag, lage.summeImTopf)
          : lage.summeImTopf

      if (verbrauch === 0) continue

      verbrauchtJahrEuro += verbrauch
      const start = String(rechnung.period_start ?? '')
      if (start && start <= monatsEnde) {
        verbrauchtBisMonatEuro += verbrauch
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
    uebertragVerfaelltAm,
    uebertragVerfallen,
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
