import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePflegeAdmin } from '@/lib/pflege/api-auth'
import { sperreAssessment } from '@/lib/sis'
import { withTracking } from '@/lib/monitoring/tracker'

/** POST — sperrt eine SIS endgültig (kein Entsperren vorgesehen). */
export const POST = withTracking(async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const auth = await requirePflegeAdmin('pflege.schreiben')
    if (!auth.ok) return auth.response

    const admin = createAdminClient()
    const assessment = await sperreAssessment(admin, id, auth.ctx.organizationId)

    return NextResponse.json({ assessment })
  } catch (err) {
    return apiErrorResponse(err, _request)
  }
})
