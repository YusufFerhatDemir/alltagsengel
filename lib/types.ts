export interface Profile {
  id: string
  role: 'kunde' | 'engel'
  first_name: string
  last_name: string
  email: string
  phone: string | null
  location: string | null
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
