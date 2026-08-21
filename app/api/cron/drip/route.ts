import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { logger } from '@/lib/logger'
const log = logger.child('cron:drip')

// ═══════════════════════════════════════════════════════════
// VERCEL CRON JOB — Drip E-Mail Kampagne
// ═══════════════════════════════════════════════════════════
// Wird täglich um 09:00 Uhr aufgerufen.
// Leitet weiter an die bestehende Drip-API.
// Geschützt durch CRON_SECRET.
// ═══════════════════════════════════════════════════════════

export async function GET(request: Request) {
  // Vercel Cron sendet Authorization Header
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Interne Weiterleitung an die Drip-Kampagne
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://alltagsengel.care'
    const response = await fetch(`${baseUrl}/api/drip`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // CRON_SECRET weiterreichen — /api/drip ist jetzt fail-closed geschützt.
        Authorization: `Bearer ${process.env.CRON_SECRET}`,
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
}
