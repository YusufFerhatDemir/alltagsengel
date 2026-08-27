import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePflegeAdmin } from '@/lib/pflege/api-auth'
import { freigebenPlan } from '@/lib/pflege/massnahmenplaene'
import { withTracking } from '@/lib/monitoring/tracker'

/** POST — gibt einen Entwurf frei (status='aktiv') und löst den bisherigen aktiven Plan ab. */
export const POST = withTracking(async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const auth = await requirePflegeAdmin('pflege.schreiben')
    if (!auth.ok) return auth.response

    const admin = createAdminClient()
    const plan = await freigebenPlan(admin, id, auth.ctx.organizationId, auth.ctx.userId)

    return NextResponse.json({ plan })
  } catch (err) {
    return apiErrorResponse(err, _request)
  }
})
