import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePersonalAdmin } from '@/lib/personal/api-auth'
import { listStammdaten, getStammdaten, updateStammdaten } from '@/lib/personal/stammdaten'
import type { Vertragsstatus } from '@/lib/personal/types'

export async function GET(request: Request) {
  const auth = await requirePersonalAdmin()
  if (!auth.ok) return auth.response
  const supabase = createAdminClient()
  const url = new URL(request.url)
  const caregiverId = url.searchParams.get('caregiverId')
  const vertragsstatus = url.searchParams.get('vertragsstatus')
  const search = url.searchParams.get('search')
  try {
    if (caregiverId) {
      const data = await getStammdaten(supabase, caregiverId, auth.ctx.organizationId)
      return NextResponse.json(data)
    }
    const data = await listStammdaten(supabase, {
      organizationId: auth.ctx.organizationId,
      vertragsstatus: (vertragsstatus || undefined) as Vertragsstatus | undefined,
      search: search || undefined,
    })
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 })
  }
}

export async function PATCH(request: Request) {
  const auth = await requirePersonalAdmin()
  if (!auth.ok) return auth.response
  const supabase = createAdminClient()
  const url = new URL(request.url)
  const caregiverId = url.searchParams.get('caregiverId')
  if (!caregiverId) {
    return NextResponse.json({ error: 'caregiverId is required' }, { status: 400 })
  }
  try {
    const body = await request.json()
    const data = await updateStammdaten(supabase, caregiverId, auth.ctx.organizationId, body)
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 })
  }
}
