import { createClient } from '@/lib/supabase/server'
import { rolleDarf } from '@/lib/auth/guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { createCreditNote } from '@/lib/billing/core'
import { getActiveOrgId } from '@/lib/organizations/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { withTracking } from '@/lib/monitoring/tracker'

/**
 * POST /api/billing/invoices/[id]/credit
 * Gutschrift erstellen. Nur fuer Administratoren.
 */
export const POST = withTracking(async function POST(
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
    if (!profile || !rolleDarf(profile.role, 'abrechnung.schreiben')) {
      return NextResponse.json({ error: 'Nur für Administratoren' }, { status: 403 })
    }

    // Gutschrift-Daten aus dem Body
    const body = await request.json()
    if (!body?.amountCents || typeof body.amountCents !== 'number' || body.amountCents <= 0) {
      return NextResponse.json(
        { error: 'Gültiger Betrag in Cent (amountCents) ist erforderlich' },
        { status: 400 }
      )
    }
    if (!body?.reason || typeof body.reason !== 'string') {
      return NextResponse.json(
        { error: 'Gutschriftgrund (reason) ist erforderlich' },
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

    const result = await createCreditNote(admin, id, body.amountCents, body.reason, user.id, organizationId)

    return NextResponse.json(result)
  } catch (err) {
    return safeApiError(err, request)
  }
})
