import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { getDunningOverview } from '@/lib/billing/core'

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
    if (!profile.organization_id) {
      return NextResponse.json({ error: 'Keine Organisation zugewiesen.' }, { status: 403 })
    }

    const admin = createAdminClient()

    const overview = await getDunningOverview(admin, profile.organization_id)

    const { data: entries } = await admin
      .from('dunning_entries')
      .select('*, invoice:invoices(id, invoice_number, invoice_number_formatted, total_amount, paid_amount, client_id, status, client:clients(first_name, last_name))')
      .eq('organization_id', profile.organization_id)
      .neq('dunning_level', 'bezahlt')
      .order('due_date', { ascending: true })
      .limit(200)

    return NextResponse.json({ overview, entries: entries || [] })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Interner Serverfehler'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
