import { createClient } from '@/lib/supabase/server'
import { isFeatureEnabled } from '@/lib/feature-flags'
import type {
  PricingTier,
  PricingSurcharge,
  PricingConfig,
  PricingRegion,
  PricingRequest,
  PricingRequestExtended,
  PricingBreakdown,
  PricingBreakdownExtended,
  PricingCost,
  CostBreakdown,
  MarginBreakdown,
  ReviewFlag,
  ReviewRule,
  SurchargeDetail,
} from '@/lib/types/pricing'

// Simple in-memory cache (5 min TTL)
let cache: {
  tiers: PricingTier[]
  surcharges: PricingSurcharge[]
  config: Record<string, string>
  ts: number
} | null = null

const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

async function loadPricingData() {
  if (cache && Date.now() - cache.ts < CACHE_TTL) return cache

  const supabase = await createClient()

  const [tiersRes, surchargesRes, configRes] = await Promise.all([
    supabase.from('kf_pricing_tiers').select('*').eq('enabled', true).order('sort_order'),
    supabase.from('kf_pricing_surcharges').select('*').eq('enabled', true).order('sort_order'),
    supabase.from('kf_pricing_config').select('*').eq('enabled', true),
  ])

  const tiers = (tiersRes.data || []).map(t => ({
    ...t,
    base_price: Number(t.base_price),
    per_km_rate: Number(t.per_km_rate),
    min_price: Number(t.min_price),
    wait_per_min: Number(t.wait_per_min),
    surcharge_amount: Number(t.surcharge_amount),
  })) as PricingTier[]

  const surcharges = (surchargesRes.data || []).map(s => ({
    ...s,
    value: Number(s.value),
  })) as PricingSurcharge[]

  const configRows = (configRes.data || []) as PricingConfig[]
  const config: Record<string, string> = {}
  for (const row of configRows) {
    try {
      config[row.key] = JSON.parse(row.value as any)
    } catch {
      config[row.key] = String(row.value)
    }
  }

  cache = { tiers, surcharges, config, ts: Date.now() }
  return cache
}

/** Invalidate pricing cache (call after admin updates) */
export function invalidatePricingCache() {
  cache = null
}

/** Get all enabled tiers */
export async function getAvailableTiers(): Promise<PricingTier[]> {
  const data = await loadPricingData()
  return data.tiers
}

/** Get all enabled surcharges */
export async function getAvailableSurcharges(): Promise<PricingSurcharge[]> {
  const data = await loadPricingData()
  return data.surcharges
}

/** Get pricing config value */
export async function getConfigValue(key: string): Promise<string | undefined> {
  const data = await loadPricingData()
  return data.config[key]
}

