import type Stripe from 'stripe'
import { stripe } from '@/lib/stripe/client'
import { createAdminClient } from '@/lib/supabase/admin'
import { PLAN_FEATURES, type OrganizationSubscription } from '@/lib/organizations/types'
import { planFromPriceId } from '@/lib/stripe/config'

/** Stripe-Status → erlaubter Status in organization_subscriptions (Check-Constraint). */
function mapStripeStatus(status: Stripe.Subscription.Status): OrganizationSubscription['status'] {
  switch (status) {
    case 'trialing':
      return 'trialing'
    case 'active':
      return 'active'
    case 'past_due':
    case 'unpaid':
    case 'incomplete':
    case 'paused':
      return 'past_due'
    case 'canceled':
    case 'incomplete_expired':
    default:
      return 'cancelled'
  }
}

/**
 * Liefert die stripe_customer_id der Org — legt bei Bedarf einen neuen
 * Stripe Customer an und speichert die ID in organization_subscriptions.
 */
export async function getOrCreateStripeCustomer(orgId: string): Promise<string> {
  const admin = createAdminClient()

  const { data: sub } = await admin
    .from('organization_subscriptions')
    .select('stripe_customer_id')
    .eq('organization_id', orgId)
    .maybeSingle()

  if (sub?.stripe_customer_id) return sub.stripe_customer_id

  const { data: org } = await admin
    .from('organizations')
    .select('name')
    .eq('id', orgId)
    .single()

  const customer = await stripe.customers.create({
    name: org?.name,
    metadata: { orgId },
  })

  const { error } = await admin
    .from('organization_subscriptions')
    .upsert(
      { organization_id: orgId, stripe_customer_id: customer.id },
      { onConflict: 'organization_id' }
    )
  if (error) throw new Error(`stripe_customer_id konnte nicht gespeichert werden: ${error.message}`)

  return customer.id
}

/**
 * Schreibt den Stand eines Stripe-Subscription-Objekts in organization_subscriptions.
 * Wird ausschließlich vom Webhook-Handler aufgerufen (service_role, bypasst RLS).
 * Idempotent: UPSERT über organization_id.
 */
export async function syncSubscriptionToDb(subscription: Stripe.Subscription): Promise<void> {
  const orgId = subscription.metadata?.orgId
  if (!orgId) return

  const item = subscription.items.data[0]
  const plan = planFromPriceId(item?.price?.id) || 'free'

  const admin = createAdminClient()
  const { error } = await admin
    .from('organization_subscriptions')
    .upsert(
      {
        organization_id: orgId,
        plan,
        status: mapStripeStatus(subscription.status),
        stripe_customer_id:
          typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id,
        stripe_subscription_id: subscription.id,
        current_period_start: item ? new Date(item.current_period_start * 1000).toISOString() : null,
        current_period_end: item ? new Date(item.current_period_end * 1000).toISOString() : null,
        features: PLAN_FEATURES[plan],
      },
      { onConflict: 'organization_id' }
    )
  if (error) throw new Error(`Subscription-Sync fehlgeschlagen: ${error.message}`)

  await admin.from('organizations').update({ billing_plan: plan }).eq('id', orgId)
}

/** Setzt eine Org bei Kündigung/Ablauf auf den Free-Plan zurück. */
export async function downgradeToFree(orgId: string): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin
    .from('organization_subscriptions')
    .upsert(
      {
        organization_id: orgId,
        plan: 'free',
        status: 'cancelled',
        stripe_subscription_id: null,
        current_period_start: null,
        current_period_end: null,
        features: PLAN_FEATURES.free,
      },
      { onConflict: 'organization_id' }
    )
  if (error) throw new Error(`Downgrade auf Free fehlgeschlagen: ${error.message}`)

  await admin.from('organizations').update({ billing_plan: 'free' }).eq('id', orgId)
}
