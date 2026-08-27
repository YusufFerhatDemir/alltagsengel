import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePersonalAdmin } from '@/lib/personal/api-auth'
import { listZeitkorrekturen } from '@/lib/personal/zeitkorrekturen'
import { withTracking } from '@/lib/monitoring/tracker'

export const GET = withTracking(async function GET(req: NextRequest) {
  try {
    const auth = await requirePersonalAdmin('personal.lesen')
    if (!auth.ok) return auth.response
    const supabase = createAdminClient()

    const sp = req.nextUrl.searchParams
    const caregiverId = sp.get('caregiverId') ?? undefined
    const arbeitszeitId = sp.get('arbeitszeitId') ?? undefined
    const limit = sp.get('limit') ? Number(sp.get('limit')) : undefined

    const data = await listZeitkorrekturen(supabase, {
      organizationId: auth.ctx.organizationId,
      caregiverId,
      arbeitszeitId,
      limit,
    })
    return NextResponse.json(data)
  } catch (e: any) {
    return apiErrorResponse(e, req)
  }
})
