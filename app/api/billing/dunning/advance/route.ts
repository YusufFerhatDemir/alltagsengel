import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { advanceDunning, ensureDunningEntry } from '@/lib/billing/core'
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
    const { invoiceId } = body
    if (!invoiceId) return NextResponse.json({ error: 'invoiceId erforderlich.' }, { status: 400 })

    const admin = createAdminClient()

    // Org-Fence: ensureDunningEntry/advanceDunning laufen mit Service-Role (BYPASSRLS).
    const { data: invoice } = await admin
      .from('invoices')
      .select('id')
      .eq('id', invoiceId)
      .eq('organization_id', organizationId)
      .maybeSingle()

    if (!invoice) {
      return NextResponse.json({ error: 'Rechnung nicht gefunden.' }, { status: 404 })
    }

    await ensureDunningEntry(admin, invoiceId, organizationId, user.id)
    const result = await advanceDunning(admin, invoiceId, user.id)

    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Interner Serverfehler'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
