import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { createSepaBatch, listBatches } from '@/lib/billing/sepa/sepa-service'
import { safeApiError } from '@/lib/api/error-sanitizer'

export async function GET() {
  try {
    const auth = await requireOpsAdmin()
    if (!auth.ok) return auth.response
    const supabase = createAdminClient()

    const data = await listBatches(supabase, auth.ctx.organizationId)
    return NextResponse.json(data)
  } catch (e) {
    return safeApiError(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireOpsAdmin()
    if (!auth.ok) return auth.response
    const supabase = createAdminClient()

    const body = await req.json()
    const result = await createSepaBatch(supabase, {
      organizationId: auth.ctx.organizationId,
      invoiceIds: body.invoiceIds,
      requestedCollectionDate: body.requestedCollectionDate,
      actorId: auth.ctx.userId,
    })

    return NextResponse.json(result, { status: 201 })
  } catch (e) {
    return safeApiError(e, req)
  }
}
