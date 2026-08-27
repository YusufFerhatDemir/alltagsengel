import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { createMandate, listMandates } from '@/lib/billing/sepa/sepa-service'
import type { MandateStatus } from '@/lib/billing/sepa/sepa-service'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { withTracking } from '@/lib/monitoring/tracker'

export const GET = withTracking(async function GET(req: NextRequest) {
  try {
    const auth = await requireOpsAdmin('bankdaten.lesen')
    if (!auth.ok) return auth.response
    const supabase = createAdminClient()

    const sp = req.nextUrl.searchParams
    const clientId = sp.get('clientId') ?? undefined
    const status = (sp.get('status') ?? undefined) as MandateStatus | undefined

    const data = await listMandates(supabase, auth.ctx.organizationId, { clientId, status })
    return NextResponse.json(data)
  } catch (e) {
    return safeApiError(e, req)
  }
})

export const POST = withTracking(async function POST(req: NextRequest) {
  try {
    const auth = await requireOpsAdmin('bankdaten.schreiben')
    if (!auth.ok) return auth.response
    const supabase = createAdminClient()

    const body = await req.json()
    const data = await createMandate(supabase, {
      ...body,
      organizationId: auth.ctx.organizationId,
      actorId: auth.ctx.userId,
    })
    return NextResponse.json(data, { status: 201 })
  } catch (e) {
    return safeApiError(e, req)
  }
})
