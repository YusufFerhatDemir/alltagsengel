/**
 * Cookie-Einwilligung — Kategorien und Zustand
 *
 * Rein rechnend, ohne Browser-Zugriff. Das ist bei diesem Gegenstand kein
 * Selbstzweck: die Frage „darf dieses Skript jetzt laden?" wird an fünf
 * Stellen gestellt (gtag/GTM, Meta, TikTok, Besucherzählung, künftige).
 * Beantwortet jede Stelle sie selbst, driften sie auseinander — und die
 * Abweichung fällt niemandem auf, weil ein zu viel geladenes Skript
 * genauso aussieht wie ein erlaubtes.
 *
 * ── DREI KATEGORIEN, EINZELN WÄHLBAR ───────────────────────────────────
 * Vorher kannte der Bestand nur zwei Zustände: 'accepted' oder
 * 'rejected'. Der Aufklapptext BESCHRIEB bereits drei Kategorien, aber
 * wählen ließ sich nur alles oder nichts. Wer der Reichweitenmessung
 * zustimmen wollte, aber nicht dem Retargeting, musste alles ablehnen.
 *
 *   notwendig   immer an, nicht abwählbar (Anmeldung, Sicherheit)
 *   statistik   Reichweitenmessung, Besucherzählung
 *   marketing   Werbe-Pixel, Retargeting, Conversion-Messung
 *
 * ── ALTBESTAND WIRD ÜBERSETZT, NICHT VERWORFEN ─────────────────────────
 * In den Browsern der Bestandsbesucher steht der alte Wert als reine
 * Zeichenkette. Ihn zu ignorieren hieße, allen erneut den Banner zu
 * zeigen — und eine bereits erteilte Einwilligung wegzuwerfen. `lies()`
 * nimmt deshalb beide Formen an. Ein 'accepted' von früher galt für
 * alles, ein 'rejected' für nichts; genau so wird es übersetzt.
 *
 * ── IM ZWEIFEL NEIN ────────────────────────────────────────────────────
 * Alles, was nicht als ausdrückliches Ja gelesen werden kann — kaputtes
 * JSON, unbekannte Version, fehlender Eintrag — ergibt „nur notwendig".
 * Eine Einwilligung, die aus einem Fehler entsteht, ist keine.
 */

export const KATEGORIEN = ['notwendig', 'statistik', 'marketing'] as const
export type Kategorie = (typeof KATEGORIEN)[number]

export function istKategorie(wert: unknown): wert is Kategorie {
  return typeof wert === 'string' && (KATEGORIEN as readonly string[]).includes(wert)
}

/** Schlüssel im localStorage. Unverändert aus dem Bestand übernommen. */
export const CONSENT_SCHLUESSEL = 'ae_cookie_consent'

/**
 * Fassung des gespeicherten Zustands.
 *
 * Wird die Liste der Kategorien inhaltlich erweitert — also eine neue
 * Datenverarbeitung aufgenommen —, MUSS diese Zahl steigen: eine
 * Einwilligung, die zu etwas erteilt wurde, das es damals nicht gab, ist
 * für die neue Verarbeitung keine. `lies()` verwirft dann den alten Stand
 * und der Banner erscheint erneut.
 */
export const CONSENT_VERSION = 2

export interface ConsentZustand {
  /** Immer true — steht der Vollständigkeit halber da. */
  notwendig: true
  statistik: boolean
  marketing: boolean
  /** ISO-Zeitpunkt der Entscheidung — Nachweis nach Art. 7 Abs. 1 DSGVO. */
  zeitpunkt: string
  version: number
}

/** Nur das technisch Nötige — der Zustand nach „Ablehnen". */
export function nurNotwendig(zeitpunkt: string = new Date().toISOString()): ConsentZustand {
  return { notwendig: true, statistik: false, marketing: false, zeitpunkt, version: CONSENT_VERSION }
}

/** Alles erlaubt — der Zustand nach „Alle akzeptieren". */
export function alleAkzeptiert(zeitpunkt: string = new Date().toISOString()): ConsentZustand {
  return { notwendig: true, statistik: true, marketing: true, zeitpunkt, version: CONSENT_VERSION }
}

/** Eigene Auswahl. `notwendig` lässt sich nicht abwählen. */
export function auswahl(
  teil: { statistik?: boolean; marketing?: boolean },
  zeitpunkt: string = new Date().toISOString(),
): ConsentZustand {
  return {
    notwendig: true,
    statistik: teil.statistik === true,
    marketing: teil.marketing === true,
    zeitpunkt,
    version: CONSENT_VERSION,
  }
}

