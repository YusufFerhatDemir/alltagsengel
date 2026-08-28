import { NextRequest, NextResponse } from 'next/server'
import { getClientIp } from '@/lib/rate-limit'
import { rateLimitPersistent } from '@/lib/rate-limit-persistent'
import { withTracking } from '@/lib/monitoring/tracker'

/**
 * Welle-1 CAPI-Stub (Conversions API für Meta + TikTok).
 *
 * Aktuell: Stub — akzeptiert das Event, validiert grob, persistiert noch
 * NICHT und sendet noch NICHT an Meta/TikTok. Welle 2 ergänzt:
 *   - META_CAPI_ACCESS_TOKEN + META_PIXEL_ID → Meta Graph-API POST
 *   - TIKTOK_CAPI_ACCESS_TOKEN + TIKTOK_PIXEL_ID → TikTok Events-API POST
 *
 * Endpoint dient bewusst schon jetzt als stabiler Aufrufpunkt aus
 * lib/tracking.ts, damit Frontend-Code beim Welle-2-Switch nicht
 * angefasst werden muss.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface CapiPayload {
  event_name: string
  event_id?: string
  value?: number
  currency?: string
  email?: string
  phone?: string
  fbclid?: string | null
  ttclid?: string | null
  source_url?: string
}

const ALLOWED_EVENTS = new Set([
  'Lead',
  'CompleteRegistration',
  'Schedule',
  'PlaceAnOrder',
  'Contact',
  'Purchase',
])

export const POST = withTracking(async function POST(req: NextRequest) {
  try {
    // NIEDRIG-8 (Security-Audit 2026-08-19): oeffentlicher Schreibendpunkt
    // ohne Limit. 60 Events/Minute pro IP — gleiche Groessenordnung wie
    // /api/analytics/vitals.
    //
    // Track 13 B2: von `rateLimit` (Map im Modul-Scope, also je
    // Serverless-Instanz) auf den persistenten Zaehler gezogen. Diese
    // Route persistiert heute nichts (Welle-1-Stub), soll aber in Welle 2
    // an Meta/TikTok POSTen — dann ist das Limit ein KOSTEN-Deckel gegen
    // eine fremde API, und ein Zaehler, der bei jeder neuen Instanz von
    // vorn beginnt, waere dafuer wertlos. Jetzt umgestellt, solange es
    // noch nichts kostet.
    if (!(await rateLimitPersistent(`capi:${getClientIp(req)}`, 60, 60_000))) {
      return NextResponse.json({ ok: true, accepted: false })
    }

    const body = (await req.json()) as Partial<CapiPayload>
    if (!body?.event_name || !ALLOWED_EVENTS.has(body.event_name)) {
      return NextResponse.json({ ok: true, accepted: false })
    }

    const hasMeta =
      !!process.env.META_PIXEL_ID && !!process.env.META_CAPI_ACCESS_TOKEN
    const hasTikTok =
      !!process.env.TIKTOK_PIXEL_ID && !!process.env.TIKTOK_CAPI_ACCESS_TOKEN

    // Welle-1: Stub-Verhalten — nur Quittung, kein Outbound.
    // Welle-2: hier echte Meta/TikTok-POSTs einklinken.
    return NextResponse.json({
      ok: true,
      accepted: true,
      destinations: {
        meta: hasMeta ? 'configured' : 'missing-env',
        tiktok: hasTikTok ? 'configured' : 'missing-env',
      },
      stub: true,
    })
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 })
  }
})
