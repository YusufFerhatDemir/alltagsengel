import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { getDunningOverview } from '@/lib/billing/core'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { safeApiError } from '@/lib/api/error-sanitizer'

export async function GET() {
  try {
    const auth = await requireOpsAdmin('abrechnung.lesen')
    if (!auth.ok) return auth.response
    const { organizationId } = auth.ctx

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
    return safeApiError(err)
  }
}
