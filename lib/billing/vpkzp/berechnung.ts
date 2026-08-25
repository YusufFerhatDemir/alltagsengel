/**
 * VP/KZP — kombinierte Budget- und Tageberechnung
 *
 * Rein rechnend. Die einzige Stelle, an der die zwei Dimensionen
 * zusammenkommen:
 *
 *   GELD — § 42a SGB XI: EIN gemeinsamer Jahresbetrag (3.539 EUR seit
 *          01.01.2025) fuer Verhinderungs- UND Kurzzeitpflege. Was VP
 *          verbraucht, fehlt der KZP und umgekehrt. Der Betrag steht in
 *          lib/config/budget-constants.ts und wird hier nur gelesen.
 *
 *   TAGE — § 39 / § 42 SGB XI: ZWEI getrennte Kontingente je Kalenderjahr
 *          (siehe konstanten.ts). VP-Tage mindern das KZP-Kontingent NICHT.
 *
 * Beide Grenzen gelten gleichzeitig, und die jeweils engere entscheidet.
 * Ein Klient kann sein Tagekontingent voll haben, obwohl Geld uebrig ist
 * (viele guenstige Tage), und umgekehrt (wenige teure Tage).
 *
 * Kein Uebertrag ins Folgejahr: § 42a Abs. 1 SGB XI kennt einen
 * Jahresbetrag, keinen fortlaufenden Topf. Zum 01.01. beginnen Geld und
 * Tage neu — deshalb ist die saubere Zerlegung eines jahresuebergreifenden
 * Zeitraums (zeitraum.ts) Voraussetzung fuer jede Rechnung hier.
 */

import { aufCent } from '@/lib/geld'
import { budgetVersionFuerJahr } from '@/lib/config/budget-constants'
import {
  maxTageFuer,
  zeitVersionFuerJahr,
  type VpKzpArt,
} from './konstanten'

/**
 * Kaufmaennisch auf Cent runden — Betraege liegen als NUMERIC in EURO vor.
 *
 * Der frueher hier stehende `+ Number.EPSILON`-Trick war wirkungslos:
 * EPSILON ist der Double-Abstand bei 1.0, bei 100.5 ist der Abstand das
 * 64-fache. Die Rundung liegt jetzt in lib/geld.ts.
 */
export { aufCent }

/** Der in einem Kalenderjahr bereits verbrauchte Stand eines Klienten. */
export interface JahresStand {
  jahr: number
  /** Bereits verbrauchte Verhinderungspflege-Tage. */
  vpTageVerbraucht: number
  /** Bereits verbrauchte Kurzzeitpflege-Tage. */
  kzpTageVerbraucht: number
  /** Bereits verbrauchter Betrag Verhinderungspflege (EUR). */
  vpBetragVerbrauchtEuro: number
  /** Bereits verbrauchter Betrag Kurzzeitpflege (EUR). */
  kzpBetragVerbrauchtEuro: number
  /**
   * Abweichender gemeinsamer Jahresbetrag aus client_budgets
   * (combined_annual_amount). null/0/undefined → gesetzlicher Wert.
   */
  kombiniertesBudgetEuro?: number | null
}

export interface JahresLage {
  jahr: number
  /** Gemeinsamer Jahresbetrag § 42a (EUR). */
  kombiniertesBudgetEuro: number
  /** VP + KZP zusammen bereits verbraucht (EUR). */
  kombiniertVerbrauchtEuro: number
  /** Was von dem gemeinsamen Topf noch da ist (EUR, nie negativ). */
  kombiniertRestEuro: number
  vpBetragVerbrauchtEuro: number
  kzpBetragVerbrauchtEuro: number
  vpMaxTage: number
  vpTageVerbraucht: number
  vpTageRest: number
  kzpMaxTage: number
  kzpTageVerbraucht: number
  kzpTageRest: number
  /** Woher der Jahresbetrag stammt — fuer den Audit-Trail. */
  budgetQuelle: 'client_budgets' | 'gesetzlich'
  /** § 42a: false. Als Feld, damit ein spaeterer Rechtsstand greifen kann. */
  uebertragInsFolgejahr: boolean
}

/**
 * Ermittelt Rest-Budget und Rest-Tage eines Kalenderjahres.
 *
 * Fail-closed: fuer ein Jahr ohne gesetzliche Werte ODER ohne hinterlegte
 * Zeitkontingente wird geworfen (BudgetVersionFehltError bzw.
 * ZeitVersionFehltError). Ein geratenes Kontingent waere schlimmer als
 * eine abgelehnte Buchung.
 */
