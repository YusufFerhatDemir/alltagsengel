import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePersonalAdmin } from '@/lib/personal/api-auth'
import { createAbwesenheit, listAbwesenheiten } from '@/lib/personal/abwesenheiten'
import type { AbwesenheitStatus, AbwesenheitTyp } from '@/lib/personal/types'

export async function GET(req: NextRequest) {
  try {
    const auth = await requirePersonalAdmin()
    if (!auth.ok) return auth.response
    const supabase = createAdminClient()

    const sp = req.nextUrl.searchParams
    const caregiverId = sp.get('caregiverId') ?? undefined
    const status = sp.get('status') ?? undefined
    const absenceType = sp.get('absenceType') ?? undefined
    const datumVon = sp.get('datumVon') ?? undefined
    const datumBis = sp.get('datumBis') ?? undefined

    const data = await listAbwesenheiten(supabase, {
      organizationId: auth.ctx.organizationId,
      caregiverId,
      status: status as AbwesenheitStatus | undefined,
      absenceType: absenceType as AbwesenheitTyp | undefined,
      datumVon,
      datumBis,
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
    const data = await createAbwesenheit(supabase, {
      ...body,
      erstelltVon: auth.ctx.userId,
    })
    return NextResponse.json(data, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 })
  }
}
