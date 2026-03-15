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

// --- Extended Request (with payer type, document info) ---

export interface PricingRequestExtended extends PricingRequest {
  /** Kostenträger: kasse, selbstzahler, firmenkunde */
  payer_type?: string
  /** Whether required documents are provided */
  has_missing_docs?: boolean
  /** User ID for feature flag evaluation */
  user_id?: string
  /** Booking ID (for review queue) */
  booking_id?: string
}

// --- Cost & Margin ---

export interface PricingCost {
  id: string
  tier_id: string
  fuel_cost_per_km: number
  driver_rate_per_km: number
  vehicle_cost_per_km: number
  driver_rate_per_min: number
  fixed_overhead: number
  effective_from: string
  effective_to: string | null
}

export interface CostBreakdown {
  fuel: number
  driver_distance: number
  driver_time: number
  vehicle: number
  fixed_overhead: number
  total: number
}

export interface MarginBreakdown {
  revenue: number
  total_cost: number
  margin_amount: number
  margin_percent: number
  meets_amount_threshold: boolean
  meets_percent_threshold: boolean
  meets_threshold: boolean
}

// --- Review Rules ---

export interface ReviewFlag {
  rule_slug: string
  rule_name: string
  severity: 'info' | 'warning' | 'critical'
  action: 'flag' | 'block' | 'notify' | 'escalate'
  message: string
}

export interface ReviewRule {
  id: string
  name: string
  slug: string
  description: string | null
  trigger_type: 'condition' | 'threshold' | 'always'
  trigger_field: string | null
  trigger_operator: string | null
  trigger_value: string | null
  trigger_condition: Record<string, any>
  severity: 'info' | 'warning' | 'critical'
  action: 'flag' | 'block' | 'notify' | 'escalate'
  enabled: boolean
  sort_order: number
}

// --- Extended Breakdown (with cost + margin + flags) ---

export interface PricingBreakdownExtended extends PricingBreakdown {
  cost_breakdown?: CostBreakdown
  margin_info?: MarginBreakdown
  review_flags: ReviewFlag[]
  /** True if any critical review flag blocks auto-approval */
  requires_manual_review: boolean
}

// --- Pricing Rules ---

export interface PricingRule {
  id: string
  name: string
  slug: string
  description: string | null
  rule_type: 'seasonal' | 'ab_test' | 'regional' | 'payer_type' | 'promo' | 'override'
  priority: number
  condition_json: Record<string, any>
  pricing_adjustments: Record<string, any>
  version: number
  active: boolean
  starts_at: string | null
  ends_at: string | null
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

// --- Partner types ---

export interface KfPartner {
  id: string
  user_id: string | null
  name: string
  company_name: string | null
  email: string | null
  phone: string | null
  vehicle_types: string[]
  service_areas: Record<string, any>
  coverage_plz: string[]
  max_bookings_per_day: number
  rating: number
  total_trips: number
  commission_rate: number
  verified: boolean
  enabled: boolean
}

export interface PartnerAvailability {
  id: string
  partner_id: string
  available_date: string
  start_time: string
  end_time: string
  vehicle_type: string | null
  max_trips: number
  booked_trips: number
}

export interface PartnerMatch {
  partner: KfPartner
  score: number
  reasons: string[]
  availability: PartnerAvailability | null
}

// --- Document types ---

export interface ServiceDocRequirement {
  service_type: string
  required_documents: DocumentSpec[]
  optional_documents: DocumentSpec[]
}

export interface DocumentSpec {
  type: string
  name: string
  description?: string
}
