import { createClient } from '@/lib/supabase/server'
import type {
  PricingTier,
  PricingSurcharge,
  PricingConfig,
  PricingRegion,
  PricingRequest,
  PricingBreakdown,
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

// --- Helpers ---

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function fmt(n: number): string {
  return `${n.toFixed(2).replace('.', ',')} €`
}
