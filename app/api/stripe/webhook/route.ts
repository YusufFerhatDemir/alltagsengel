import { NextRequest, NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { stripe } from '@/lib/stripe/client'
import { syncSubscriptionToDb, downgradeToFree } from '@/lib/stripe/helpers'
import { createAdminClient } from '@/lib/supabase/admin'
import { withTracking } from '@/lib/monitoring/tracker'
import { logger } from '@/lib/logger'

const log = logger.child('stripe-webhook')

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/stripe/webhook
 * Verarbeitet Stripe-Events. Signatur wird geprüft, Body muss roh (unparsed) sein.
 * Idempotent: syncSubscriptionToDb/downgradeToFree upserten über organization_id.
 */
export const POST = withTracking(async function POST(req: NextRequest) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')

  if (!sig) {
    return NextResponse.json({ error: 'Signatur fehlt' }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch {
    return NextResponse.json({ error: 'Signatur ungültig' }, { status: 400 })
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object
      if (session.mode === 'subscription' && session.subscription) {
        const subscriptionId =
          typeof session.subscription === 'string' ? session.subscription : session.subscription.id
        const sub = await stripe.subscriptions.retrieve(subscriptionId)
        await syncSubscriptionToDb(sub)
      }
      break
    }

    case 'customer.subscription.updated': {
      await syncSubscriptionToDb(event.data.object)
      break
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object
      const orgId = sub.metadata?.orgId
      if (orgId) await downgradeToFree(orgId)
      break
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object
      const subDetails = invoice.parent?.subscription_details
      const orgId = subDetails?.metadata?.orgId
      if (orgId) {
        const admin = createAdminClient()
        // Ohne Ergebnispruefung bliebe eine Organisation nach einer
        // gescheiterten Zahlung auf 'aktiv' stehen — voller Zugang trotz
        // offener Rechnung, und niemand erfaehrt davon. Ein Webhook darf
        // nicht abbrechen (Stripe wiederholt sonst endlos), aber der
        // Ausfall gehoert ins Protokoll.
        const { data: gesetzt, error: statusFehler } = await admin
          .from('organization_subscriptions')
          .update({ status: 'past_due' })
          .eq('organization_id', orgId)
          .select('organization_id')

        if (statusFehler || (gesetzt?.length ?? 0) === 0) {
          log.error('Abo NICHT auf past_due gesetzt — Organisation behaelt vollen Zugang', {
            orgId,
            errorMessage: statusFehler?.message ?? 'keine Zeile getroffen',
          })
        }
      }
      break
    }

    default:
      break
  }

  // Immer 200 zurückgeben (Stripe wiederholt sonst).
  return NextResponse.json({ received: true })
})
