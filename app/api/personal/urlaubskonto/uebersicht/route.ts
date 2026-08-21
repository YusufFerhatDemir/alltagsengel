import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePersonalAdmin } from '@/lib/personal/api-auth'
import { listUrlaubsUebersicht } from '@/lib/personal/urlaubskonto'

export async function GET(req: NextRequest) {
  try {
    const auth = await requirePersonalAdmin()
    if (!auth.ok) return auth.response
    const supabase = createAdminClient()

    const sp = req.nextUrl.searchParams
    const jahrRaw = sp.get('jahr')
    const jahr = jahrRaw ? Number(jahrRaw) : undefined

    const data = await listUrlaubsUebersicht(supabase, auth.ctx.organizationId, jahr)
    return NextResponse.json(data)
  } catch (e: any) {
    return apiErrorResponse(e, req)
  }
}
