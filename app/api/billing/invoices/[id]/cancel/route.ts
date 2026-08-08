import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { cancelInvoice } from '@/lib/billing/core'
import { getActiveOrgId } from '@/lib/organizations/server'

/**
 * POST /api/billing/invoices/[id]/cancel
 * Rechnung stornieren. Nur fuer Administratoren.
 */
export async function POST(
  request: Request,
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

    // Stornierungsgrund aus dem Body
    const body = await request.json()
    if (!body?.reason || typeof body.reason !== 'string') {
      return NextResponse.json(
        { error: 'Stornierungsgrund (reason) ist erforderlich' },
        { status: 400 }
      )
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

    const result = await cancelInvoice(admin, id, body.reason, user.id)

    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Interner Serverfehler'
    console.error('[billing/cancel] Fehler:', message)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
