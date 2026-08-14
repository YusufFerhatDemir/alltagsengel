// ═══════════════════════════════════════════════════════════════
// PflegeCoach — Bestellung, Laufzeit, Widerruf, Kündigung
//
// Reine Rechenlogik ohne Datenbank- und ohne Stripe-Zugriff: Jede
// Funktion bekommt die Zeile bzw. die Daten übergeben und liefert eine
// Entscheidung zurück. So ist der gesamte Vertragsverlauf ohne Netz und
// ohne Datenbank testbar — und die Fristen sind an genau einer Stelle
// nachlesbar statt über Routen und Seiten verteilt.
//
// ═══ WIDERRUF: VOLLE 14 TAGE, KEIN VORZEITIGES ERLÖSCHEN ═══════
// Bei digitalen Dienstleistungen kann das Widerrufsrecht vorzeitig
// erlöschen, wenn die Verbraucherin ausdrücklich dem sofortigen Beginn
// zustimmt UND ihre Kenntnis vom Verlust des Widerrufsrechts bestätigt
// (§ 356 Abs. 4 BGB). Dieser Weg wird hier BEWUSST NICHT beschritten:
//
//   * Die Zielgruppe sind pflegebedürftige Menschen und ihre
//     Angehörigen, oft in einer Ausnahmesituation. Ein Kaufabschluss,
//     bei dem nebenbei das Widerrufsrecht abbestellt wird, wäre formal
//     zulässig und trotzdem falsch.
//   * Der Verzicht spart nichts: Der Zugang wird sofort freigeschaltet,
//     der Widerruf erstattet vollständig. Das Risiko trägt der
//     Hersteller, nicht die Kundin.
//
// Folge: `widerrufMoeglich()` prüft ausschließlich die Frist, nie eine
// Verzichtserklärung. Es gibt im gesamten Bestellweg keine Checkbox,
// mit der das Widerrufsrecht abbedungen werden könnte.
//
// ═══ ZWEI VERSCHIEDENE BEENDIGUNGEN ════════════════════════════
//  * WIDERRUF (§ 355 BGB): innerhalb von 14 Tagen ab Vertragsschluss.
//    Wirkt SOFORT, der Zugang endet sofort, es wird vollständig
//    erstattet. Der Vertrag gilt als nie geschlossen.
//  * KÜNDIGUNG: jederzeit, wirkt zum ENDE des bezahlten Zeitraums.
//    Der Zugang bleibt bis dahin bestehen — es wird nichts erstattet,
//    weil die Leistung bis dahin erbracht wird.
// Beides ist getrennt gehalten, weil die Rechtsfolgen gegensätzlich
// sind und eine Vermischung entweder Geld verschenkt oder Geld
// einbehält, das nicht einbehalten werden darf.
// ═══════════════════════════════════════════════════════════════

import type { CoachTarifKey } from './pricing'

/** Widerrufsfrist in Tagen (§ 355 Abs. 2 BGB). */
export const WIDERRUFSFRIST_TAGE = 14

export type BestellStatus =
  /** Checkout gestartet, Zahlung noch nicht bestätigt. Kein Zugang. */
  | 'offen'
  /** Bezahlt und laufend. Zugang aktiv. */
  | 'aktiv'
  /** Gekündigt, läuft bis `laufzeit_bis` weiter. Zugang bis dahin aktiv. */
  | 'gekuendigt'
  /** Laufzeit abgelaufen, keine Verlängerung. Kein Zugang. */
  | 'abgelaufen'
  /** Innerhalb der Frist widerrufen. Zugang sofort beendet, Geld zurück. */
  | 'widerrufen'
  /** Zahlung fehlgeschlagen, Nachfrist läuft. Zugang vorerst weiter. */
  | 'zahlung_offen'
  /** Nach erfolgloser Nachfrist gesperrt. Kein Zugang. */
  | 'gesperrt'

export const BESTELL_STATUS_LABELS: Record<BestellStatus, string> = {
  offen: 'Bestellung noch nicht abgeschlossen',
  aktiv: 'Aktiv',
  gekuendigt: 'Gekündigt — läuft noch',
  abgelaufen: 'Abgelaufen',
  widerrufen: 'Widerrufen',
  zahlung_offen: 'Zahlung offen',
  gesperrt: 'Gesperrt',
}

/**
 * Erklärtext je Status — für die Kontoseite. Bewusst hier und nicht in
 * der Seite: Der Text beschreibt eine Rechtsfolge, er gehört zur Logik.
 */
