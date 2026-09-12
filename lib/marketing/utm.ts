/**
 * Kampagnen-Herkunft (UTM) für die öffentlichen Formulare.
 *
 * BEFUND (12.09.2026): Von den sechs Formularen der Website gaben nur drei
 * eine Herkunft mit — Rückruf-Widget, Terminbuchung und Pflegebox-
 * Konfigurator schickten keine. Und die drei, die es taten, lasen
 * ausschließlich die AKTUELLE URL: Wer über eine Anzeige auf der Startseite
 * landete und erst auf /termin absendete, kam ohne Herkunft an. Live waren
 * 11 von 50 Leads mit `utm_source` versehen.
 *
 * Dabei liegt die Herkunft längst vor: components/VisitorTracker.tsx legt
 * `attr_utm_source` & Co. beim ersten Seitenaufruf in sessionStorage und
 * localStorage ab (First-Touch, bewusst vor dem Consent-Check, weil es
 * funktionale Conversion-Parameter sind). Dieses Modul liest genau dort.
 *
 * REIHENFOLGE
 *   1. Parameter der aktuellen URL (die Seite, auf der abgesendet wird)
 *   2. sessionStorage `attr_*` — die Herkunft dieses Besuchs
 *   3. localStorage `attr_*` — First-Touch früherer Besuche
 * `?source=` gilt als Ersatz für `utm_source` (so kam es aus den
 * Landingpages unter /lp/[source]).
 */

export interface UtmWerte {
  utm_source: string
  utm_medium: string
  utm_campaign: string
}

export const UTM_LEER: UtmWerte = { utm_source: '', utm_medium: '', utm_campaign: '' }

/** Grenze wie in den Routen (`MAX_LEN.utm_source`), plus Zeilenumbrüche raus. */
const MAX = 120

function sauber(wert: string | null | undefined): string {
  return (wert ?? '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, MAX)
}

/** Minimalform eines Speichers — damit Tests ohne Browser auskommen. */
export interface Leser {
  getItem(schluessel: string): string | null
}

/**
 * Herkunft ermitteln. `speicher` in der Reihenfolge, in der gesucht werden
 * soll; fehlende oder werfende Speicher (privater Modus) werden übersprungen.
 */
export function utmAus(suche: string, speicher: readonly (Leser | null | undefined)[] = []): UtmWerte {
  const params = new URLSearchParams(suche || '')
  const ausSpeicher = (schluessel: string): string => {
    for (const s of speicher) {
      if (!s) continue
      try {
        const wert = s.getItem(`attr_${schluessel}`)
        if (wert) return wert
      } catch { /* privater Modus: weiter zum nächsten Speicher */ }
    }
    return ''
  }
  const hole = (schluessel: string, ersatzParam?: string): string =>
    sauber(params.get(schluessel) || (ersatzParam ? params.get(ersatzParam) : null) || ausSpeicher(schluessel))

  return {
    utm_source: hole('utm_source', 'source'),
    utm_medium: hole('utm_medium'),
    utm_campaign: hole('utm_campaign'),
  }
}

/** Im Browser: URL, dann sessionStorage, dann localStorage. Ausserhalb: leer. */
export function utmAusBrowser(): UtmWerte {
  if (typeof window === 'undefined') return UTM_LEER
  let sitzung: Leser | null = null
  let dauerhaft: Leser | null = null
  try { sitzung = window.sessionStorage } catch { /* gesperrt */ }
  try { dauerhaft = window.localStorage } catch { /* gesperrt */ }
  return utmAus(window.location.search, [sitzung, dauerhaft])
}
