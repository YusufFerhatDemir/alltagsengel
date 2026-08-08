import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsUser } from '@/lib/ops/api-auth'
import { markNachrichtGelesen } from '@/lib/ops/nachrichten'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireOpsUser()
  if (!auth.ok) return auth.response
  const { id: nachrichtId } = await params
  const supabase = createAdminClient()
  try {
    const data = await markNachrichtGelesen(supabase, {
      organizationId: auth.ctx.organizationId,
      nachrichtId,
      empfaengerId: auth.ctx.userId,
    })
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 })
  }
}
