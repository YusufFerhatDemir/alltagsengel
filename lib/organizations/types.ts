// ═══════════════════════════════════════════════════════════════
// Multi-Mandant (Phase 3) — Typen & Konstanten
// ═══════════════════════════════════════════════════════════════

/** Feste UUID der Stamm-Organisation Alltagsengel (kodiert IK 460629986). */
export const DEFAULT_ORG_ID = '00000000-0000-4000-8000-000460629986'

/** Cookie, das die aktuell aktive Organisation des Admins trägt. */
export const ACTIVE_ORG_COOKIE = 'ae_active_org'

export type BillingPlan = 'intern' | 'free' | 'starter' | 'pro' | 'scale'
export type OrgStatus = 'onboarding' | 'active' | 'suspended' | 'cancelled'
export type OrgRole = 'owner' | 'admin' | 'staff'

export interface OrganizationAddress {
  strasse?: string
  plz?: string
  ort?: string
  bundesland?: string
}

export interface Organization {
  id: string
  name: string
  ik_nummer: string | null
  address: OrganizationAddress
  bundesland: string | null
  settings: Record<string, unknown>
  billing_plan: BillingPlan
  status: OrgStatus
  onboarding_step: number
  created_at: string
  updated_at: string
}

export interface OrganizationMember {
  id: string
  organization_id: string
  user_id: string
  role: OrgRole
  created_at: string
}

export interface OrganizationSubscription {
  id: string
  organization_id: string
  plan: BillingPlan
  status: 'trialing' | 'active' | 'past_due' | 'cancelled'
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  current_period_start: string | null
  current_period_end: string | null
  features: Record<string, unknown>
}

/** Feature-Matrix je Tarif (Quelle: Bauplan Abschnitt 7.1). */
export const PLAN_FEATURES: Record<BillingPlan, Record<string, unknown>> = {
  intern: { max_klienten: null, edifact: true, ki_pruefung: true, elnw: true, api: true },
  free: { max_klienten: 10, edifact: false, ki_pruefung: false, elnw: false, api: false },
  starter: { max_klienten: 50, edifact: true, ki_pruefung: false, elnw: false, api: false },
  pro: { max_klienten: 150, edifact: true, ki_pruefung: true, elnw: true, api: false },
  scale: { max_klienten: null, edifact: true, ki_pruefung: true, elnw: true, api: true },
}

export const PLAN_LABELS: Record<BillingPlan, string> = {
  intern: 'Intern (Eigenbetrieb)',
  free: 'Free',
  starter: 'Starter — 99 €/Monat',
  pro: 'Pro — 199 €/Monat',
  scale: 'Scale — 349 €/Monat',
}

export const BUNDESLAENDER = [
  'Baden-Württemberg', 'Bayern', 'Berlin', 'Brandenburg', 'Bremen', 'Hamburg',
  'Hessen', 'Mecklenburg-Vorpommern', 'Niedersachsen', 'Nordrhein-Westfalen',
  'Rheinland-Pfalz', 'Saarland', 'Sachsen', 'Sachsen-Anhalt',
  'Schleswig-Holstein', 'Thüringen',
] as const
