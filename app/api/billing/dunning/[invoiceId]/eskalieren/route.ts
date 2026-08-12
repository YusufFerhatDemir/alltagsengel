import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { advanceDunning, ensureDunningEntry } from '@/lib/billing/core/dunning'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ invoiceId: string }> }
) {
  try {
    const auth = await requireOpsAdmin()
    if (!auth.ok) return auth.response
    const supabase = createAdminClient()
    const { invoiceId } = await params

    // Org-Fence: Rechnung muss zur Organisation des Admins gehören
    const { data: invoice } = await supabase
      .from('invoices')
      .select('id')
      .eq('id', invoiceId)
      .eq('organization_id', auth.ctx.organizationId)
      .maybeSingle()

    if (!invoice) {
      return NextResponse.json({ error: 'Rechnung nicht gefunden.' }, { status: 404 })
    }

    // Sicherstellen, dass ein Dunning-Entry existiert
    await ensureDunningEntry(supabase, invoiceId, auth.ctx.organizationId, auth.ctx.userId)

    // Eskalieren
    const result = await advanceDunning(supabase, invoiceId, auth.ctx.userId)

    return NextResponse.json(result)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 })
  }
}
