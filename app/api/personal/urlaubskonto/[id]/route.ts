import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePersonalAdmin } from '@/lib/personal/api-auth'
import { updateUrlaubskonto } from '@/lib/personal/urlaubskonto'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requirePersonalAdmin()
    if (!auth.ok) return auth.response
    const supabase = createAdminClient()

    const { id } = await params
    const body = await req.json()
    const data = await updateUrlaubskonto(supabase, id, body)
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 })
  }
}
