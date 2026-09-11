/**
 * Geo-Signale je Stadtseite — EINE Tabelle für alle Stadt-Routen.
 *
 * BEFUND (SEO-Audit 11.09.2026, live geprüft)
 * Das Root-Layout setzt `geo.region`, `geo.placename`, `geo.position` und
 * `ICBM` auf Frankfurt. Keine der fünf Stadt-Routen
 * (/alltagsbegleitung, /haushaltshilfe, /krankenfahrten, /hygienebox,
 * /engel-werden je /[stadt]) hat das überschrieben — /alltagsbegleitung/hanau
 * meldete also „Frankfurt am Main, 50.1109;8.6821", /alltagsbegleitung/mainz
 * dazu `DE-HE` statt Rheinland-Pfalz. Das Stadt-JSON-LD war dagegen schon
 * richtig; falsch waren nur die geerbten Meta-Tags.
 *
 * WARUM EINE EIGENE TABELLE
 * Die Routen führen ihre Koordinaten je in eigener Form (`lat/lng`,
 * `geo.latitude`, `geo.lat`), /engel-werden gar keine. Die Werte weichen
 * zwischen den Routen um höchstens 1,1 km voneinander ab (am 11.09.2026
 * nachgemessen) — hier steht je Stadt EIN Wert, der Regressionstest
 * __tests__/seo/stadt-geo.test.ts hält die Routen dagegen.
 *
 * Next.js ersetzt `other` des Layouts vollständig, sobald eine Seite
 * `other` setzt. Das Layout führt dort nur diese vier Schlüssel — alle
 * vier werden hier gesetzt, es geht also nichts verloren.
 */

export interface StadtGeo {
  name: string
  lat: number
  lng: number
  /** ISO 3166-2 des Bundeslands — `geo.region`. */
  region: 'DE-HE' | 'DE-RP' | 'DE-BY' | 'DE-NW'
}

export const STADT_GEO: Record<string, StadtGeo> = {
  frankfurt: { name: 'Frankfurt am Main', lat: 50.1109, lng: 8.6821, region: 'DE-HE' },
  'frankfurt-hoechst': { name: 'Frankfurt-Höchst', lat: 50.0996, lng: 8.543, region: 'DE-HE' },
  offenbach: { name: 'Offenbach am Main', lat: 50.0956, lng: 8.7761, region: 'DE-HE' },
  wiesbaden: { name: 'Wiesbaden', lat: 50.0782, lng: 8.2398, region: 'DE-HE' },
  darmstadt: { name: 'Darmstadt', lat: 49.8728, lng: 8.6512, region: 'DE-HE' },
  hanau: { name: 'Hanau', lat: 50.1328, lng: 8.9169, region: 'DE-HE' },
  'bad-homburg': { name: 'Bad Homburg', lat: 50.2268, lng: 8.6182, region: 'DE-HE' },
  'neu-isenburg': { name: 'Neu-Isenburg', lat: 50.048, lng: 8.6947, region: 'DE-HE' },
  'friedberg-wetterau': { name: 'Friedberg (Wetterau)', lat: 50.3372, lng: 8.7548, region: 'DE-HE' },
  rodgau: { name: 'Rodgau', lat: 50.0333, lng: 8.8833, region: 'DE-HE' },
  maintal: { name: 'Maintal', lat: 50.1478, lng: 8.8331, region: 'DE-HE' },
  'bad-vilbel': { name: 'Bad Vilbel', lat: 50.1786, lng: 8.7367, region: 'DE-HE' },
  'main-taunus': { name: 'Main-Taunus-Kreis', lat: 50.0872, lng: 8.4472, region: 'DE-HE' },
  eschborn: { name: 'Eschborn', lat: 50.1433, lng: 8.5706, region: 'DE-HE' },
  giessen: { name: 'Gießen', lat: 50.5841, lng: 8.6784, region: 'DE-HE' },
  marburg: { name: 'Marburg', lat: 50.809, lng: 8.771, region: 'DE-HE' },
  kassel: { name: 'Kassel', lat: 51.3127, lng: 9.4797, region: 'DE-HE' },
  fulda: { name: 'Fulda', lat: 50.5558, lng: 9.6808, region: 'DE-HE' },
  limburg: { name: 'Limburg an der Lahn', lat: 50.3836, lng: 8.0503, region: 'DE-HE' },
  mainz: { name: 'Mainz', lat: 49.9929, lng: 8.2473, region: 'DE-RP' },
  aschaffenburg: { name: 'Aschaffenburg', lat: 49.9757, lng: 9.1478, region: 'DE-BY' },
  koeln: { name: 'Köln', lat: 50.9375, lng: 6.9603, region: 'DE-NW' },
  duesseldorf: { name: 'Düsseldorf', lat: 51.2277, lng: 6.7735, region: 'DE-NW' },
  essen: { name: 'Essen', lat: 51.4556, lng: 7.0116, region: 'DE-NW' },
  dortmund: { name: 'Dortmund', lat: 51.5136, lng: 7.4653, region: 'DE-NW' },
  bonn: { name: 'Bonn', lat: 50.7374, lng: 7.0982, region: 'DE-NW' },
}

/**
 * `metadata.other` für eine Stadtseite. Unbekannter Slug → `undefined`:
 * dann bleibt das Layout-Signal (Frankfurt) stehen, statt eine erfundene
 * Position zu melden. Der Regressionstest verhindert, dass das für eine
 * existierende Stadtseite passiert.
 */
export function stadtGeoMeta(slug: string): Record<string, string> | undefined {
  const g = STADT_GEO[slug]
  if (!g) return undefined
  return {
    'geo.region': g.region,
    'geo.placename': g.name,
    'geo.position': `${g.lat};${g.lng}`,
    ICBM: `${g.lat}, ${g.lng}`,
  }
}
