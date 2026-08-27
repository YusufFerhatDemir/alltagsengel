import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePersonalAdmin } from '@/lib/personal/api-auth'
import { listTagesansicht } from '@/lib/personal/dienstplan'
import { withTracking } from '@/lib/monitoring/tracker'

export const GET = withTracking(async function GET(request: Request) {
  const auth = await requirePersonalAdmin('personal.lesen')
  if (!auth.ok) return auth.response
  const supabase = createAdminClient()
  const url = new URL(request.url)
  const datum = url.searchParams.get('datum')
  if (!datum) {
    return NextResponse.json({ error: 'datum is required' }, { status: 400 })
  }
  try {
    const data = await listTagesansicht(supabase, auth.ctx.organizationId, datum)
    return NextResponse.json(data)
  } catch (e: any) {
    return apiErrorResponse(e, request)
  }
})
