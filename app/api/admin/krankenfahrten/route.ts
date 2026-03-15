import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/admin/krankenfahrten
 * Returns all Krankenfahrten bookings + providers + stats for admin
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || !['admin', 'superadmin'].includes(profile.role)) {
      return NextResponse.json({ error: 'Nur für Administratoren' }, { status: 403 })
    }

    // Load all data in parallel
    const [ridesRes, providersRes, reviewsRes] = await Promise.all([
      supabase
        .from('krankenfahrten')
        .select('*, customer:profiles!krankenfahrten_user_id_fkey(first_name, last_name, email, phone)')
        .order('created_at', { ascending: false })
        .limit(200),
      supabase
        .from('krankenfahrt_providers')
        .select('*, profile:profiles!krankenfahrt_providers_user_id_fkey(first_name, last_name, email, phone)')
        .order('created_at', { ascending: false }),
      supabase
        .from('krankenfahrt_reviews')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100),
    ])

    const rides = ridesRes.data || []
    const providers = providersRes.data || []

    // Stats
    const totalRides = rides.length
    const pendingRides = rides.filter(r => r.status === 'pending').length
    const activeRides = rides.filter(r => ['confirmed', 'in_progress'].includes(r.status)).length
    const completedRides = rides.filter(r => r.status === 'completed').length
    const totalRevenue = rides
      .filter(r => r.status === 'completed')
      .reduce((sum, r) => sum + (r.total_amount || 0), 0)
    const totalProviders = providers.length
    const verifiedProviders = providers.filter(p => p.is_verified).length

    return NextResponse.json({
      rides,
      providers,
      reviews: reviewsRes.data || [],
      stats: {
        totalRides,
        pendingRides,
        activeRides,
        completedRides,
        totalRevenue,
        totalProviders,
        verifiedProviders,
      },
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

/**
 * PUT /api/admin/krankenfahrten
 * Update ride status, provider verification, etc.
 */
export async function PUT(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || !['admin', 'superadmin'].includes(profile.role)) {
      return NextResponse.json({ error: 'Nur für Administratoren' }, { status: 403 })
    }

    const body = await request.json()
    const { entity, id, ...updates } = body

    if (!entity || !id) {
      return NextResponse.json({ error: 'entity und id erforderlich' }, { status: 400 })
    }

    if (entity === 'ride') {
      const { data, error } = await supabase
        .from('krankenfahrten')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json(data)
    }

    if (entity === 'provider') {
      const { data, error } = await supabase
        .from('krankenfahrt_providers')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json(data)
    }

    return NextResponse.json({ error: 'Ungültige Entität' }, { status: 400 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
