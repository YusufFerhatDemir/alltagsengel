import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { advanceDunning, ensureDunningEntry } from '@/lib/billing/core'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { withTracking } from '@/lib/monitoring/tracker'

export const POST = withTracking(async function POST(request: Request) {
  try {
    const auth = await requireOpsAdmin('abrechnung.schreiben')
    if (!auth.ok) return auth.response
    const { userId, organizationId } = auth.ctx

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

    await ensureDunningEntry(admin, invoiceId, organizationId, userId)
    const result = await advanceDunning(admin, invoiceId, userId, organizationId)

    return NextResponse.json(result)
  } catch (err) {
    return safeApiError(err, request)
  }
})
