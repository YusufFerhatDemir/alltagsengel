import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { advanceDunning, ensureDunningEntry } from '@/lib/billing/core'
import { requireOpsAdmin } from '@/lib/ops/api-auth'

export async function POST(request: Request) {
  try {
    const auth = await requireOpsAdmin()
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
    const result = await advanceDunning(admin, invoiceId, userId)

    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Interner Serverfehler'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