export const BESTELL_STATUS_ERKLAERUNG: Record<BestellStatus, string> = {
  offen:
    'Ihre Bestellung ist noch nicht abgeschlossen. Sobald die Zahlung bestätigt ist, schalten wir Ihren Zugang frei.',
  aktiv:
    'Ihr Zugang ist freigeschaltet. Sie können alle Bereiche des PflegeCoach nutzen.',
  gekuendigt:
    'Sie haben gekündigt. Ihr Zugang bleibt bis zum Ende des bezahlten Zeitraums bestehen und verlängert sich danach nicht.',
  abgelaufen:
    'Ihr Zugang ist abgelaufen. Ihre bisherigen Daten bleiben erhalten und können jederzeit heruntergeladen oder gelöscht werden.',
  widerrufen:
    'Sie haben Ihre Bestellung widerrufen. Der Betrag wird vollständig erstattet; die Gutschrift erscheint je nach Zahlungsmittel innerhalb weniger Werktage.',
  zahlung_offen:
    'Die letzte Zahlung konnte nicht eingezogen werden. Bitte hinterlegen Sie ein anderes Zahlungsmittel — Ihr Zugang bleibt vorerst bestehen.',
  gesperrt:
    'Ihr Zugang ist gesperrt, weil eine Zahlung offen geblieben ist. Ihre Daten bleiben erhalten. Nach Ausgleich schalten wir den Zugang wieder frei.',
}

/** Status, in denen der Zugang zum Produkt bestehen darf. */
const STATUS_MIT_ZUGANG: BestellStatus[] = ['aktiv', 'gekuendigt', 'zahlung_offen']

export interface BestellungZeile {
  status: BestellStatus
  tarif: CoachTarifKey
  /** Vertragsschluss — Fristbeginn für den Widerruf. ISO-Zeitstempel. */
  bestellt_am: string
  /** Ende des aktuell bezahlten Zeitraums. ISO-Datum (YYYY-MM-DD). */
  laufzeit_bis: string | null
  /** Gesetzt, sobald widerrufen wurde. */
  widerrufen_am: string | null
  /** Gesetzt, sobald gekündigt wurde (die Laufzeit läuft weiter). */
  gekuendigt_am: string | null
}

/**
 * Besteht heute Zugang aus dieser Bestellung?
 *
 * Zwei Bedingungen, beide nötig: passender Status UND Laufzeit noch
 * nicht überschritten. Der Status allein genügt nicht — zwischen dem
 * Ablauf und dem Eintreffen des Stripe-Ereignisses, das ihn auf
 * 'abgelaufen' setzt, liegen im Zweifel Stunden. In dieser Lücke muss
 * die Datumsprüfung greifen, sonst wäre der Zugang unbezahlt offen.
 */
export function hatZugang(b: BestellungZeile | null | undefined, heute: string): boolean {
  if (!b) return false
  if (!STATUS_MIT_ZUGANG.includes(b.status)) return false
  if (b.laufzeit_bis && b.laufzeit_bis < heute) return false
  return true
}

// ═══════════════════════════════════════════════════════════════
// WIDERRUF
// ═══════════════════════════════════════════════════════════════

export type WiderrufPruefung =
  | { moeglich: true; fristEndeIso: string }
  | { moeglich: false; grund: string }

/**
 * Letzter Tag der Widerrufsfrist als ISO-Datum.
 *
 * Gerechnet wird auf dem UTC-Zeitstrahl über den reinen Datumsanteil
 * des Vertragsschlusses. Das ist die konservative Variante: Sie kann
 * die Frist um wenige Stunden VERLÄNGERN (wenn spätabends deutscher
 * Zeit bestellt wurde), aber nie verkürzen. Eine zu kurz gerechnete
 * Frist wäre ein Rechtsfehler, eine zu lange nur ein Entgegenkommen.
 */
export function widerrufsfristEnde(bestelltAmIso: string): string {
  const basis = new Date(`${bestelltAmIso.slice(0, 10)}T00:00:00Z`)
  basis.setUTCDate(basis.getUTCDate() + WIDERRUFSFRIST_TAGE)
  return basis.toISOString().slice(0, 10)
}

/** Darf diese Bestellung heute noch widerrufen werden? */
export function widerrufMoeglich(b: BestellungZeile, heute: string): WiderrufPruefung {
  if (b.widerrufen_am) {
    return { moeglich: false, grund: 'Diese Bestellung wurde bereits widerrufen.' }
  }
  if (b.status === 'offen') {
    return {
      moeglich: false,
      grund: 'Diese Bestellung ist noch nicht abgeschlossen — es gibt nichts zu widerrufen.',
    }
  }
  const ende = widerrufsfristEnde(b.bestellt_am)
  if (heute > ende) {
    return {
      moeglich: false,
      grund:
        `Die 14-tägige Widerrufsfrist ist am ${formatDatum(ende)} abgelaufen. ` +
        'Sie können den Vertrag aber jederzeit zum Ende der Laufzeit kündigen.',
    }
  }
  return { moeglich: true, fristEndeIso: ende }
}

