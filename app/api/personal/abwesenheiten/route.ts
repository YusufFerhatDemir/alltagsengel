import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePersonalAdmin } from '@/lib/personal/api-auth'
import { createAbwesenheit, listAbwesenheiten } from '@/lib/personal/abwesenheiten'
import type { AbwesenheitStatus, AbwesenheitTyp } from '@/lib/personal/types'
import { withTracking } from '@/lib/monitoring/tracker'

export const GET = withTracking(async function GET(req: NextRequest) {
  try {
    const auth = await requirePersonalAdmin('personal.lesen')
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
    return apiErrorResponse(e, req)
  }
})

export const POST = withTracking(async function POST(req: NextRequest) {
  try {
    const auth = await requirePersonalAdmin('personal.schreiben')
    if (!auth.ok) return auth.response
    const supabase = createAdminClient()

    const body = await req.json()
    const data = await createAbwesenheit(supabase, {
      ...body,
      // Mandant und Urheber kommen aus dem Auth-Kontext und duerfen
      // nicht aus dem Request-Body ueberschrieben werden.
      organizationId: auth.ctx.organizationId,
      erstelltVon: auth.ctx.userId,
    })
    return NextResponse.json(data, { status: 201 })
  } catch (e: any) {
    return apiErrorResponse(e, req)
  }
})
