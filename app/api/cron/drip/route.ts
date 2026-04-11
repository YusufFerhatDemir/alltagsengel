import { NextResponse } from 'next/server'

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
      headers: { 'Content-Type': 'application/json' },
    })

    const result = await response.json()
    console.log('[CRON] Drip-Kampagne ausgeführt:', result)

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      result,
    })
  } catch (err) {
    console.error('[CRON] Drip-Kampagne Fehler:', err)
    return NextResponse.json({ error: 'Cron job failed' }, { status: 500 })
  }
}
