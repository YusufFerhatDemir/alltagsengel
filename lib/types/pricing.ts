// =============================================
// Krankenfahrt Pricing System — Types
// =============================================

export interface PricingTier {
  id: string
  name: string
  slug: string
  description: string | null
  base_price: number
  per_km_rate: number
  min_price: number
  wait_per_min: number
  surcharge_amount: number
  icon: string | null
  enabled: boolean
  sort_order: number
}

export interface PricingSurcharge {
  id: string
  name: string
  slug: string
  description: string | null
  surcharge_type: 'fixed' | 'percentage'
  value: number
  applies_to: string[]
  enabled: boolean
  sort_order: number
}

export interface PricingRegion {
  id: string
  region_code: string
  region_name: string
  tier_id: string | null
  price_multiplier: number
  enabled: boolean
}

export interface PricingConfig {
  id: string
  key: string
  value: string // JSON string
  description: string | null
  enabled: boolean
}

// --- Request / Response ---

export interface PricingRequest {
  tier_slug: string
  estimated_km: number
  estimated_wait_minutes?: number
  is_return_trip?: boolean
  is_night?: boolean
  is_holiday?: boolean
  region_code?: string
  /** Extra surcharge slugs to apply (e.g. stair_assistance, companion) */
  extra_surcharges?: string[]
}

export interface SurchargeDetail {
  name: string
  slug: string
  type: 'fixed' | 'percentage'
  value: number
  /** Calculated amount in € */
  amount: number
}

export interface PricingBreakdown {
  tier: {
    name: string
    slug: string
    icon: string | null
  }
  base_price: number
  distance_cost: number
  wait_cost: number
  tier_surcharge: number
  surcharges: SurchargeDetail[]
  surcharges_total: number
  subtotal: number
  region_multiplier: number
  region_adjusted: number
  min_price: number
  is_min_price_applied: boolean
  return_trip_multiplier: number
  total: number
  /** Human-readable breakdown lines */
  display_lines: string[]
}

// --- Admin types ---

export interface PricingAuditEntry {
  id: string
  entity_type: string
  entity_id: string | null
  action: 'create' | 'update' | 'delete'
  old_values: Record<string, any> | null
  new_values: Record<string, any> | null
  actor_id: string | null
  created_at: string
}
