/**
 * Wortschatz des Bewerber-Funnels.
 *
 * WO DIE ANTWORTEN LANDEN
 * Die Zusatzangaben (Führerschein, Sprachen, Verfügbarkeit, Stunden,
 * Beschäftigungsart, Motivation) gehen nach `lead_inquiries.bewerbung_daten`
 * — die jsonb-Spalte aus Migration 20261027000000, die genau dafür angelegt
 * wurde. Der Kommentar dort sagt es ausdrücklich: „Zwanzig neue Spalten
 * wären für Anfragen durchgehend NULL und müssten bei jeder Änderung der
 * Schrittfolge migriert werden."
 *
 * Das ist auch der Grund, warum dieser Funnel OHNE neue Migration
 * auskommt — anders als die Warteliste, die eigene Pflichtfelder und einen
 * eigenen Statuslauf braucht.
 */

export const QUALIFIKATIONEN = [
  { key: 'keine', label: 'Keine Erfahrung — ich möchte einsteigen' },
  { key: 'erfahrung_privat', label: 'Erfahrung aus der Pflege von Angehörigen' },
  { key: 'alltagsbegleiter', label: 'Alltagsbegleiter/in (§ 45b)' },
  { key: 'betreuungskraft', label: 'Betreuungskraft (§ 53b/43b)' },
  { key: 'pflegehelfer', label: 'Pflegehelfer/in' },
  { key: 'pflegefachkraft', label: 'Pflegefachkraft / Altenpfleger/in' },
  { key: 'sonstige', label: 'Sonstige Qualifikation' },
] as const

export const FUEHRERSCHEIN = [
  { key: 'nein', label: 'Kein Führerschein' },
  { key: 'ja_ohne_auto', label: 'Führerschein, kein eigenes Auto' },
  { key: 'ja_mit_auto', label: 'Führerschein und eigenes Auto' },
] as const

// Häufigste Sprachen im Einsatzgebiet. „weitere" fängt alles andere auf —
// eine Liste mit 40 Einträgen liest niemand, und das Freitextfeld
// „Motivation" trägt den Rest.
export const SPRACHEN = [
  { key: 'deutsch', label: 'Deutsch' },
  { key: 'tuerkisch', label: 'Türkisch' },
  { key: 'englisch', label: 'Englisch' },
  { key: 'russisch', label: 'Russisch' },
  { key: 'polnisch', label: 'Polnisch' },
  { key: 'arabisch', label: 'Arabisch' },
  { key: 'spanisch', label: 'Spanisch' },
  { key: 'italienisch', label: 'Italienisch' },
  { key: 'weitere', label: 'Weitere Sprachen' },
] as const

export const VERFUEGBARKEIT = [
  { key: 'vormittags', label: 'Vormittags' },
  { key: 'nachmittags', label: 'Nachmittags' },
  { key: 'abends', label: 'Abends' },
  { key: 'wochenende', label: 'Wochenende' },
  { key: 'flexibel', label: 'Flexibel nach Absprache' },
] as const

export const STUNDEN = [
  { key: 'bis_10', label: 'Bis 10 Stunden/Woche' },
  { key: '10_20', label: '10–20 Stunden/Woche' },
  { key: '20_30', label: '20–30 Stunden/Woche' },
  { key: 'ueber_30', label: 'Mehr als 30 Stunden/Woche' },
  { key: 'unklar', label: 'Noch offen' },
] as const

export const BESCHAEFTIGUNGSART = [
  { key: 'minijob', label: 'Minijob' },
  { key: 'teilzeit', label: 'Teilzeit' },
  { key: 'vollzeit', label: 'Vollzeit' },
  { key: 'selbststaendig', label: 'Auf selbstständiger Basis' },
  { key: 'unklar', label: 'Noch offen' },
] as const

type Eintrag = { key: string; label: string }

function pruefer(liste: readonly Eintrag[]) {
  const schluessel = liste.map(e => e.key)
  return (wert: unknown): wert is string => typeof wert === 'string' && schluessel.includes(wert)
}

function beschrifter(liste: readonly Eintrag[]) {
  return (key: string | null | undefined): string => {
    if (!key) return '—'
    return liste.find(e => e.key === key)?.label ?? key
  }
}

export const istQualifikation = pruefer(QUALIFIKATIONEN)
export const istFuehrerschein = pruefer(FUEHRERSCHEIN)
export const istSprache = pruefer(SPRACHEN)
export const istVerfuegbarkeit = pruefer(VERFUEGBARKEIT)
export const istStunden = pruefer(STUNDEN)
export const istBeschaeftigungsart = pruefer(BESCHAEFTIGUNGSART)

export const qualifikationLabel = beschrifter(QUALIFIKATIONEN)
export const fuehrerscheinLabel = beschrifter(FUEHRERSCHEIN)
export const spracheLabel = beschrifter(SPRACHEN)
export const verfuegbarkeitLabel = beschrifter(VERFUEGBARKEIT)
export const stundenLabel = beschrifter(STUNDEN)
export const beschaeftigungsartLabel = beschrifter(BESCHAEFTIGUNGSART)

/**
 * Form der jsonb-Nutzlast in `lead_inquiries.bewerbung_daten`.
 *
 * `version` steht bewusst dabei: die Schrittfolge ändert sich, eingegangene
 * Bewerbungen dürfen sich nicht mitändern. Wer später ein Feld umbenennt,
 * sieht an der Version, welches Format vor ihm liegt.
 */
export interface BewerbungDaten {
  version: 1
  qualifikation?: string
  fuehrerschein?: string
  sprachen?: string[]
  verfuegbarkeit?: string[]
  stunden?: string
  beschaeftigungsart?: string
  motivation?: string
  /** Regionsschlüssel aus WARTELISTE_REGIONEN — lead_inquiries hat keine Spalte dafür. */
  region?: string
}

export const BEWERBUNG_MAX = {
  name: 120,
  email: 200,
  phone: 40,
  plz: 5,
  motivation: 2000,
} as const
