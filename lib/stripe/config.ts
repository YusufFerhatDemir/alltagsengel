import type { BillingPlan } from '@/lib/organizations/types'

/** Nur die kostenpflichtigen Pläne haben einen Stripe-Price. */
export type PaidPlan = 'starter' | 'pro' | 'scale'

export const PAID_PLANS: PaidPlan[] = ['starter', 'pro', 'scale']

export function isPaidPlan(plan: string): plan is PaidPlan {
  return (PAID_PLANS as string[]).includes(plan)
}

export const PLAN_TO_PRICE: Record<PaidPlan, string> = {
  starter: process.env.STRIPE_PRICE_STARTER!,
  pro: process.env.STRIPE_PRICE_PRO!,
  scale: process.env.STRIPE_PRICE_SCALE!,
}

export const PRICE_TO_PLAN: Record<string, PaidPlan> = {
  [process.env.STRIPE_PRICE_STARTER!]: 'starter',
  [process.env.STRIPE_PRICE_PRO!]: 'pro',
  [process.env.STRIPE_PRICE_SCALE!]: 'scale',
}

export function planFromPriceId(priceId: string | null | undefined): BillingPlan | null {
  if (!priceId) return null
  return PRICE_TO_PLAN[priceId] || null
}
