import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
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
  } catch (err) {
    return safeApiError(err, request)
  }
}

/** GET returns available tiers and surcharges for the booking form */
export async function GET(request: Request) {
  try {
    const [tiers, surcharges] = await Promise.all([
      getAvailableTiers(),
      getAvailableSurcharges(),
    ])
    return NextResponse.json({ tiers, surcharges })
  } catch (err) {
    return safeApiError(err, request)
  }
}
