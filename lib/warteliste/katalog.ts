/**
 * Wortschatz der Kunden-Warteliste.
 *
 * Eine Quelle für Formular, API-Route, Admin-Oberfläche und die
 * CHECK-Bedingungen der Migration 20261031000000. Läge die Liste an drei
 * Stellen, driftete sie auseinander: das Formular böte eine Leistung an,
 * welche die Route abweist, und der Mensch davor sähe „Speicherfehler“.
 *
 * Rein rechnend, kein Browser- und kein Serverzugriff — deshalb aus beiden
 * Welten importierbar.
 */

// ── Leistungen ─────────────────────────────────────────────────────────
export const WARTELISTE_LEISTUNGEN = [
  { key: 'alltagsbegleitung', label: 'Alltagsbegleitung & Gesellschaft' },
  { key: 'haushaltshilfe', label: 'Haushaltshilfe' },
  { key: 'einkaufshilfe', label: 'Einkaufs- und Besorgungshilfe' },
  { key: 'arztbegleitung', label: 'Begleitung zu Arztterminen' },
  { key: 'demenzbetreuung', label: 'Betreuung bei Demenz' },
  { key: 'entlastung_angehoerige', label: 'Entlastung für pflegende Angehörige' },
  { key: 'krankenfahrten', label: 'Krankenfahrten' },
  { key: 'pflegebox', label: 'Pflegebox (Pflegehilfsmittel)' },
] as const

export type LeistungsSchluessel = (typeof WARTELISTE_LEISTUNGEN)[number]['key']

const LEISTUNGS_SCHLUESSEL: readonly string[] = WARTELISTE_LEISTUNGEN.map(l => l.key)

export function istLeistung(wert: unknown): wert is LeistungsSchluessel {
  return typeof wert === 'string' && LEISTUNGS_SCHLUESSEL.includes(wert)
}

export function leistungLabel(key: string): string {
  return WARTELISTE_LEISTUNGEN.find(l => l.key === key)?.label ?? key
}

// ── Regionen ───────────────────────────────────────────────────────────
// Deckt sich mit den Stadt-Landingpages (app/alltagsbegleitung/[stadt]).
// „umland“ ist bewusst dabei: wer nicht in der Liste steht, soll sich
// trotzdem eintragen können statt abzuspringen — die Nachfrage außerhalb
// des heutigen Gebiets ist selbst eine Information.
export const WARTELISTE_REGIONEN = [
  { key: 'frankfurt', label: 'Frankfurt am Main' },
  { key: 'frankfurt-hoechst', label: 'Frankfurt-Höchst' },
  { key: 'offenbach', label: 'Offenbach am Main' },
  { key: 'hanau', label: 'Hanau' },
  { key: 'maintal', label: 'Maintal' },
  { key: 'bad-vilbel', label: 'Bad Vilbel' },
  { key: 'bad-homburg', label: 'Bad Homburg' },
  { key: 'main-taunus', label: 'Main-Taunus-Kreis' },
  { key: 'eschborn', label: 'Eschborn' },
  { key: 'neu-isenburg', label: 'Neu-Isenburg' },
  { key: 'rodgau', label: 'Rodgau' },
  { key: 'darmstadt', label: 'Darmstadt' },
  { key: 'wiesbaden', label: 'Wiesbaden' },
  { key: 'mainz', label: 'Mainz' },
  { key: 'umland', label: 'Anderer Ort im Rhein-Main-Gebiet' },
] as const

export type RegionsSchluessel = (typeof WARTELISTE_REGIONEN)[number]['key']

const REGIONS_SCHLUESSEL: readonly string[] = WARTELISTE_REGIONEN.map(r => r.key)

export function istRegion(wert: unknown): wert is RegionsSchluessel {
  return typeof wert === 'string' && REGIONS_SCHLUESSEL.includes(wert)
}

export function regionLabel(key: string | null): string {
  if (!key) return '—'
  return WARTELISTE_REGIONEN.find(r => r.key === key)?.label ?? key
}

// ── Pflegegrad ─────────────────────────────────────────────────────────
// '0' und 'unbekannt' sind echte Antworten, keine fehlenden Werte:
// „noch keinen Pflegegrad“ ist für die Beratung eine andere Lage als
// „weiß ich nicht“. Deckungsgleich mit waitlist_customers_pflegegrad_check.
export const WARTELISTE_PFLEGEGRADE = [
  { key: '0', label: 'Kein Pflegegrad' },
  { key: '1', label: 'Pflegegrad 1' },
  { key: '2', label: 'Pflegegrad 2' },
  { key: '3', label: 'Pflegegrad 3' },
  { key: '4', label: 'Pflegegrad 4' },
  { key: '5', label: 'Pflegegrad 5' },
  { key: 'unbekannt', label: 'Weiß ich nicht' },
] as const

const PFLEGEGRAD_SCHLUESSEL: readonly string[] = WARTELISTE_PFLEGEGRADE.map(p => p.key)

export function istPflegegrad(wert: unknown): wert is string {
  return typeof wert === 'string' && PFLEGEGRAD_SCHLUESSEL.includes(wert)
}

export function pflegegradLabel(key: string | null): string {
  if (!key) return '—'
  return WARTELISTE_PFLEGEGRADE.find(p => p.key === key)?.label ?? key
}

// ── Status ─────────────────────────────────────────────────────────────
// Deckungsgleich mit waitlist_customers_status_check. Ein Wert außerhalb
// dieser fünf wird von der Datenbank mit 23514 abgewiesen — die Prüfung
// steht deshalb fail-closed vor dem Schreibweg, nicht dahinter.
export const WARTELISTE_STATUS: Record<string, { label: string; color: string }> = {
  neu: { label: 'Neu', color: '#2196F3' },
  kontaktiert: { label: 'Kontaktiert', color: '#E8A000' },
  vorgemerkt: { label: 'Vorgemerkt', color: '#9C27B0' },
  aktiviert: { label: 'Aktiviert', color: '#5CB882' },
  abgemeldet: { label: 'Abgemeldet', color: '#D04B3B' },
}

export const WARTELISTE_STATUS_FLOW = ['neu', 'kontaktiert', 'vorgemerkt', 'aktiviert', 'abgemeldet']

export function istWartelisteStatus(wert: unknown): wert is string {
  return typeof wert === 'string' && WARTELISTE_STATUS_FLOW.includes(wert)
}

// ── Längengrenzen ──────────────────────────────────────────────────────
// An einer Stelle, damit Formular und Route dieselbe Grenze ziehen.
export const WARTELISTE_MAX = {
  name: 120,
  email: 200,
  phone: 40,
  nachricht: 2000,
  utm: 120,
} as const
