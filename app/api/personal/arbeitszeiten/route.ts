import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePersonalAdmin } from '@/lib/personal/api-auth'
import { createArbeitszeit, listArbeitszeiten } from '@/lib/personal/arbeitszeiten'

export async function GET(req: NextRequest) {
  try {
    const auth = await requirePersonalAdmin()
    if (!auth.ok) return auth.response
    const supabase = createAdminClient()

    const sp = req.nextUrl.searchParams
    const caregiverId = sp.get('caregiverId') ?? undefined
    const datumVon = sp.get('datumVon') ?? undefined
    const datumBis = sp.get('datumBis') ?? undefined
    const status = sp.get('status') ?? undefined
    const nurGesperrt = sp.get('nurGesperrt') === 'true' ? true : undefined

    const data = await listArbeitszeiten(supabase, {
      organizationId: auth.ctx.organizationId,
      caregiverId,
      datumVon,
      datumBis,
      status: status as any,
      nurGesperrt,
    })
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requirePersonalAdmin()
    if (!auth.ok) return auth.response
    const supabase = createAdminClient()

    const body = await req.json()
    const data = await createArbeitszeit(supabase, body)
    return NextResponse.json(data, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 })
  }
}
