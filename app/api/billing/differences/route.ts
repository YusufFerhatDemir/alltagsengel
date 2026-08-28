import { createClient } from '@/lib/supabase/server'
import { centRunden } from '@/lib/geld'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { recordPaymentDifference } from '@/lib/billing/core'
import { getActiveOrgId } from '@/lib/organizations/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { withTracking } from '@/lib/monitoring/tracker'
import { holeRollenQuellenFuer, quellenDuerfen } from '@/lib/auth/rollen-quelle'

export const POST = withTracking(async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 })

    const quellen = await holeRollenQuellenFuer(supabase, user)
    if (!quellenDuerfen(quellen, 'abrechnung.schreiben')) {
      return NextResponse.json({ error: 'Nur für Administratoren.' }, { status: 403 })
    }

    // Die Organisation haengt am organization_members-Mapping (Org-Switcher-Cookie),
    // NICHT an profiles — profiles hat keine organization_id-Spalte.
    const organizationId = await getActiveOrgId()
    if (!organizationId) {
      return NextResponse.json({ error: 'Keine Organisation zugewiesen.' }, { status: 403 })
    }

    const body = await request.json()
    const { invoiceId, sollCents, istCents, kuerzungGrund, kuerzungKategorie, widerspruchFrist } = body

    if (!invoiceId || !sollCents || istCents === undefined) {
      return NextResponse.json({ error: 'invoiceId, sollCents und istCents erforderlich.' }, { status: 400 })
    }

    const admin = createAdminClient()

    // Org-Fence: recordPaymentDifference laeuft mit Service-Role (BYPASSRLS).
    const { data: invoice } = await admin
      .from('invoices')
      .select('id')
      .eq('id', invoiceId)
      .eq('organization_id', organizationId)
      .maybeSingle()

    if (!invoice) {
      return NextResponse.json({ error: 'Rechnung nicht gefunden.' }, { status: 404 })
    }

    const diffId = await recordPaymentDifference(admin, {
      organizationId,
      invoiceId,
      // centRunden: eine Kuerzung kann als negative Differenz ankommen,
      // und Math.round(-0.5) laege einen Cent daneben.
      sollCents: centRunden(sollCents),
      istCents: centRunden(istCents),
      kuerzungGrund,
      kuerzungKategorie,
      widerspruchFrist,
      actorId: user.id,
    })

    return NextResponse.json({ differenceId: diffId })
  } catch (err) {
    return safeApiError(err, request)
  }
})

export const GET = withTracking(async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 })

    const quellen = await holeRollenQuellenFuer(supabase, user)
    if (!quellenDuerfen(quellen, 'abrechnung.lesen')) {
      return NextResponse.json({ error: 'Nur für Administratoren.' }, { status: 403 })
    }

    // Die Organisation haengt am organization_members-Mapping (Org-Switcher-Cookie),
    // NICHT an profiles — profiles hat keine organization_id-Spalte.
    const organizationId = await getActiveOrgId()
    if (!organizationId) {
      return NextResponse.json({ error: 'Keine Organisation zugewiesen.' }, { status: 403 })
    }

    const admin = createAdminClient()
    const { data, error } = await admin
      .from('payment_differences')
      .select('*, invoice:invoices(id, invoice_number, invoice_number_formatted, total_amount, client:clients(first_name, last_name))')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(200)

    if (error) return safeApiError(error, request)
    return NextResponse.json({ differences: data || [] })
  } catch (err) {
    return safeApiError(err, request)
  }
})