/** Main pricing calculation */
export async function calculatePrice(req: PricingRequest): Promise<PricingBreakdown> {
  const data = await loadPricingData()

  // Find tier
  const tier = data.tiers.find(t => t.slug === req.tier_slug)
  if (!tier) {
    throw new Error(`Tier '${req.tier_slug}' nicht gefunden`)
  }

  const km = Math.max(0, req.estimated_km || 0)
  const waitMin = Math.max(0, req.estimated_wait_minutes || 0)

  // Base calculations
  const base_price = tier.base_price
  const distance_cost = round2(km * tier.per_km_rate)
  const wait_cost = round2(waitMin * tier.wait_per_min)
  const tier_surcharge = tier.surcharge_amount

  let subtotal = round2(base_price + distance_cost + wait_cost + tier_surcharge)

  // Apply extra surcharges (stair_assistance, companion, etc.)
  const appliedSurcharges: SurchargeDetail[] = []
  const requestedSlugs = req.extra_surcharges || []

  for (const slug of requestedSlugs) {
    const sc = data.surcharges.find(s => s.slug === slug)
    if (!sc) continue

    let amount: number
    if (sc.surcharge_type === 'percentage') {
      amount = round2(subtotal * (sc.value / 100))
    } else {
      amount = sc.value
    }

    appliedSurcharges.push({
      name: sc.name,
      slug: sc.slug,
      type: sc.surcharge_type,
      value: sc.value,
      amount,
    })
  }

  // Night surcharge
  if (req.is_night) {
    const nightSc = data.surcharges.find(s => s.slug === 'night_premium')
    if (nightSc && !requestedSlugs.includes('night_premium')) {
      const amount = nightSc.surcharge_type === 'percentage'
        ? round2(subtotal * (nightSc.value / 100))
        : nightSc.value
      appliedSurcharges.push({
        name: nightSc.name,
        slug: nightSc.slug,
        type: nightSc.surcharge_type,
        value: nightSc.value,
        amount,
      })
    }
  }

  // Holiday surcharge
  if (req.is_holiday) {
    const holSc = data.surcharges.find(s => s.slug === 'holiday_premium')
    if (holSc && !requestedSlugs.includes('holiday_premium')) {
      const amount = holSc.surcharge_type === 'percentage'
        ? round2(subtotal * (holSc.value / 100))
        : holSc.value
      appliedSurcharges.push({
        name: holSc.name,
        slug: holSc.slug,
        type: holSc.surcharge_type,
        value: holSc.value,
        amount,
      })
    }
  }

  const surcharges_total = round2(appliedSurcharges.reduce((sum, s) => sum + s.amount, 0))
  const afterSurcharges = round2(subtotal + surcharges_total)

  // Regional multiplier
  let region_multiplier = 1.0
  if (req.region_code) {
    const supabase = await createClient()
    const { data: regionData } = await supabase
      .from('kf_pricing_regions')
      .select('price_multiplier')
      .eq('region_code', req.region_code)
      .eq('tier_id', tier.id)
      .eq('enabled', true)
      .single()
    if (regionData) {
      region_multiplier = Number(regionData.price_multiplier)
    }
  }

  const region_adjusted = round2(afterSurcharges * region_multiplier)

  // Min price check
  const min_price = tier.min_price
  const is_min_price_applied = region_adjusted < min_price
  const priceBeforeReturn = is_min_price_applied ? min_price : region_adjusted

  // Return trip
  const return_trip_multiplier = req.is_return_trip ? 2 : 1
  const total = round2(priceBeforeReturn * return_trip_multiplier)

  // Build display lines
  const display_lines: string[] = [
    `Grundpreis (${tier.name}): ${fmt(base_price)}`,
    `Strecke (${km} km × ${fmt(tier.per_km_rate)}): ${fmt(distance_cost)}`,
  ]
  if (waitMin > 0) {
    display_lines.push(`Wartezeit (${waitMin} Min × ${fmt(tier.wait_per_min)}): ${fmt(wait_cost)}`)
  }
  if (tier_surcharge > 0) {
    display_lines.push(`Transportzuschlag: ${fmt(tier_surcharge)}`)
  }
  for (const sc of appliedSurcharges) {
    const label = sc.type === 'percentage' ? `${sc.name} (${sc.value}%)` : sc.name
    display_lines.push(`${label}: ${fmt(sc.amount)}`)
  }
  if (region_multiplier !== 1.0) {
    display_lines.push(`Regionaler Faktor: ×${region_multiplier}`)
  }
  if (is_min_price_applied) {
    display_lines.push(`Mindestpreis angewendet: ${fmt(min_price)}`)
  }
  if (req.is_return_trip) {
    display_lines.push(`Hin- und Rückfahrt: ×2`)
  }
  display_lines.push(`Gesamtpreis: ${fmt(total)}`)

  return {
    tier: { name: tier.name, slug: tier.slug, icon: tier.icon },
    base_price,
    distance_cost,
    wait_cost,
    tier_surcharge,
    surcharges: appliedSurcharges,
    surcharges_total,
    subtotal,
    region_multiplier,
    region_adjusted,
    min_price,
    is_min_price_applied,
    return_trip_multiplier,
    total,
    display_lines,
  }
}

// =============================================
// Extended Pricing: Cost, Margin, Review Rules
// =============================================

/** Load cost config for a tier */
async function loadCostForTier(tierId: string): Promise<PricingCost | null> {
  const supabase = await createClient()
  const today = new Date().toISOString().split('T')[0]

  const { data } = await supabase
    .from('kf_pricing_costs')
    .select('*')
    .eq('tier_id', tierId)
    .lte('effective_from', today)
    .or(`effective_to.is.null,effective_to.gte.${today}`)
    .order('effective_from', { ascending: false })
    .limit(1)
    .single()

  if (!data) return null
  return {
    ...data,
    fuel_cost_per_km: Number(data.fuel_cost_per_km),
    driver_rate_per_km: Number(data.driver_rate_per_km),
    vehicle_cost_per_km: Number(data.vehicle_cost_per_km),
    driver_rate_per_min: Number(data.driver_rate_per_min),
    fixed_overhead: Number(data.fixed_overhead),
  } as PricingCost
}

/** Calculate internal costs for a trip */
export function calculateCosts(
  cost: PricingCost,
  km: number,
  waitMinutes: number
): CostBreakdown {
  const fuel = round2(km * cost.fuel_cost_per_km)
  const driver_distance = round2(km * cost.driver_rate_per_km)
  const driver_time = round2(waitMinutes * cost.driver_rate_per_min)
  const vehicle = round2(km * cost.vehicle_cost_per_km)
  const fixed_overhead = cost.fixed_overhead

  return {
    fuel,
    driver_distance,
    driver_time,
    vehicle,
    fixed_overhead,
    total: round2(fuel + driver_distance + driver_time + vehicle + fixed_overhead),
  }
}

