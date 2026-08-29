/**
 * IP-Plausibilitaet — herausgezogen aus `app/api/visitor-alert/route.ts`.
 *
 * WARUM SIE HIER STEHT UND NICHT IN DER ROUTE:
 * Next.js erzeugt fuer jede `route.ts` eine Typdatei, die JEDEN Export
 * gegen eine feste Liste erlaubter Namen prueft (Handler, `runtime`,
 * `revalidate` …). Ein zusaetzlicher Export — hier `istPlausibleIp` —
 * schlaegt dort als `TS2344` auf:
 *
 *   Property 'istPlausibleIp' is incompatible with index signature.
 *   Type '(wert: unknown) => boolean' is not assignable to type 'never'.
 *
 * Der Fehler entsteht in `.next/dev/types/…`, also in erzeugtem Code, und
 * erscheint deshalb erst NACH dem Webpack-Lauf — im Vercel-Build fiel er
 * damit ganz am Ende und ohne erkennbaren Bezug zur Ursache auf.
 *
 * Die Funktion war exportiert, damit `__tests__/perimeter/…` sie pruefen
 * kann. Genau dafuer ist eine Datei unter `lib/` der richtige Ort: die
 * Pruefbarkeit bleibt, der verbotene Export verschwindet.
 */

/**
 * Sieht der gemeldete Wert wie eine IP-Adresse aus?
 *
 * Bewusst grob: es geht nicht darum, jede gueltige Adresse exakt zu
 * treffen, sondern darum, dass der Wert als LIKE-Praefix und als
 * Cooldown-Schluessel taugt. Leer, zu kurz oder mit Platzhaltern gespickt
 * faellt durch.
 */
export function istPlausibleIp(wert: unknown): boolean {
  if (typeof wert !== 'string') return false
  const s = wert.trim()
  if (s.length < 7 || s.length > 45) return false
  const ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/
  const ipv6 = /^[0-9a-fA-F:]+$/
  if (ipv4.test(s)) return s.split('.').every(t => Number(t) <= 255)
  return ipv6.test(s) && s.includes(':')
}