export function berechneJahresLage(stand: JahresStand): JahresLage {
  const gesetz = budgetVersionFuerJahr(stand.jahr)
  const zeit = zeitVersionFuerJahr(stand.jahr)

  const individuell = Number(stand.kombiniertesBudgetEuro ?? 0)
  const budgetQuelle: JahresLage['budgetQuelle'] =
    Number.isFinite(individuell) && individuell > 0 ? 'client_budgets' : 'gesetzlich'
  const kombiniertesBudgetEuro = aufCent(
    budgetQuelle === 'client_budgets' ? individuell : gesetz.vpKzpKombiniert,
  )

  const vpBetrag = Math.max(0, Number(stand.vpBetragVerbrauchtEuro) || 0)
  const kzpBetrag = Math.max(0, Number(stand.kzpBetragVerbrauchtEuro) || 0)
  const kombiniertVerbrauchtEuro = aufCent(vpBetrag + kzpBetrag)

  const vpTage = Math.max(0, Math.trunc(Number(stand.vpTageVerbraucht) || 0))
  const kzpTage = Math.max(0, Math.trunc(Number(stand.kzpTageVerbraucht) || 0))

  return {
    jahr: stand.jahr,
    kombiniertesBudgetEuro,
    kombiniertVerbrauchtEuro,
    kombiniertRestEuro: aufCent(Math.max(0, kombiniertesBudgetEuro - kombiniertVerbrauchtEuro)),
    vpBetragVerbrauchtEuro: aufCent(vpBetrag),
    kzpBetragVerbrauchtEuro: aufCent(kzpBetrag),
    vpMaxTage: zeit.vpMaxTage,
    vpTageVerbraucht: vpTage,
    vpTageRest: Math.max(0, zeit.vpMaxTage - vpTage),
    kzpMaxTage: zeit.kzpMaxTage,
    kzpTageVerbraucht: kzpTage,
    kzpTageRest: Math.max(0, zeit.kzpMaxTage - kzpTage),
    budgetQuelle,
    uebertragInsFolgejahr: zeit.uebertragInsFolgejahr,
  }
}

export interface BuchungsEingabe {
  art: VpKzpArt
  /** Leistungstage des Segments (aus zeitraum.teileNachKalenderjahr). */
  tage: number
  /** Betrag des Segments in EURO. */
  betragEuro: number
  /**
   * Tage dieses Segments, die im selben Jahr fuer dieselbe Leistungsart
   * bereits gezaehlt sind (Ueberschneidung mit einer bestehenden Buchung,
   * siehe zeitraum.findeUeberschneidungen). Sie zaehlen NICHT erneut auf
   * das Kontingent — das Geld dagegen schon, denn es sind zwei Leistungen.
   */
  bereitsGezaehlteTage?: number
}

export interface BuchungsErgebnis {
  art: VpKzpArt
  jahr: number
  /** Tage des Segments insgesamt. */
  tage: number
  /** Tage, die tatsaechlich auf das Kontingent zaehlen. */
  anrechenbareTage: number
  /** Tage, fuer die kein Kontingent mehr da ist. */
  tageUeberschuss: number
  tageReichen: boolean
  /** Angefragter Betrag (EUR). */
  betragEuro: number
  /** Betrag, der zulasten des gemeinsamen Topfes gehen kann (EUR). */
  budgetBetragEuro: number
  /** Betrag ueber dem Rest-Budget — privat zu tragen (EUR). */
  privatBetragEuro: number
  budgetReicht: boolean
  /** Jahreslage NACH dieser Buchung, sofern sie durchgefuehrt wird. */
  standNachher: JahresStand
  /** Kurztexte fuer Protokoll und Oberflaeche. */
  hinweise: string[]
}

/**
 * Rechnet EIN Jahressegment einer Buchung gegen die Jahreslage.
 *
 * Diese Funktion entscheidet NICHT, ob gebucht werden darf — das tut das
 * Pruefprotokoll. Sie sagt nur, was passen wuerde und was ueberlaeuft:
 * Tage getrennt je Leistungsart, Geld aus dem gemeinsamen Topf.
 *
 * Negative Betraege (Storno, Gutschrift) laufen ungedeckelt durch — sie
 * entlasten den Topf, sie verbrauchen ihn nicht. Gleiches Muster wie in
 * lib/billing/core/budget-cap.ts.
 */
