import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePersonalAdmin } from '@/lib/personal/api-auth'
import { listArbeitszeitKonto } from '@/lib/personal/arbeitszeiten'

export async function GET(req: NextRequest) {
  try {
    const auth = await requirePersonalAdmin('personal.lesen')
    if (!auth.ok) return auth.response
    const supabase = createAdminClient()

    const sp = req.nextUrl.searchParams
    const caregiverId = sp.get('caregiverId') ?? undefined
    const jahrRaw = sp.get('jahr')
    const monatRaw = sp.get('monat')
    const jahr = jahrRaw ? Number(jahrRaw) : undefined
    const monat = monatRaw ? Number(monatRaw) : undefined

    const data = await listArbeitszeitKonto(supabase, auth.ctx.organizationId, caregiverId, jahr, monat)
    return NextResponse.json(data)
  } catch (e: any) {
    return apiErrorResponse(e, req)
  }
}