/**
 * Liest den gespeicherten Zustand.
 *
 * Liefert `null`, wenn NOCH KEINE Entscheidung vorliegt — das ist etwas
 * anderes als „abgelehnt" und der einzige Fall, in dem der Banner
 * erscheint. Fail-closed: alles Unlesbare gilt als „noch nicht
 * entschieden", nicht als Zustimmung.
 */
export function lies(rohwert: string | null | undefined): ConsentZustand | null {
  const text = (rohwert ?? '').trim()
  if (!text) return null

  // ── Altbestand: reine Zeichenkette ────────────────────────────────
  // Der Zeitpunkt ist nicht mehr rekonstruierbar; er bleibt leer, statt
  // einen zu erfinden. Ein erfundener Zeitpunkt wäre als Nachweis
  // schlechter als gar keiner.
  if (text === 'accepted') return { ...alleAkzeptiert(''), version: 1 }
  if (text === 'rejected') return { ...nurNotwendig(''), version: 1 }

  let roh: unknown
  try {
    roh = JSON.parse(text)
  } catch {
    return null
  }
  if (!roh || typeof roh !== 'object' || Array.isArray(roh)) return null

  const o = roh as Record<string, unknown>

  // Eine Einwilligung aus einer älteren Fassung deckt nicht ab, was
  // seitdem hinzugekommen ist — sie wird verworfen, der Banner erscheint.
  if (Number(o.version) !== CONSENT_VERSION) return null

  return {
    notwendig: true,
    statistik: o.statistik === true,
    marketing: o.marketing === true,
    zeitpunkt: typeof o.zeitpunkt === 'string' ? o.zeitpunkt : '',
    version: CONSENT_VERSION,
  }
}

/** Zum Speichern. */
export function schreibe(zustand: ConsentZustand): string {
  return JSON.stringify(zustand)
}

/**
 * Darf eine Kategorie geladen werden?
 *
 * Ohne Entscheidung (`null`) ist die Antwort für alles außer `notwendig`
 * NEIN. Das ist der Kern: solange niemand zugestimmt hat, lädt nichts.
 */
export function darf(zustand: ConsentZustand | null, kategorie: Kategorie): boolean {
  if (kategorie === 'notwendig') return true
  if (!zustand) return false
  return zustand[kategorie] === true
}

/**
 * Die vier Schalter des Google Consent Mode v2.
 *
 * `analytics_storage` hängt an der Statistik, die drei `ad_*` am
 * Marketing. Sie zusammenzufassen wäre bequem und falsch: wer nur der
 * Reichweitenmessung zustimmt, hat der Werbemessung nicht zugestimmt.
 */
export function gtagEinwilligung(zustand: ConsentZustand | null): Record<string, 'granted' | 'denied'> {
  const ja = (erlaubt: boolean) => (erlaubt ? 'granted' as const : 'denied' as const)
  return {
    ad_storage: ja(darf(zustand, 'marketing')),
    ad_user_data: ja(darf(zustand, 'marketing')),
    ad_personalization: ja(darf(zustand, 'marketing')),
    analytics_storage: ja(darf(zustand, 'statistik')),
  }
}

/** Beschriftung und Erklärung je Kategorie — eine Quelle für alle Anzeigen. */
export const KATEGORIE_TEXT: Record<Kategorie, {
  titel: string
  kurz: string
  dienste: string
}> = {
  notwendig: {
    titel: 'Notwendig',
    kurz: 'Für den Betrieb der Website erforderlich — Anmeldung, Sicherheit, '
      + 'Speichern Ihrer Cookie-Auswahl. Diese Cookies lassen sich nicht abwählen.',
    dienste: 'Supabase (Anmeldung, EU-Rechenzentrum)',
  },
  statistik: {
    titel: 'Statistik und Analyse',
    kurz: 'Hilft uns zu verstehen, welche Seiten gefunden werden und wo Menschen '
      + 'abbrechen. Erfasst IP-Adresse, ungefähren Standort und Browser-Angaben.',
    dienste: 'Google Analytics, Besucherzählung (Supabase), ipapi.co (Standort)',
  },
  marketing: {
    titel: 'Marketing',
    kurz: 'Misst den Erfolg unserer Anzeigen und erlaubt es, Menschen erneut '
      + 'anzusprechen, die schon einmal hier waren.',
    dienste: 'Google Ads, Meta (Facebook/Instagram), TikTok',
  },
}
