import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePersonalAdmin } from '@/lib/personal/api-auth'
import { updateEintrag, deleteEintrag } from '@/lib/personal/dienstplan'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePersonalAdmin()
  if (!auth.ok) return auth.response
  const { id } = await params
  const supabase = createAdminClient()
  try {
    const body = await request.json()
    const data = await updateEintrag(supabase, id, auth.ctx.organizationId, body)
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 })
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePersonalAdmin()
  if (!auth.ok) return auth.response
  const { id } = await params
  const supabase = createAdminClient()
  try {
    await deleteEintrag(supabase, id, auth.ctx.organizationId)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 })
  }
}
