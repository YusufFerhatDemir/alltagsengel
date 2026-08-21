import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { freezeInvoice } from '@/lib/billing/core'
import { getActiveOrgId } from '@/lib/organizations/server'
import { safeApiError } from '@/lib/api/error-sanitizer'

/**
 * POST /api/billing/invoices/[id]/freeze
 * Rechnung festschreiben (Snapshot + Preise einfrieren).
 * Nur fuer Administratoren.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Auth-Pruefung
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

    // Org-Fence: der Admin-Client umgeht RLS (BYPASSRLS), die Zugehoerigkeit
    // der Rechnung muss deshalb hier explizit geprueft werden.
    const organizationId = await getActiveOrgId()
    if (!organizationId) {
      return NextResponse.json({ error: 'Keine Organisation zugewiesen.' }, { status: 403 })
    }

    // Admin-Client fuer die eigentlichen Operationen
    const admin = createAdminClient()

    const { data: invoice } = await admin
      .from('invoices')
      .select('id')
      .eq('id', id)
      .eq('organization_id', organizationId)
      .maybeSingle()

    if (!invoice) {
      return NextResponse.json({ error: 'Rechnung nicht gefunden.' }, { status: 404 })
    }

    const result = await freezeInvoice(admin, id, user.id, organizationId)

    return NextResponse.json(result)
  } catch (err) {
    return safeApiError(err, _request)
  }
}
