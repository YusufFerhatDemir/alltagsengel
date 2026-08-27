import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { logger } from '@/lib/logger'
import { cronAuthHeader, pruefeCronGeheimnis } from '@/lib/api/cron-auth'
import { withTracking } from '@/lib/monitoring/tracker'
const log = logger.child('cron:drip')

// ═══════════════════════════════════════════════════════════
// VERCEL CRON JOB — Drip E-Mail Kampagne
// ═══════════════════════════════════════════════════════════
// Wird täglich um 09:00 Uhr aufgerufen.
// Leitet weiter an die bestehende Drip-API.
// Geschützt durch CRON_SECRET.
// ═══════════════════════════════════════════════════════════

export const GET = withTracking(async function GET(request: Request) {
  const abweisung = pruefeCronGeheimnis(request)
  if (abweisung) return abweisung

  try {
    // Interne Weiterleitung an die Drip-Kampagne
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://alltagsengel.care'
    const response = await fetch(`${baseUrl}/api/drip`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // CRON_SECRET weiterreichen — /api/drip ist jetzt fail-closed geschützt.
        Authorization: cronAuthHeader(),
      },
    })

    const result = await response.json()
    log.info('Drip-Kampagne ausgeführt', { result })

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      result,
    })
  } catch (err) {
    return safeApiError(err, request)
  }
})
