import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsUser } from '@/lib/ops/api-auth'
import { markBenachrichtigungenGelesen } from '@/lib/ops/benachrichtigungen'

export async function PATCH(request: Request) {
  const auth = await requireOpsUser()
  if (!auth.ok) return auth.response
  const supabase = createAdminClient()
  try {
    const body = await request.json()
    if (!body.ids || !Array.isArray(body.ids)) {
      return NextResponse.json({ error: 'ids array is required' }, { status: 400 })
    }
    const data = await markBenachrichtigungenGelesen(supabase, {
      organizationId: auth.ctx.organizationId,
      ids: body.ids,
      empfaengerId: auth.ctx.userId,
    })
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 })
  }
}
