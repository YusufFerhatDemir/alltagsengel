import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePersonalAdmin } from '@/lib/personal/api-auth'
import { updateSchicht } from '@/lib/personal/dienstplan'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePersonalAdmin()
  if (!auth.ok) return auth.response
  const { id } = await params
  const supabase = createAdminClient()
  try {
    const body = await request.json()
    const data = await updateSchicht(supabase, id, auth.ctx.organizationId, body)
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 })
  }
}
