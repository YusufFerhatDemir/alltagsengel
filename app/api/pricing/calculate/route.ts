import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { getClientIp } from '@/lib/rate-limit'
import { rateLimitPersistent } from '@/lib/rate-limit-persistent'
import { calculatePrice, getAvailableTiers, getAvailableSurcharges } from '@/lib/pricing-engine'
import type { PricingRequest } from '@/lib/types/pricing'
import { withTracking } from '@/lib/monitoring/tracker'

// ── WARUM HIER EIN LIMIT STEHT ───────────────────────────────────────────
// Die Route ist oeffentlich und soll es bleiben: das Buchungsformular
// braucht sie ohne Anmeldung. Sie war aber bis zum 13.09.2026 die einzige
// oeffentliche, schreibfaehige Route ohne Begrenzung — und jeder Aufruf
// loest Datenbankarbeit aus (Tarife, Zuschlaege, Preisberechnung).
//
// Das ist kein Datenleck, sondern ein Kostenhebel: unbegrenzt aufgerufen
// laeuft sie auf Rechnung des Betreibers. Die Grenze ist bewusst weit —
// wer ein Formular ausfuellt, rechnet mehrfach, waehrend er Optionen
// durchprobiert.
const LIMIT_PRO_IP = 60
const FENSTER_MS = 10 * 60 * 1000

async function ueberLimit(request: Request): Promise<boolean> {
  const ip = getClientIp(request)
  return !(await rateLimitPersistent(`pricing:${ip}`, LIMIT_PRO_IP, FENSTER_MS))
}

export const POST = withTracking(async function POST(request: Request) {
  try {
    if (await ueberLimit(request)) {
      return NextResponse.json(
        { error: 'Zu viele Anfragen — bitte kurz warten.' },
        { status: 429 },
      )
    }

    const body = await request.json() as PricingRequest

    if (!body.tier_slug) {
      return NextResponse.json({ error: 'tier_slug ist erforderlich' }, { status: 400 })
    }
    // Der Schluessel geht in eine Datenbankabfrage. Ein Objekt oder eine
    // ellenlange Zeichenkette hat dort nichts verloren.
    if (typeof body.tier_slug !== 'string' || body.tier_slug.length > 80) {
      return NextResponse.json({ error: 'Ungueltiger tier_slug' }, { status: 400 })
    }

    const breakdown = await calculatePrice(body)
    return NextResponse.json(breakdown)
  } catch (err) {
    return safeApiError(err, request)
  }
})

/** GET returns available tiers and surcharges for the booking form */
export const GET = withTracking(async function GET(request: Request) {
  try {
    if (await ueberLimit(request)) {
      return NextResponse.json(
        { error: 'Zu viele Anfragen — bitte kurz warten.' },
        { status: 429 },
      )
    }

    const [tiers, surcharges] = await Promise.all([
      getAvailableTiers(),
      getAvailableSurcharges(),
    ])
    return NextResponse.json({ tiers, surcharges })
  } catch (err) {
    return safeApiError(err, request)
  }
})
