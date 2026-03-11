import { NextResponse } from 'next/server'
import { calculatePrice, getAvailableTiers, getAvailableSurcharges } from '@/lib/pricing-engine'
import type { PricingRequest } from '@/lib/types/pricing'

export async function POST(request: Request) {
  try {
    const body = await request.json() as PricingRequest

    if (!body.tier_slug) {
      return NextResponse.json({ error: 'tier_slug ist erforderlich' }, { status: 400 })
    }

    const breakdown = await calculatePrice(body)
    return NextResponse.json(breakdown)
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Preisberechnung fehlgeschlagen' }, { status: 500 })
  }
}

/** GET returns available tiers and surcharges for the booking form */
export async function GET() {
  try {
    const [tiers, surcharges] = await Promise.all([
      getAvailableTiers(),
      getAvailableSurcharges(),
    ])
    return NextResponse.json({ tiers, surcharges })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Fehler beim Laden der Preisdaten' }, { status: 500 })
  }
}
