import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe/client'
import { PLAN_TO_PRICE, isPaidPlan } from '@/lib/stripe/config'
import { getOrCreateStripeCustomer } from '@/lib/stripe/helpers'
import { requireOrgRole } from '@/lib/organizations/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://alltagsengel.care'

/**
 * POST /api/stripe/checkout
 * Body: { orgId: string, plan: 'starter' | 'pro' | 'scale' }
 * Erstellt eine Stripe-Checkout-Session für ein neues Abo und gibt die URL zurück.
 * Nur Owner/Admin der Organisation.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const orgId = String(body?.orgId || '')
    const plan = String(body?.plan || '')

    if (!/^[0-9a-f-]{36}$/i.test(orgId)) {
      return NextResponse.json({ error: 'Ungültige Organisations-ID' }, { status: 400 })
    }
    if (!isPaidPlan(plan)) {
      return NextResponse.json({ error: 'Ungültiger Plan' }, { status: 400 })
    }

    const auth = await requireOrgRole(orgId, ['owner', 'admin'])
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const stripeCustomerId = await getOrCreateStripeCustomer(orgId)

    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: 'subscription',
      line_items: [{ price: PLAN_TO_PRICE[plan], quantity: 1 }],
      success_url: `${SITE_URL}/mis/settings?checkout=success`,
      cancel_url: `${SITE_URL}/mis/settings?checkout=cancel`,
      metadata: { orgId },
      subscription_data: { metadata: { orgId } },
      allow_promotion_codes: true,
    })

    return NextResponse.json({ url: session.url })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 })
  }
}