// ═══════════════════════════════════════════════════════════════
// KÜNDIGUNG
// ═══════════════════════════════════════════════════════════════

export type KuendigungPruefung =
  | { moeglich: true; wirktZum: string | null }
  | { moeglich: false; grund: string }

/**
 * Darf gekündigt werden — und wann wirkt die Kündigung?
 *
 * Es gibt bewusst keine Kündigungsfrist: gekündigt wird zum Ende des
 * bereits bezahlten Zeitraums, jederzeit. Damit ist die Anforderung des
 * § 312k BGB (Kündigungsschaltfläche, keine versteckten Fristen) ohne
 * Sonderfall erfüllt.
 */
export function kuendigungMoeglich(b: BestellungZeile): KuendigungPruefung {
  if (b.status === 'gekuendigt') {
    return { moeglich: false, grund: 'Diese Bestellung ist bereits gekündigt.' }
  }
  if (b.status === 'widerrufen') {
    return { moeglich: false, grund: 'Diese Bestellung wurde widerrufen.' }
  }
  if (b.status === 'abgelaufen') {
    return { moeglich: false, grund: 'Diese Bestellung ist bereits abgelaufen.' }
  }
  if (b.status === 'offen') {
    return { moeglich: false, grund: 'Diese Bestellung ist noch nicht abgeschlossen.' }
  }
  return { moeglich: true, wirktZum: b.laufzeit_bis }
}

// ═══════════════════════════════════════════════════════════════
// LAUFZEIT
// ═══════════════════════════════════════════════════════════════

/**
 * Ende eines Abrechnungszeitraums: Start + n Monate, minus einen Tag.
 *
 * Beispiel monatlich: Start 15.03. → Ende 14.04. Der 15.04. gehört
 * bereits zum Folgezeitraum. Ohne das „minus ein Tag" wäre jeder
 * Wechseltag doppelt bezahlt.
 *
 * Monatsüberlauf wird abgefangen: 31.01. + 1 Monat ergibt in JavaScript
 * den 03.03. (Februar hat keinen 31.). Hier wird stattdessen auf den
 * letzten Tag des Zielmonats geklemmt — 31.01. + 1 Monat = 28./29.02.,
 * Ende also 27./28.02. Das ist die kaufmännisch übliche Behandlung und
 * verhindert, dass ein Monatsabo schleichend nach vorne wandert.
 *
 * Maßgeblich für die Abbuchung ist ohnehin Stripe; diese Rechnung dient
 * der Anzeige und der Zugangsprüfung zwischen zwei Stripe-Ereignissen.
 */
export function laufzeitEnde(startIso: string, intervallMonate: number): string {
  const [j, m, t] = startIso.slice(0, 10).split('-').map(Number)
  const zielMonatIndex = (m - 1) + intervallMonate
  const zielJahr = j + Math.floor(zielMonatIndex / 12)
  const zielMonat = (zielMonatIndex % 12) + 1
  // Tag 0 des Folgemonats = letzter Tag des Zielmonats.
  const letzterTagZielmonat = new Date(Date.UTC(zielJahr, zielMonat, 0)).getUTCDate()
  const zielTag = Math.min(t, letzterTagZielmonat)

  const ende = new Date(Date.UTC(zielJahr, zielMonat - 1, zielTag))
  ende.setUTCDate(ende.getUTCDate() - 1)
  return ende.toISOString().slice(0, 10)
}

/** Nächster Abbuchungstermin = Tag nach dem Laufzeitende. */
export function naechsteAbbuchung(b: BestellungZeile): string | null {
  // Gekündigt oder beendet: es kommt keine weitere Abbuchung. Diesen Fall
  // hier abzufangen ist wichtiger als er aussieht — eine angezeigte
  // „nächste Abbuchung" bei gekündigtem Vertrag ist der klassische
  // Auslöser für Beschwerden und Rückbuchungen.
  if (b.status !== 'aktiv' && b.status !== 'zahlung_offen') return null
  if (!b.laufzeit_bis) return null
  const d = new Date(`${b.laufzeit_bis}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

/** ISO-Datum → „14.08.2026". Leerer Eingabe → Gedankenstrich. */
export function formatDatum(iso: string | null | undefined): string {
  if (!iso) return '–'
  const [j, m, t] = iso.slice(0, 10).split('-')
  return t && m && j ? `${t}.${m}.${j}` : iso
}
