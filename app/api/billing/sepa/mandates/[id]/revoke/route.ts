import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { revokeMandate } from '@/lib/billing/sepa/sepa-service'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { withTracking } from '@/lib/monitoring/tracker'

export const POST = withTracking(async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireOpsAdmin('bankdaten.schreiben')
    if (!auth.ok) return auth.response
    const supabase = createAdminClient()
    const { id } = await params

    const body = await req.json()
    const result = await revokeMandate(supabase, id, body.reason || 'Kein Grund angegeben', auth.ctx.userId, auth.ctx.organizationId)

    return NextResponse.json(result)
  } catch (e) {
    return safeApiError(e, req)
  }
})
