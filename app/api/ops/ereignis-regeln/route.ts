import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { listEreignisRegeln, createEreignisRegel } from '@/lib/ops/ereignis-regeln'
import { withTracking } from '@/lib/monitoring/tracker'

export const GET = withTracking(async function GET(request: Request) {
  const auth = await requireOpsAdmin('system.verwalten')
  if (!auth.ok) return auth.response
  const supabase = createAdminClient()
  const url = new URL(request.url)
  const aktiv = url.searchParams.get('aktiv')
  try {
    const data = await listEreignisRegeln(supabase, {
      organizationId: auth.ctx.organizationId,
      aktiv: aktiv !== null ? aktiv === 'true' : undefined,
    })
    return NextResponse.json(data)
  } catch (e: any) {
    return apiErrorResponse(e, request)
  }
})

export const POST = withTracking(async function POST(request: Request) {
  const auth = await requireOpsAdmin('system.verwalten')
  if (!auth.ok) return auth.response
  const supabase = createAdminClient()
  try {
    const body = await request.json()
    const data = await createEreignisRegel(supabase, {
      organizationId: auth.ctx.organizationId,
      data: body,
    })
    return NextResponse.json(data)
  } catch (e: any) {
    return apiErrorResponse(e, request)
  }
})
