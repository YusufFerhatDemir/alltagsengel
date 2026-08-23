/**
 * VP/KZP — Zeitkontingente (§ 39, § 42, § 42a SGB XI)
 *
 * ── Abgrenzung zu lib/config/budget-constants.ts ────────────────────────
 * Dort stehen die GELDbetraege (Entlastungsbetrag 131 EUR/Monat,
 * gemeinsamer Jahresbetrag VP+KZP 3.539 EUR). Hier stehen die TAGE.
 * Beides sind getrennte Dimensionen und werden auch getrennt geprueft:
 *
 *   Geld  — EIN gemeinsamer Topf (§ 42a). Verbrauch durch VP mindert das,
 *           was fuer KZP uebrig ist, und umgekehrt.
 *   Tage  — ZWEI getrennte Kontingente je Kalenderjahr. VP-Tage mindern
 *           das KZP-Tagekontingent NICHT und umgekehrt.
 *
 * Diese Trennung ist der haeufigste Denkfehler bei VP/KZP und deshalb
 * hier ausgeschrieben: wer die Tage in einen gemeinsamen Topf wirft,
 * sperrt berechtigte Leistungen; wer das Geld in zwei Toepfe trennt,
 * laesst zu viel durch. Der Test __tests__/billing/vpkzp-berechnung.test.ts
 * haelt beide Richtungen fest.
 *
 * ── Neue Werte eintragen ────────────────────────────────────────────────
 * Genau wie bei BUDGET_VERSIONEN: den offenen Eintrag zeitlich schliessen,
 * einen neuen anhaengen. Alte Werte NIE ueberschreiben — eine Pruefung fuer
 * ein vergangenes Jahr muss reproduzierbar bleiben.
 *
 * Fail-Closed: fuer ein Jahr ohne Eintrag wirft zeitVersionFuerJahr().
 * Es gibt bewusst keinen Fallback auf den nachbarlichen Zeitraum.
 */

/** Die beiden Leistungsarten dieses Moduls. */
export const VPKZP_ARTEN = ['verhinderungspflege', 'kurzzeitpflege'] as const
export type VpKzpArt = (typeof VPKZP_ARTEN)[number]

export function istVpKzpArt(wert: unknown): wert is VpKzpArt {
  return typeof wert === 'string' && (VPKZP_ARTEN as readonly string[]).includes(wert)
}

/** Anzeigename fuer Oberflaeche und Protokolltexte. */
export const ART_BEZEICHNUNG: Record<VpKzpArt, string> = {
  verhinderungspflege: 'Verhinderungspflege (§ 39 SGB XI)',
  kurzzeitpflege: 'Kurzzeitpflege (§ 42 SGB XI)',
}

export interface VpKzpZeitVersion {
  /** ISO-Datum, ab dem diese Kontingente gelten. */
  gueltigAb: string
  /** ISO-Datum, bis zu dem sie gelten; '9999-12-31' = aktuell offen. */
  gueltigBis: string
  /** Hoechstdauer Verhinderungspflege je Kalenderjahr in Tagen. */
  vpMaxTage: number
  /** Hoechstdauer Kurzzeitpflege je Kalenderjahr in Tagen. */
  kzpMaxTage: number
  /** Mindest-Pflegegrad fuer beide Leistungen. */
  minPflegegrad: number
  /**
   * Traegt der gemeinsame Jahresbetrag einen Uebertrag ins Folgejahr?
   * § 42a Abs. 1 SGB XI kennt EINEN Jahresbetrag ohne Uebertrag — anders
   * als § 45b, wo nicht verbrauchte Betraege bis zum 30.06. des Folgejahres
   * weiterlaufen. Als Feld und nicht als Kommentar, damit die Regel im
   * Code sichtbar ist und ein spaeterer Rechtsstand sie umstellen kann.
   */
  uebertragInsFolgejahr: boolean
}

export const VPKZP_ZEIT_VERSIONEN: VpKzpZeitVersion[] = [
  {
    gueltigAb: '2024-01-01',
    gueltigBis: '9999-12-31',
    // 6 Wochen a 7 Tage — Hoechstdauer Verhinderungspflege je Kalenderjahr.
    vpMaxTage: 42,
    // 8 Wochen a 7 Tage — Hoechstdauer Kurzzeitpflege je Kalenderjahr.
    kzpMaxTage: 56,
    minPflegegrad: 2,
    uebertragInsFolgejahr: false,
  },
]

/** Fruehestes Jahr, fuer das Zeitkontingente hinterlegt sind. */
export const FRUEHESTES_ZEITJAHR = 2024