/** Calculate margin and check thresholds */
export async function calculateMargin(
  revenue: number,
  costTotal: number
): Promise<MarginBreakdown> {
  const data = await loadPricingData()
  const minAmount = Number(data.config['min_margin_amount'] || 12)
  const minPercent = Number(data.config['min_margin_percent'] || 20)

  const margin_amount = round2(revenue - costTotal)
  const margin_percent = revenue > 0 ? round2((margin_amount / revenue) * 100) : 0

  return {
    revenue,
    total_cost: costTotal,
    margin_amount,
    margin_percent,
    meets_amount_threshold: margin_amount >= minAmount,
    meets_percent_threshold: margin_percent >= minPercent,
    meets_threshold: margin_amount >= minAmount && margin_percent >= minPercent,
  }
}

/** Load and evaluate review rules against a request + breakdown */
export async function evaluateReviewRules(
  req: PricingRequestExtended,
  breakdown: PricingBreakdown,
  margin?: MarginBreakdown
): Promise<ReviewFlag[]> {
  const supabase = await createClient()
  const { data: rules } = await supabase
    .from('kf_review_rules')
    .select('*')
    .eq('enabled', true)
    .order('sort_order')

  if (!rules || rules.length === 0) return []

  const flags: ReviewFlag[] = []

  // Build evaluation context
  const ctx: Record<string, any> = {
    estimated_km: req.estimated_km || 0,
    estimated_wait_minutes: req.estimated_wait_minutes || 0,
    is_night: req.is_night || false,
    is_holiday: req.is_holiday || false,
    is_return_trip: req.is_return_trip || false,
    has_missing_docs: req.has_missing_docs || false,
    total: breakdown.total,
    margin_amount: margin?.margin_amount ?? 999,
    margin_percent: margin?.margin_percent ?? 100,
  }

  for (const rule of rules as ReviewRule[]) {
    if (rule.trigger_type === 'always') {
      flags.push({
        rule_slug: rule.slug,
        rule_name: rule.name,
        severity: rule.severity,
        action: rule.action,
        message: rule.description || rule.name,
      })
      continue
    }

    if (!rule.trigger_field || !rule.trigger_operator || rule.trigger_value === null) {
      continue
    }

    const fieldValue = ctx[rule.trigger_field]
    if (fieldValue === undefined) continue

    const targetValue = rule.trigger_value === 'true' ? true
      : rule.trigger_value === 'false' ? false
      : Number(rule.trigger_value)

    let triggered = false

    switch (rule.trigger_operator) {
      case 'gt':  triggered = fieldValue > targetValue; break
      case 'gte': triggered = fieldValue >= targetValue; break
      case 'lt':  triggered = fieldValue < targetValue; break
      case 'lte': triggered = fieldValue <= targetValue; break
      case 'eq':  triggered = fieldValue === targetValue; break
      case 'ne':  triggered = fieldValue !== targetValue; break
      default:    break
    }

    if (triggered) {
      flags.push({
        rule_slug: rule.slug,
        rule_name: rule.name,
        severity: rule.severity,
        action: rule.action,
        message: rule.description || `${rule.name}: ${rule.trigger_field} ${rule.trigger_operator} ${rule.trigger_value}`,
      })
    }
  }

  return flags
}

/**
 * Extended pricing calculation with cost, margin, and review rules.
 * Only runs full analysis when 'enhanced_pricing_v2' feature flag is enabled.
 * Falls back to standard calculatePrice() otherwise.
 */
export async function calculatePriceExtended(
  req: PricingRequestExtended
): Promise<PricingBreakdownExtended> {
  // Standard price calculation
  const breakdown = await calculatePrice(req)

  // Check if enhanced pricing is enabled
  const enhanced = await isFeatureEnabled('enhanced_pricing_v2', req.user_id)

  if (!enhanced) {
    return {
      ...breakdown,
      review_flags: [],
      requires_manual_review: false,
    }
  }

  // Find tier for cost lookup
  const data = await loadPricingData()
  const tier = data.tiers.find(t => t.slug === req.tier_slug)

  let cost_breakdown: CostBreakdown | undefined
  let margin_info: MarginBreakdown | undefined

  if (tier) {
    const costConfig = await loadCostForTier(tier.id)
    if (costConfig) {
      cost_breakdown = calculateCosts(
        costConfig,
        req.estimated_km || 0,
        req.estimated_wait_minutes || 0
      )
      margin_info = await calculateMargin(breakdown.total, cost_breakdown.total)
    }
  }

  // Evaluate review rules
  const reviewEnabled = await isFeatureEnabled('manual_review_queue', req.user_id)
  let review_flags: ReviewFlag[] = []

  if (reviewEnabled) {
    review_flags = await evaluateReviewRules(req, breakdown, margin_info)
  }

  const requires_manual_review = review_flags.some(
    f => f.action === 'block' || f.severity === 'critical'
  )

  return {
    ...breakdown,
    cost_breakdown,
    margin_info,
    review_flags,
    requires_manual_review,
  }
}

// --- Helpers ---

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function fmt(n: number): string {
  return `${n.toFixed(2).replace('.', ',')} €`
}
