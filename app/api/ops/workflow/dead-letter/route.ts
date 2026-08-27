import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { listDeadLetter } from '@/lib/workflow/dead-letter'
import { withTracking } from '@/lib/monitoring/tracker'

export const GET = withTracking(async function GET(request: Request) {
  const auth = await requireOpsAdmin('system.verwalten')
  if (!auth.ok) return auth.response
  const supabase = createAdminClient()
  const url = new URL(request.url)
  const manuellParam = url.searchParams.get('manuell_wiederholt')
  const limit = url.searchParams.get('limit') ? Number(url.searchParams.get('limit')) : undefined
  const offset = url.searchParams.get('offset') ? Number(url.searchParams.get('offset')) : undefined
  try {
    const data = await listDeadLetter(supabase, {
      organizationId: auth.ctx.organizationId,
      manuellWiederholt: manuellParam !== null ? manuellParam === 'true' : undefined,
      limit, offset,
    })
    return NextResponse.json(data)
  } catch (e: any) {
    return apiErrorResponse(e, request)
  }
})
