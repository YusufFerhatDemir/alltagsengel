import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe/client'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOrgRole } from '@/lib/organizations/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://alltagsengel.care'

/**
 * POST /api/stripe/portal
 * Body: { orgId: string }
 * Erstellt eine Stripe-Billing-Portal-Session und gibt die URL zurück.
 * Nur Owner/Admin der Organisation.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const orgId = String(body?.orgId || '')

    if (!/^[0-9a-f-]{36}$/i.test(orgId)) {
      return NextResponse.json({ error: 'Ungültige Organisations-ID' }, { status: 400 })
    }

    const auth = await requireOrgRole(orgId, ['owner', 'admin'])
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const admin = createAdminClient()
    const { data: sub } = await admin
      .from('organization_subscriptions')
      .select('stripe_customer_id')
      .eq('organization_id', orgId)
      .maybeSingle()

    if (!sub?.stripe_customer_id) {
      return NextResponse.json({ error: 'Kein Stripe-Kunde für diese Organisation vorhanden' }, { status: 404 })
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: `${SITE_URL}/mis/settings`,
    })

    return NextResponse.json({ url: session.url })
  } catch (e: any) {
    console.error('[api] Unerwarteter Fehler:', e)
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
  }
}
