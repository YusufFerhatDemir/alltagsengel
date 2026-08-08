import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { updateWiedervorlage } from '@/lib/ops/wiedervorlagen'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireOpsAdmin()
  if (!auth.ok) return auth.response
  const { id } = await params
  const supabase = createAdminClient()
  try {
    const body = await request.json()
    const data = await updateWiedervorlage(supabase, {
      organizationId: auth.ctx.organizationId,
      id,
      data: body,
    })
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 })
  }
}