export function berechneBuchung(lage: JahresLage, eingabe: BuchungsEingabe): BuchungsErgebnis {
  const { art } = eingabe
  const hinweise: string[] = []

  const tage = Math.max(0, Math.trunc(Number(eingabe.tage) || 0))
  const doppelt = Math.min(
    tage,
    Math.max(0, Math.trunc(Number(eingabe.bereitsGezaehlteTage) || 0)),
  )
  const zuZaehlendeTage = tage - doppelt
  if (doppelt > 0) {
    hinweise.push(
      `${doppelt} Tag(e) sind im Jahr ${lage.jahr} bereits fuer dieselbe Leistungsart `
      + `erfasst und zaehlen nicht erneut auf das Kontingent.`,
    )
  }

  const tageRest = art === 'verhinderungspflege' ? lage.vpTageRest : lage.kzpTageRest
  const maxTage = art === 'verhinderungspflege' ? lage.vpMaxTage : lage.kzpMaxTage
  const anrechenbareTage = Math.min(zuZaehlendeTage, tageRest)
  const tageUeberschuss = zuZaehlendeTage - anrechenbareTage
  const tageReichen = tageUeberschuss === 0

  if (!tageReichen) {
    hinweise.push(
      `Tageskontingent ${maxTage} Tage im Jahr ${lage.jahr} reicht fuer `
      + `${tageUeberschuss} Tag(e) nicht mehr aus (noch ${tageRest} Tag(e) frei).`,
    )
  }

  const betragEuro = aufCent(Number(eingabe.betragEuro) || 0)

  let budgetBetragEuro: number
  let privatBetragEuro: number
  if (betragEuro <= 0) {
    // Storno/Gutschrift: nicht deckeln.
    budgetBetragEuro = betragEuro
    privatBetragEuro = 0
  } else {
    budgetBetragEuro = aufCent(Math.min(betragEuro, lage.kombiniertRestEuro))
    privatBetragEuro = aufCent(betragEuro - budgetBetragEuro)
  }
  const budgetReicht = privatBetragEuro === 0

  if (!budgetReicht) {
    hinweise.push(
      `Gemeinsamer Jahresbetrag § 42a (${lage.kombiniertesBudgetEuro.toFixed(2)} EUR) ist `
      + `bis auf ${lage.kombiniertRestEuro.toFixed(2)} EUR verbraucht — `
      + `${privatBetragEuro.toFixed(2)} EUR sind nicht zulasten der Pflegekasse abrechenbar.`,
    )
  }

  const istVp = art === 'verhinderungspflege'
  const standNachher: JahresStand = {
    jahr: lage.jahr,
    vpTageVerbraucht: lage.vpTageVerbraucht + (istVp ? anrechenbareTage : 0),
    kzpTageVerbraucht: lage.kzpTageVerbraucht + (istVp ? 0 : anrechenbareTage),
    vpBetragVerbrauchtEuro: aufCent(lage.vpBetragVerbrauchtEuro + (istVp ? budgetBetragEuro : 0)),
    kzpBetragVerbrauchtEuro: aufCent(lage.kzpBetragVerbrauchtEuro + (istVp ? 0 : budgetBetragEuro)),
    kombiniertesBudgetEuro:
      lage.budgetQuelle === 'client_budgets' ? lage.kombiniertesBudgetEuro : null,
  }

  return {
    art,
    jahr: lage.jahr,
    tage,
    anrechenbareTage,
    tageUeberschuss,
    tageReichen,
    betragEuro,
    budgetBetragEuro,
    privatBetragEuro,
    budgetReicht,
    standNachher,
    hinweise,
  }
}

/**
 * Rechnet eine Folge von Segmenten nacheinander durch und liefert je
 * Kalenderjahr ein Ergebnis. Das ist der Weg fuer jahresuebergreifende
 * Zeitraeume: jedes Segment trifft auf den Stand SEINES Jahres, und der
 * Jahreswechsel setzt Geld wie Tage zurueck.
 */
export function berechneSegmente(
  staende: readonly JahresStand[],
  segmente: readonly (BuchungsEingabe & { jahr: number })[],
): BuchungsErgebnis[] {
  const standNachJahr = new Map<number, JahresStand>(staende.map(s => [s.jahr, s]))
  const ergebnisse: BuchungsErgebnis[] = []

  for (const segment of segmente) {
    const stand = standNachJahr.get(segment.jahr) ?? leererStand(segment.jahr)
    const lage = berechneJahresLage(stand)
    const ergebnis = berechneBuchung(lage, segment)
    standNachJahr.set(segment.jahr, ergebnis.standNachher)
    ergebnisse.push(ergebnis)
  }

  return ergebnisse
}

/** Ein Klient ohne Vorverbrauch im betreffenden Jahr. */
export function leererStand(jahr: number): JahresStand {
  return {
    jahr,
    vpTageVerbraucht: 0,
    kzpTageVerbraucht: 0,
    vpBetragVerbrauchtEuro: 0,
    kzpBetragVerbrauchtEuro: 0,
    kombiniertesBudgetEuro: null,
  }
}

/** Tageskontingent der Leistungsart — Durchreichung fuer Aufrufer. */
export { maxTageFuer }
