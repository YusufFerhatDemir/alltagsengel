import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsUser } from '@/lib/ops/api-auth'
import { markBenachrichtigungenGelesen } from '@/lib/ops/benachrichtigungen'
import { withTracking } from '@/lib/monitoring/tracker'

export const PATCH = withTracking(async function PATCH(request: Request) {
  const auth = await requireOpsUser()
  if (!auth.ok) return auth.response
  const supabase = createAdminClient()
  try {
    const body = await request.json()
    if (!body.ids || !Array.isArray(body.ids)) {
      return NextResponse.json({ error: 'ids array is required' }, { status: 400 })
    }
    const data = await markBenachrichtigungenGelesen(supabase, {
      organizationId: auth.organizationId,
      ids: body.ids,
      empfaengerId: auth.userId,
    })
    return NextResponse.json(data)
  } catch (e: any) {
    return apiErrorResponse(e, request)
  }
})
