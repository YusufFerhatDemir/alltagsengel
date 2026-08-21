import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePflegeAdmin } from '@/lib/pflege/api-auth'
import { abschliessenAssessment, wiedereroeffnenAssessment } from '@/lib/sis'

/** POST { wiedereroeffnen?: boolean } — schließt ab bzw. öffnet wieder als Entwurf. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const auth = await requirePflegeAdmin()
    if (!auth.ok) return auth.response

    const body = await request.json().catch(() => ({}))
    const admin = createAdminClient()
    const assessment = body.wiedereroeffnen === true
      ? await wiedereroeffnenAssessment(admin, id, auth.ctx.organizationId)
      : await abschliessenAssessment(admin, id, auth.ctx.organizationId, auth.ctx.userId)

    return NextResponse.json({ assessment })
  } catch (err) {
    return apiErrorResponse(err, request)
  }
}
