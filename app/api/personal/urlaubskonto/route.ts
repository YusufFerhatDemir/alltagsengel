import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePersonalAdmin } from '@/lib/personal/api-auth'
import { createUrlaubskonto, listUrlaubskonten } from '@/lib/personal/urlaubskonto'
import { withTracking } from '@/lib/monitoring/tracker'

export const GET = withTracking(async function GET(req: NextRequest) {
  try {
    const auth = await requirePersonalAdmin('personal.lesen')
    if (!auth.ok) return auth.response
    const supabase = createAdminClient()

    const sp = req.nextUrl.searchParams
    const caregiverId = sp.get('caregiverId') ?? undefined
    const jahrRaw = sp.get('jahr')
    const jahr = jahrRaw ? Number(jahrRaw) : undefined

    const data = await listUrlaubskonten(supabase, { organizationId: auth.ctx.organizationId, caregiverId, jahr })
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
    const data = await createUrlaubskonto(supabase, {
      ...body,
      // Mandant kommt aus dem Auth-Kontext und darf nicht aus dem Body kommen.
      organizationId: auth.ctx.organizationId,
    })
    return NextResponse.json(data, { status: 201 })
  } catch (e: any) {
    return apiErrorResponse(e, req)
  }
})
