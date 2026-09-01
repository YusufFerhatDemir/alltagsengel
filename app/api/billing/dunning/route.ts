import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { getDunningOverview } from '@/lib/billing/core'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { withTracking } from '@/lib/monitoring/tracker'

export const GET = withTracking(async function GET() {
  try {
    const auth = await requireOpsAdmin('abrechnung.lesen')
    if (!auth.ok) return auth.response
    const { organizationId } = auth.ctx

    const admin = createAdminClient()

    const overview = await getDunningOverview(admin, organizationId)

    // Der Mahnvorrat ist eine Arbeitsliste, und eine leere Arbeitsliste
    // ist eine Aussage: „es steht nichts offen, niemand muss angemahnt
    // werden". Bei verworfenem Fehler traf die Route diese Aussage auch
    // dann, wenn sie den Vorrat gar nicht lesen konnte — und offene
    // Forderungen blieben schlicht liegen, ohne dass jemand es bemerkt
    // haette. Lieber eine sichtbare Stoerung als ein stiller leerer
    // Schreibtisch.
    const { data: entries, error: entriesFehler } = await admin
      .from('dunning_entries')
      .select('*, invoice:invoices(id, invoice_number, invoice_number_formatted, total_amount, paid_amount, client_id, status, client:clients(first_name, last_name))')
      .eq('organization_id', organizationId)
      .neq('dunning_level', 'bezahlt')
      .order('due_date', { ascending: true })
      .limit(200)

    if (entriesFehler) {
      return NextResponse.json(
        { error: 'Der Mahnvorrat konnte nicht geladen werden. Die Liste bleibt leer, weil sie nicht lesbar ist — nicht, weil nichts offen wäre.' },
        { status: 500 },
      )
    }

    return NextResponse.json({ overview, entries: entries || [] })
  } catch (err) {
    return safeApiError(err)
  }
})
