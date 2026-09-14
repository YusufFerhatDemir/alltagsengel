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

    const result = await response.json().catch(() => null)

    // BEFUND (14.09.2026, Block 30): `response.ok` wurde nie geprueft.
    // Antwortete /api/drip mit 401 (falsches Geheimnis), 500
    // (RESEND_API_KEY fehlt) oder 503, meldete dieser Lauf trotzdem
    // `success: true` mit HTTP 200 — und Vercel verbuchte einen gruenen
    // Cron. Eine Kampagne, die nichts versendet, sah aus wie eine, die
    // alles versendet hat.
    //
    // Jede andere Cron-Route macht das bereits richtig: indexnow prueft
    // `.ok`, zustellung-retry reicht `ok: ergebnis.ok` durch. Diese hier
    // war die einzige Ausnahme.
    if (!response.ok) {
      log.error('Drip-Kampagne fehlgeschlagen', { status: response.status, result })
      return NextResponse.json(
        {
          success: false,
          status: response.status,
          timestamp: new Date().toISOString(),
          grund: 'Die Drip-Kampagne hat den Lauf abgewiesen — es wurde nichts versendet.',
          result,
        },
        { status: 502 },
      )
    }

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
