import { createClient } from '@/lib/supabase/server'
import { rolleDarf } from '@/lib/auth/guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { allocatePayment } from '@/lib/billing/core'
import { getActiveOrgId } from '@/lib/organizations/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { withTracking } from '@/lib/monitoring/tracker'

export const POST = withTracking(async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles').select('role').eq('id', user.id).single()
    if (!profile || !rolleDarf(profile.role, 'abrechnung.schreiben')) {
      return NextResponse.json({ error: 'Nur für Administratoren.' }, { status: 403 })
    }

    // Die Organisation haengt am organization_members-Mapping (Org-Switcher-Cookie),
    // NICHT an profiles — profiles hat keine organization_id-Spalte.
    const organizationId = await getActiveOrgId()
    if (!organizationId) {
      return NextResponse.json({ error: 'Keine Organisation zugewiesen.' }, { status: 403 })
    }

    const body = await request.json()
    const { paymentId, allocations } = body

    if (!paymentId || !allocations || !Array.isArray(allocations) || allocations.length === 0) {
      return NextResponse.json({ error: 'paymentId und allocations[] erforderlich.' }, { status: 400 })
    }

    for (const a of allocations) {
      if (!a.invoiceId || !a.amountCents || a.amountCents <= 0) {
        return NextResponse.json({ error: 'Jede Zuordnung braucht invoiceId und amountCents > 0.' }, { status: 400 })
      }
    }

    const admin = createAdminClient()

    // Org-Fence: allocatePayment laeuft mit Service-Role (BYPASSRLS) — Zahlung
    // und alle Ziel-Rechnungen muessen zur eigenen Organisation gehoeren.
    const { data: payment } = await admin
      .from('payments')
      .select('id')
      .eq('id', paymentId)
      .eq('organization_id', organizationId)
      .maybeSingle()

    if (!payment) {
      return NextResponse.json({ error: 'Zahlung nicht gefunden.' }, { status: 404 })
    }

    const invoiceIds = [...new Set(allocations.map((a: { invoiceId: string }) => a.invoiceId))]
    const { data: invoices } = await admin
      .from('invoices')
      .select('id')
      .in('id', invoiceIds)
      .eq('organization_id', organizationId)

    if ((invoices?.length ?? 0) !== invoiceIds.length) {
      return NextResponse.json({ error: 'Rechnung nicht gefunden.' }, { status: 404 })
    }

    await allocatePayment(admin, { paymentId, allocations, actorId: user.id })

    return NextResponse.json({ success: true })
  } catch (err) {
    return safeApiError(err, request)
  }
})
