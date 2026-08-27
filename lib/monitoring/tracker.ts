/**
 * Request-Tracking Utility.
 *
 * Wrapper fuer API-Route-Handler, der automatisch Antwortzeit und
 * Statuscode in den Metriken-Buffer schreibt.
 *
 * Nutzung:
 *   import { withTracking } from '@/lib/monitoring/tracker'
 *
 *   export const GET = withTracking(async function GET(req: NextRequest) { ... })
 *
 * Zwei Eigenschaften sind hier Absicht und duerfen nicht wegoptimiert
 * werden:
 *
 * 1. SIGNATUR-ERHALTEND. Der Rueckgabetyp ist der Handler-Typ `H` selbst,
 *    nicht ein eigener `RouteHandler`-Typ. Next.js prueft beim Build die
 *    exportierten Handler jeder `route.ts` gegen eine generierte
 *    Typdatei — Erstparameter, Kontextparameter, Rueckgabetyp. Ein
 *    Wrapper, der die Signatur vereinheitlicht (`ctx?: any`), aendert
 *    genau das, was dort geprueft wird. Mit `H -> H` sieht Next exakt
 *    dieselbe Signatur wie vor dem Wrappen.
 *
 * 2. NIE WERFEND. Das Messen liegt im `finally` jedes Handlers im Haus.
 *    Wirft es, wird aus einer erfolgreichen Antwort ein 500er — die
 *    Messung wuerde die Anwendung kaputtmachen, die sie ueberwachen
 *    soll. Deshalb ist der Messblock selbst noch einmal gekapselt und
 *    verschluckt jeden Fehler.
 */

import { recordMetric } from './metrics'

/** Ein Next-Route-Handler in beliebiger Signatur. */
type AnyHandler = (...args: never[]) => Promise<Response>

/**
 * Pfad aus dem Request lesen — ohne je zu werfen.
 *
 * Der Handler kann mit allem aufgerufen werden: `req.url` kann fehlen
 * (Unit-Tests mit Attrappen), eine relative URL sein oder gar kein
 * String. Kein Fall davon darf die Antwort kippen.
 */
function pfadAus(arg: unknown): { path: string; method: string } {
  const req = arg as { url?: unknown; method?: unknown } | undefined
  const method = typeof req?.method === 'string' ? req.method : 'UNKNOWN'
  if (typeof req?.url !== 'string') return { path: 'unbekannt', method }
  try {
    return { path: new URL(req.url).pathname, method }
  } catch {
    return { path: req.url.split('?')[0] || 'unbekannt', method }
  }
}

export function withTracking<H extends AnyHandler>(handler: H): H {
  const gewrappt = async (...args: Parameters<H>): Promise<Response> => {
    const start = performance.now()
    let statusCode = 500

    try {
      const response = await handler(...args)
      // Ein Handler, der nichts zurueckgibt, ist ein Fehler — aber einer,
      // den Next meldet, nicht das Tracking.
      statusCode = typeof response?.status === 'number' ? response.status : 500
      return response
    } catch (err) {
      statusCode = 500
      throw err
    } finally {
      try {
        const { path, method } = pfadAus(args[0])
        recordMetric({
          path,
          method,
          statusCode,
          durationMs: performance.now() - start,
          timestamp: Date.now(),
        })
      } catch {
        // Messung ist Beiwerk. Sie darf die Antwort nie beeinflussen.
      }
    }
  }

  return gewrappt as unknown as H
}
