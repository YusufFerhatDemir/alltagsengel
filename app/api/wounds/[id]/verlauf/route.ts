import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireWundenAdmin } from '@/lib/wunden/api-auth'
import { listAssessments, verlaufAusAssessments } from '@/lib/wunden/assessments'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const auth = await requireWundenAdmin('pflege.lesen')
    if (!auth.ok) return auth.response

    const admin = createAdminClient()
    const assessments = await listAssessments(admin, id, auth.ctx.organizationId)
    return NextResponse.json({ verlauf: verlaufAusAssessments(assessments) })
  } catch (err) {
    return safeApiError(err, _request)
  }
}
