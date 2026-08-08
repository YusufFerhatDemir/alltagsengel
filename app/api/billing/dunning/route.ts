import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { getDunningOverview } from '@/lib/billing/core'
import { getActiveOrgId } from '@/lib/organizations/server'

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

    const admin = createAdminClient()

    const overview = await getDunningOverview(admin, organizationId)

    const { data: entries } = await admin
      .from('dunning_entries')
      .select('*, invoice:invoices(id, invoice_number, invoice_number_formatted, total_amount, paid_amount, client_id, status, client:clients(first_name, last_name))')
      .eq('organization_id', organizationId)
      .neq('dunning_level', 'bezahlt')
      .order('due_date', { ascending: true })
      .limit(200)

    return NextResponse.json({ overview, entries: entries || [] })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Interner Serverfehler'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
