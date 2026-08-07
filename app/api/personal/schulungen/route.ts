import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePersonalAdmin } from '@/lib/personal/api-auth'
import { listSchulungen, createSchulung } from '@/lib/personal/schulungen'

export async function GET(request: Request) {
  const auth = await requirePersonalAdmin()
  if (!auth.ok) return auth.response
  const supabase = createAdminClient()
  const url = new URL(request.url)
  const caregiverId = url.searchParams.get('caregiverId')
  const schulungsart = url.searchParams.get('schulungsart')
  try {
    const data = await listSchulungen(supabase, {
      organizationId: auth.ctx.organizationId,
      caregiverId: caregiverId || undefined,
      schulungsart: schulungsart || undefined,
    })
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 })
  }
}

export async function POST(request: Request) {
  const auth = await requirePersonalAdmin()
  if (!auth.ok) return auth.response
  const supabase = createAdminClient()
  try {
    const body = await request.json()
    const data = await createSchulung(supabase, {
      organizationId: auth.ctx.organizationId,
      erstelltVon: auth.ctx.userId,
      ...body,
    })
    return NextResponse.json(data, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 })
  }
}
