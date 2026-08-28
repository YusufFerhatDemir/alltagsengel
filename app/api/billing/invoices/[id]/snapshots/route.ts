import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { getActiveOrgId } from '@/lib/organizations/server'
import { logger } from '@/lib/logger'
import { withTracking } from '@/lib/monitoring/tracker'
import { holeRollenQuellenFuer, quellenDuerfen } from '@/lib/auth/rollen-quelle'
const log = logger.child('api:billing')

/**
 * GET /api/billing/invoices/[id]/snapshots
 * Alle Snapshots einer Rechnung (Versionshistorie).
 * Authentifizierung erforderlich, kein Admin nötig.
 */
export const GET = withTracking(async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Auth-Prüfung
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
    }

    const quellen = await holeRollenQuellenFuer(supabase, user)

    if (!quellenDuerfen(quellen, 'abrechnung.lesen')) {
      return NextResponse.json({ error: 'Nur für Administratoren' }, { status: 403 })
    }

    const orgId = await getActiveOrgId()
    // Fail-closed (Audit MITTEL-1)
    if (!orgId) return NextResponse.json({ error: 'Keine Organisation zugewiesen' }, { status: 403 })
    const admin = createAdminClient()

    // Pruefen ob die Rechnung existiert und zur Organisation gehoert
    const { data: invoice, error: invoiceError } = await admin
      .from('invoices')
      .select('id')
      .eq('id', id)
      .eq('organization_id', orgId)
      .single()

    if (invoiceError || !invoice) {
      return NextResponse.json({ error: 'Rechnung nicht gefunden' }, { status: 404 })
    }

    // Snapshots laden, nach Version sortiert
    const { data: snapshots, error } = await admin
      .from('invoice_snapshots')
      .select('*')
      .eq('invoice_id', id)
      .order('version', { ascending: true })

    if (error) {
      log.errorWithException('Snapshots laden fehlgeschlagen', error)
      return NextResponse.json(
        { error: 'Snapshots konnten nicht geladen werden' },
        { status: 500 }
      )
    }

    return NextResponse.json(snapshots)
  } catch (err) {
    return safeApiError(err, request)
  }
})
