import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { listAudit } from '@/lib/workflow/audit'
import type { WfAuditTyp } from '@/lib/workflow/types'

export async function GET(request: Request) {
  const auth = await requireOpsAdmin()
  if (!auth.ok) return auth.response
  const supabase = createAdminClient()
  const url = new URL(request.url)
  const typ = (url.searchParams.get('typ') || undefined) as WfAuditTyp | undefined
  const entitaetTyp = url.searchParams.get('entitaet_typ') || undefined
  const entitaetId = url.searchParams.get('entitaet_id') || undefined
  const limit = url.searchParams.get('limit') ? Number(url.searchParams.get('limit')) : undefined
  const offset = url.searchParams.get('offset') ? Number(url.searchParams.get('offset')) : undefined
  try {
    const data = await listAudit(supabase, {
      organizationId: auth.ctx.organizationId,
      typ, entitaetTyp, entitaetId, limit, offset,
    })
    return NextResponse.json(data)
  } catch (e: any) {
    return apiErrorResponse(e, request)
  }
}
