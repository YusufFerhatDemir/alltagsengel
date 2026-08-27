/**
 * GET /api/admin/monitoring
 *
 * Metriken-Endpunkt fuer Administratoren. Zeigt API-Antwortzeiten
 * (p50/p95/p99), Fehlerraten und Instanz-Uptime aus dem In-Memory-
 * Ring-Buffer (letzte 1000 Requests).
 *
 * Erfordert Admin-Authentifizierung (requireOpsAdmin).
 */

import { NextResponse } from 'next/server'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { getMetrics } from '@/lib/monitoring/metrics'
import { withTracking } from '@/lib/monitoring/tracker'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = withTracking(async function GET() {
  const auth = await requireOpsAdmin('system.verwalten')
  if (!auth.ok) return auth.response

  const metrics = getMetrics()

  return NextResponse.json({
    ...metrics,
    _hinweis: 'In-Memory pro Instanz — Daten gehen bei Serverless-Cold-Start verloren.',
  })
})
