export interface Profile {
  id: string
  role: 'kunde' | 'engel' | 'admin' | 'fahrer'
  first_name: string
  last_name: string
  email: string
  phone: string | null
  location: string | null
  latitude: number | null
  longitude: number | null
  avatar_color: string
  created_at: string
}

export interface Angel {
  id: string
  hourly_rate: number
  services: string[]
  availability: string[]
  bio: string | null
  qualification: string | null
  is_certified: boolean
  is_45b_capable: boolean
  is_online: boolean
  total_jobs: number
  rating: number
  satisfaction_pct: number
  profiles: Profile
}

export interface Booking {
  id: string
  customer_id: string
  angel_id: string
  service: string
  date: string
  time: string
  duration_hours: number
  status: 'pending' | 'accepted' | 'declined' | 'completed' | 'cancelled'
  payment_method: 'kasse' | 'privat' | 'kombi'
  insurance_type: 'gesetzlich' | 'privat' | null
  insurance_provider: string | null
  total_amount: number
  platform_fee: number
  notes: string | null
  created_at: string
  profiles?: Profile
  angels?: Angel
}

export interface Review {
  id: string
  booking_id: string
  reviewer_id: string
  angel_id: string
  rating: number
  comment: string | null
  created_at: string
  profiles?: Profile
}

export interface CareEligibility {
  user_id: string
  pflegegrad: 0 | 1 | 2 | 3 | 4 | 5
  home_care: boolean
  insurance_type: 'public' | 'private' | 'unknown'
  krankenkasse: string
  pflegehilfsmittel_interest: boolean
  updated_at: string
}

export interface CareboxCatalogItem {
  id: string
  name: string
  category: string
  description: string | null
  unit_type: string
  default_price_estimate: number | null
  max_qty: number
  active: boolean
  sort_order: number
}

export interface CareboxCartItem {
  item_id: string
  qty: number
}

export interface CareboxCart {
  id: string
  user_id: string
  month: string
  items: CareboxCartItem[]
  estimated_total: number
  status: 'draft' | 'submitted'
  created_at: string
  updated_at: string
}

export interface CareboxOrderRequest {
  id: string
  user_id: string
  cart_id: string | null
  delivery_name: string
  delivery_address: string
  delivery_phone: string | null
  consent_share_data: boolean
  partner_id: string | null
  status: 'draft' | 'submitted' | 'sent' | 'accepted' | 'rejected' | 'shipped' | 'delivered' | 'cancelled'
  partner_reference: string | null
  audit_log: { action: string; timestamp: string; note?: string }[]
  created_at: string
  updated_at: string
  profiles?: Profile
  carebox_cart?: CareboxCart
}