/**
 * Fachfragen, die dieses Modul BEWUSST nicht selbst beantwortet.
 *
 * Muster wie UNGEDECKELTE_TOEPFE in lib/billing/core/budget-cap.ts: eine
 * bekannte Luecke gehoert in eine Datenstruktur, nicht in einen Kommentar
 * — dann faellt sie beim Lesen des Codes auf, taucht im Pruefprotokoll auf
 * und laesst sich im Test festhalten.
 *
 * Solange eine Frage hier steht, darf keine Regel dazu erfunden werden.
 * Faellt eine Fachauskunft, wandert sie als Feld in VpKzpZeitVersion und
 * wird aus dieser Liste entfernt.
 */
export const OFFENE_FACHFRAGEN: Record<string, string> = {
  vp_dauer_ab_072025:
    'Ob die Hoechstdauer der Verhinderungspflege mit Einfuehrung des gemeinsamen '
    + 'Jahresbetrags zum 01.07.2025 von 6 auf 8 Wochen angehoben wurde, ist hier NICHT '
    + 'belegt. Bis zur Fachauskunft gilt der konservative Wert 42 Tage (6 Wochen) — er '
    + 'sperrt im Zweifel zu frueh statt zu spaet. Belegte Auskunft: neuen Eintrag in '
    + 'VPKZP_ZEIT_VERSIONEN mit gueltigAb 2025-07-01 anlegen, alten schliessen.',
  vorpflegezeit:
    'Die Vorpflegezeit nach § 39 SGB XI (Pflege durch dieselbe Pflegeperson vor der '
    + 'ersten Verhinderungspflege) wird hier NICHT geprueft — der aktuelle Rechtsstand '
    + 'dazu ist in diesem Repo nicht belegt. Das Pruefprotokoll meldet die Frage als '
    + 'FACHAUSKUNFT_ERFORDERLICH, statt sie still zu bejahen oder zu verneinen.',
  stundenweise_vp:
    'Stundenweise Verhinderungspflege unter 8 Stunden am Tag zaehlt nach verbreiteter '
    + 'Kassenpraxis nicht auf das Tageskontingent. Ob und ab welcher Grenze das hier '
    + 'gelten soll, ist nicht belegt. Dieses Modul zaehlt deshalb JEDEN angefangenen '
    + 'Leistungstag als vollen Tag — die strengere Zaehlung.',
  kzp_pflegegrad_1:
    'Fuer Pflegegrad 1 besteht kein Anspruch nach § 39/§ 42; Leistungen sind ueber den '
    + 'Entlastungsbetrag (§ 45b) denkbar. Dieses Modul lehnt Pflegegrad 1 ab und '
    + 'verweist auf den § 45b-Weg, statt einen Anspruch zu unterstellen.',
}

export class ZeitVersionFehltError extends Error {
  public readonly jahr: number

  constructor(jahr: number) {
    const bekannt = VPKZP_ZEIT_VERSIONEN
      .map(v => `${v.gueltigAb.slice(0, 4)}–${v.gueltigBis === '9999-12-31' ? 'offen' : v.gueltigBis.slice(0, 4)}`)
      .join(', ')
    super(
      `Keine VP/KZP-Zeitkontingente fuer das Jahr ${jahr} hinterlegt. `
      + `Bekannte Zeitraeume: ${bekannt}. `
      + `Neue Werte in VPKZP_ZEIT_VERSIONEN (lib/billing/vpkzp/konstanten.ts) eintragen — `
      + `es wird bewusst kein Kontingent geraten.`
    )
    this.name = 'ZeitVersionFehltError'
    this.jahr = jahr
  }
}

/**
 * Liefert die fuer ein Kalenderjahr gueltigen Zeitkontingente.
 * Fail-closed: wirft ZeitVersionFehltError, wenn kein Eintrag das ganze
 * Jahr abdeckt.
 */
export function zeitVersionFuerJahr(jahr: number): VpKzpZeitVersion {
  if (!Number.isInteger(jahr)) throw new ZeitVersionFehltError(jahr)

  const jahresBeginn = `${jahr}-01-01`
  const jahresEnde = `${jahr}-12-31`

  for (let i = VPKZP_ZEIT_VERSIONEN.length - 1; i >= 0; i--) {
    const v = VPKZP_ZEIT_VERSIONEN[i]
    if (v.gueltigAb <= jahresBeginn && v.gueltigBis >= jahresEnde) return v
  }

  throw new ZeitVersionFehltError(jahr)
}

/** Wie zeitVersionFuerJahr, liefert aber null statt zu werfen. */
export function zeitVersionFuerJahrOderNull(jahr: number): VpKzpZeitVersion | null {
  try {
    return zeitVersionFuerJahr(jahr)
  } catch {
    return null
  }
}

/** Tageskontingent der Leistungsart im angegebenen Jahr. */
export function maxTageFuer(art: VpKzpArt, jahr: number): number {
  const v = zeitVersionFuerJahr(jahr)
  return art === 'verhinderungspflege' ? v.vpMaxTage : v.kzpMaxTage
}
