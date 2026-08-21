import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { listAusfuehrungen } from '@/lib/workflow/ausfuehrungen'
import type { WfAusfuehrungStatus } from '@/lib/workflow/types'

export async function GET(request: Request) {
  const auth = await requireOpsAdmin()
  if (!auth.ok) return auth.response
  const supabase = createAdminClient()
  const url = new URL(request.url)
  const eventId = url.searchParams.get('event_id') || undefined
  const regelId = url.searchParams.get('regel_id') || undefined
  const status = (url.searchParams.get('status') || undefined) as WfAusfuehrungStatus | undefined
  const limit = url.searchParams.get('limit') ? Number(url.searchParams.get('limit')) : undefined
  const offset = url.searchParams.get('offset') ? Number(url.searchParams.get('offset')) : undefined
  try {
    const data = await listAusfuehrungen(supabase, {
      organizationId: auth.ctx.organizationId,
      eventId, regelId, status, limit, offset,
    })
    return NextResponse.json(data)
  } catch (e: any) {
    return apiErrorResponse(e, request)
  }
}
