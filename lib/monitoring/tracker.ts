/**
 * Request-Tracking Utility.
 *
 * Wrapper fuer API-Route-Handler, der automatisch Antwortzeit und
 * Statuscode in den Metriken-Buffer schreibt.
 *
 * Nutzung:
 *   import { withTracking } from '@/lib/monitoring/tracker'
 *
 *   async function _GET(req: NextRequest) { ... }
 *   export const GET = withTracking(_GET)
 */

import { NextRequest, NextResponse } from 'next/server'
import { recordMetric } from './metrics'

type RouteHandler = (
  req: NextRequest,
  ctx?: any,
) => Promise<NextResponse | Response>

export function withTracking(handler: RouteHandler): RouteHandler {
  return async (req, ctx) => {
    const start = performance.now()
    let statusCode = 500

    try {
      const response = await handler(req, ctx)
      statusCode = response.status
      return response
    } catch (err) {
      statusCode = 500
      throw err
    } finally {
      const durationMs = performance.now() - start
      const url = new URL(req.url)

      recordMetric({
        path: url.pathname,
        method: req.method,
        statusCode,
        durationMs,
        timestamp: Date.now(),
      })
    }
  }
}
