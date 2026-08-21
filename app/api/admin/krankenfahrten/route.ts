import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getActiveOrgId } from '@/lib/organizations/server'
import { logAuditEvent } from '@/lib/audit-log'

/**
 * GET /api/admin/krankenfahrten
 * Returns all Krankenfahrten bookings + providers + stats for admin
 */
export async function GET(request: Request) {
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

    const orgId = await getActiveOrgId()
    // Fail-closed (Audit MITTEL-1)
    if (!orgId) return NextResponse.json({ error: 'Keine Organisation zugewiesen' }, { status: 403 })
    const admin = createAdminClient()

    // Load all data in parallel — org-fenced
    const [ridesRes, providersRes, reviewsRes] = await Promise.all([
      admin
        .from('krankenfahrten')
        .select('*, customer:profiles!krankenfahrten_customer_id_fkey(first_name, last_name, email, phone)')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })
        .limit(200),
      admin
        .from('krankenfahrt_providers')
        .select('*, profile:profiles!krankenfahrt_providers_user_id_fkey(first_name, last_name, email, phone)')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false }),
      admin
        .from('krankenfahrt_reviews')
        .select('*')
        .eq('organization_id', orgId)
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
  } catch (err) {
    return safeApiError(err, request)
  }
}

/**
 * PUT /api/admin/krankenfahrten
 * Update ride status, provider verification, etc.
 */
export async function PUT(req: Request) {
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

    const body = await req.json()
    const { entity, id } = body

    if (!entity || !id) {
      return NextResponse.json({ error: 'entity und id erforderlich' }, { status: 400 })
    }

    const orgId = await getActiveOrgId()
    // Fail-closed (Audit MITTEL-1)
    if (!orgId) return NextResponse.json({ error: 'Keine Organisation zugewiesen' }, { status: 403 })
    const admin = createAdminClient()

    if (entity === 'ride') {
      const { organization_id: _oid, ...safeUpdates } = body
      delete safeUpdates.entity
      delete safeUpdates.id
      const { data, error } = await admin
        .from('krankenfahrten')
        .update({ status: safeUpdates.status })
        .eq('id', id)
        .eq('organization_id', orgId)
        .select()
        .single()

      if (error) return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })

      await logAuditEvent({
        action: 'update',
        actorId: user!.id,
        organizationId: orgId,
        entityType: 'krankenfahrt',
        entityId: id,
        details: { status: safeUpdates.status },
        request: req,
      })

      return NextResponse.json(data)
    }

    if (entity === 'provider') {
      const { data, error } = await admin
        .from('krankenfahrt_providers')
        .update({ is_verified: body.is_verified })
        .eq('id', id)
        .eq('organization_id', orgId)
        .select()
        .single()

      if (error) return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })

      await logAuditEvent({
        action: 'update',
        actorId: user!.id,
        organizationId: orgId,
        entityType: 'krankenfahrt_provider',
        entityId: id,
        details: { is_verified: body.is_verified },
        request: req,
      })

      return NextResponse.json(data)
    }

    return NextResponse.json({ error: 'Ungültige Entität' }, { status: 400 })
  } catch (err) {
    return safeApiError(err, req)
  }
}
