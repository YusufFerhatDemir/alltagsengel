import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { createPayment } from '@/lib/billing/core'
import { getActiveOrgId } from '@/lib/organizations/server'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles').select('role').eq('id', user.id).single()
    if (!profile || !['admin', 'superadmin'].includes(profile.role)) {
      return NextResponse.json({ error: 'Nur für Administratoren.' }, { status: 403 })
    }

    // Die Organisation haengt am organization_members-Mapping (Org-Switcher-Cookie),
    // NICHT an profiles — profiles hat keine organization_id-Spalte.
    const organizationId = await getActiveOrgId()
    if (!organizationId) {
      return NextResponse.json({ error: 'Keine Organisation zugewiesen.' }, { status: 403 })
    }

    const body = await request.json()
    const { paymentDate, amountCents, paymentMethod, payerType, payerName, payerReference, bankReference, verwendungszweck, notes } = body

    if (!paymentDate || !amountCents || amountCents <= 0) {
      return NextResponse.json({ error: 'paymentDate und amountCents (>0) erforderlich.' }, { status: 400 })
    }

    const admin = createAdminClient()
    const result = await createPayment(admin, {
      organizationId,
      paymentDate,
      amountCents: Math.round(amountCents),
      paymentMethod: paymentMethod || 'ueberweisung',
      payerType: payerType || 'kunde',
      payerName,
      payerReference,
      bankReference,
      verwendungszweck,
      notes,
      actorId: user.id,
    })

    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Interner Serverfehler'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles').select('role').eq('id', user.id).single()
    if (!profile || !['admin', 'superadmin'].includes(profile.role)) {
      return NextResponse.json({ error: 'Nur für Administratoren.' }, { status: 403 })
    }

    // Die Organisation haengt am organization_members-Mapping (Org-Switcher-Cookie),
    // NICHT an profiles — profiles hat keine organization_id-Spalte.
    const organizationId = await getActiveOrgId()
    if (!organizationId) {
      return NextResponse.json({ error: 'Keine Organisation zugewiesen.' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const limit = Math.min(Number(searchParams.get('limit') || 100), 500)

    const admin = createAdminClient()
    let query = admin
      .from('payments')
      .select('*, payment_allocations(id, invoice_id, amount_cents, allocation_type)')
      .eq('organization_id', organizationId)
      .is('deleted_at', null)
      .order('payment_date', { ascending: false })
      .limit(limit)

    if (status) query = query.eq('matching_status', status)

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ payments: data || [] })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Interner Serverfehler'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
