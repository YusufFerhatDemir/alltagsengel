import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { recordPaymentDifference } from '@/lib/billing/core'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles').select('role, organization_id').eq('id', user.id).single()
    if (!profile || !['admin', 'superadmin'].includes(profile.role)) {
      return NextResponse.json({ error: 'Nur für Administratoren.' }, { status: 403 })
    }

    const body = await request.json()
    const { invoiceId, sollCents, istCents, kuerzungGrund, kuerzungKategorie, widerspruchFrist } = body

    if (!invoiceId || !sollCents || istCents === undefined) {
      return NextResponse.json({ error: 'invoiceId, sollCents und istCents erforderlich.' }, { status: 400 })
    }

    const admin = createAdminClient()
    const diffId = await recordPaymentDifference(admin, {
      organizationId: profile.organization_id!,
      invoiceId,
      sollCents: Math.round(sollCents),
      istCents: Math.round(istCents),
      kuerzungGrund,
      kuerzungKategorie,
      widerspruchFrist,
      actorId: user.id,
    })

    return NextResponse.json({ differenceId: diffId })
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
      .from('profiles').select('role, organization_id').eq('id', user.id).single()
    if (!profile || !['admin', 'superadmin'].includes(profile.role)) {
      return NextResponse.json({ error: 'Nur für Administratoren.' }, { status: 403 })
    }

    const admin = createAdminClient()
    const { data, error } = await admin
      .from('payment_differences')
      .select('*, invoice:invoices(id, invoice_number, invoice_number_formatted, total_amount, client:clients(first_name, last_name))')
      .eq('organization_id', profile.organization_id)
      .order('created_at', { ascending: false })
      .limit(200)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ differences: data || [] })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Interner Serverfehler'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
